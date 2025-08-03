import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables from .env.local
config({ path: '.env.local' });

interface MigrationRecord {
  filename: string;
  executedAt: string;
  checksum: string;
  success: boolean;
  error?: string;
}

class APIMigrationRunner {
  private supabaseUrl: string;
  private serviceKey: string;
  private migrationLogPath: string;

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL!;
    this.serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!this.supabaseUrl || !this.serviceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
    }

    this.migrationLogPath = join(__dirname, 'migration-log.json');
  }

  private loadMigrationLog(): MigrationRecord[] {
    if (!existsSync(this.migrationLogPath)) {
      return [];
    }
    
    try {
      const content = readFileSync(this.migrationLogPath, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.warn('⚠️  Could not read migration log, starting fresh');
      return [];
    }
  }

  private saveMigrationLog(records: MigrationRecord[]) {
    writeFileSync(this.migrationLogPath, JSON.stringify(records, null, 2));
  }

  private calculateChecksum(content: string): string {
    // Simple checksum using content length and first/last chars
    const hash = content.length + content.charCodeAt(0) + content.charCodeAt(content.length - 1);
    return hash.toString(16);
  }

  private async executeSqlViaAPI(sql: string): Promise<void> {
    // Create a temporary SQL function to execute our migration
    const functionName = `migrate_${Date.now()}`;
    
    const createFunctionSql = `
      CREATE OR REPLACE FUNCTION ${functionName}()
      RETURNS void
      LANGUAGE plpgsql
      AS $$
      BEGIN
        ${sql.replace(/;/g, ';\n')}
      END;
      $$;
    `;

    const callFunctionSql = `SELECT ${functionName}();`;
    const dropFunctionSql = `DROP FUNCTION IF EXISTS ${functionName}();`;

    try {
      // Step 1: Create the function
      await this.executeRPC(createFunctionSql);
      
      // Step 2: Call the function
      await this.executeRPC(callFunctionSql);
      
      // Step 3: Clean up the function
      await this.executeRPC(dropFunctionSql);
      
    } catch (err) {
      // Try to clean up even if execution failed
      try {
        await this.executeRPC(dropFunctionSql);
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  private async executeRPC(sql: string): Promise<any> {
    const response = await fetch(`${this.supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.serviceKey}`,
        'apikey': this.serviceKey,
      },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SQL execution failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  }

  private async executeSqlFile(filename: string): Promise<{ success: boolean; error?: string }> {
    const filePath = join(__dirname, filename);
    
    if (!existsSync(filePath)) {
      return { success: false, error: `Migration file not found: ${filename}` };
    }

    const sql = readFileSync(filePath, 'utf-8');
    
    try {
      console.log(`📄 Executing ${filename}...`);
      
      await this.executeSqlViaAPI(sql);
      
      console.log(`✅ ${filename} executed successfully`);
      return { success: true };
      
    } catch (err) {
      const error = `Failed to execute ${filename}: ${err}`;
      console.error(`❌ ${error}`);
      return { success: false, error };
    }
  }

  async runMigrations(): Promise<void> {
    const migrationFiles = [
      '001_create_staging_tables.sql',
      '002_add_production_columns.sql'
    ];

    console.log('🔄 Starting migration process...');
    
    const migrationLog = this.loadMigrationLog();
    const newRecords: MigrationRecord[] = [...migrationLog];

    for (const filename of migrationFiles) {
      // Check if migration was already executed
      const existingRecord = migrationLog.find(record => record.filename === filename);
      
      if (existingRecord && existingRecord.success) {
        console.log(`⏭️  Skipping ${filename} (already executed at ${existingRecord.executedAt})`);
        continue;
      }

      // Read file and calculate checksum
      const filePath = join(__dirname, filename);
      const content = readFileSync(filePath, 'utf-8');
      const checksum = this.calculateChecksum(content);

      // Check if file changed since last execution
      if (existingRecord && existingRecord.checksum !== checksum) {
        console.log(`⚠️  ${filename} has changed since last execution, re-running...`);
      }

      // Execute migration
      const result = await this.executeSqlFile(filename);
      
      // Update migration log
      const record: MigrationRecord = {
        filename,
        executedAt: new Date().toISOString(),
        checksum,
        success: result.success,
        error: result.error
      };

      // Remove old record if exists and add new one
      const index = newRecords.findIndex(r => r.filename === filename);
      if (index >= 0) {
        newRecords[index] = record;
      } else {
        newRecords.push(record);
      }

      // Save log after each migration
      this.saveMigrationLog(newRecords);

      if (!result.success) {
        console.log('\n📋 Manual execution may be required for:');
        console.log(content);
        console.log(`\nExecute at: https://supabase.com/dashboard/project/ejkroycvspthfvjussim/sql`);
      }
    }

    console.log('🎉 Migration process completed!');
    this.printMigrationSummary(newRecords);
  }

  private printMigrationSummary(records: MigrationRecord[]) {
    console.log('\n📊 Migration Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    for (const record of records) {
      const status = record.success ? '✅' : '❌';
      const date = new Date(record.executedAt).toLocaleString();
      console.log(`${status} ${record.filename.padEnd(35)} ${date}`);
      
      if (record.error) {
        console.log(`   Error: ${record.error}`);
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const successful = records.filter(r => r.success).length;
    const failed = records.filter(r => !r.success).length;
    
    console.log(`Total: ${records.length} | Successful: ${successful} | Failed: ${failed}`);
  }

  async showStatus(): Promise<void> {
    const migrationLog = this.loadMigrationLog();
    
    if (migrationLog.length === 0) {
      console.log('📋 No migrations have been run yet.');
      return;
    }

    this.printMigrationSummary(migrationLog);
  }
}

async function main() {
  const command = process.argv[2] || 'run';
  const runner = new APIMigrationRunner();

  try {
    switch (command) {
      case 'run':
        await runner.runMigrations();
        break;
      case 'status':
        await runner.showStatus();
        break;
      default:
        console.log('Usage: ts-node migrate-api.ts [run|status]');
        process.exit(1);
    }

  } catch (err) {
    console.error('💥 Migration failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}