import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

interface MigrationRecord {
  filename: string;
  executedAt: string;
  checksum: string;
  success: boolean;
  error?: string;
}

class SimpleMigrationRunner {
  private supabase: any;
  private migrationLogPath: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
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

  private async createExecSqlFunction(): Promise<void> {
    const createFunctionSql = `
      CREATE OR REPLACE FUNCTION exec_sql(query text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        EXECUTE query;
      END;
      $$;
    `;

    try {
      // Try to create the function using raw SQL execution
      const { error } = await this.supabase.rpc('exec_sql', { query: createFunctionSql });
      
      if (error && error.message.includes('function "exec_sql" does not exist')) {
        // The function doesn't exist, so we need to create it differently
        console.log('⚙️  Creating exec_sql function...');
        
        // We'll have to do this manually first time
        throw new Error('exec_sql function needs to be created manually. Please run this in Supabase SQL editor first:\n\n' + createFunctionSql);
      }
      
      if (error) {
        throw error;
      }

      console.log('✅ exec_sql function ready');
    } catch (err) {
      throw new Error(`Failed to create exec_sql function: ${err}`);
    }
  }

  private async executeSqlFile(filename: string): Promise<{ success: boolean; error?: string }> {
    const filePath = join(__dirname, filename);
    
    if (!existsSync(filePath)) {
      return { success: false, error: `Migration file not found: ${filename}` };
    }

    const sql = readFileSync(filePath, 'utf-8');
    
    try {
      console.log(`📄 Executing ${filename}...`);
      
      // Try to execute using the exec_sql function
      const { error } = await this.supabase.rpc('exec_sql', { query: sql });
      
      if (error) {
        throw error;
      }
      
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
    
    // First, ensure we can execute SQL
    try {
      await this.createExecSqlFunction();
    } catch (err) {
      console.error('💥 Cannot create exec_sql function. Please create it manually first:');
      console.log(`
🔗 Go to: https://supabase.com/dashboard/project/ejkroycvspthfvjussim/sql

📝 Execute this SQL:

CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
END;
$$;

Then run the migration again.
      `);
      throw err;
    }
    
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
        throw new Error(`Migration failed: ${result.error}`);
      }
    }

    console.log('🎉 All migrations completed successfully!');
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
  const runner = new SimpleMigrationRunner();

  try {
    switch (command) {
      case 'run':
        await runner.runMigrations();
        break;
      case 'status':
        await runner.showStatus();
        break;
      default:
        console.log('Usage: ts-node simple-migrate.ts [run|status]');
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