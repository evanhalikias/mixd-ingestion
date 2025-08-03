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

class DirectMigrationRunner {
  private supabase: any;
  private migrationLogPath: string;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: 'public',
      },
    });
    
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

  private async executeSqlDirect(sql: string): Promise<void> {
    // Try multiple approaches to execute SQL
    
    // Method 1: Try using rpc with sql function
    try {
      const { error } = await this.supabase.rpc('exec_sql', { query: sql });
      if (!error) {
        return; // Success
      }
    } catch (err) {
      // Function doesn't exist, continue to next method
    }

    // Method 2: Try using REST API directly
    try {
      const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
        },
        body: JSON.stringify({ query: sql })
      });
      
      if (response.ok) {
        return; // Success
      }
    } catch (err) {
      // REST API failed, continue
    }

    // Method 3: Parse and execute individual statements
    await this.executeStatementsIndividually(sql);
  }

  private async executeStatementsIndividually(sql: string): Promise<void> {
    // Split SQL into individual statements
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        await this.executeStatement(statement);
      }
    }
  }

  private async executeStatement(statement: string): Promise<void> {
    // Try to identify statement type and execute appropriately
    const trimmed = statement.trim().toLowerCase();
    
    if (trimmed.startsWith('create table')) {
      await this.executeCreateTable(statement);
    } else if (trimmed.startsWith('create index')) {
      await this.executeCreateIndex(statement);
    } else if (trimmed.startsWith('alter table')) {
      await this.executeAlterTable(statement);
    } else {
      // For other statements, try a generic approach
      await this.executeGenericStatement(statement);
    }
  }

  private async executeCreateTable(statement: string): Promise<void> {
    // Extract table name and try to create via Supabase
    const match = statement.match(/create table\s+(\w+)/i);
    if (!match) {
      throw new Error(`Could not parse table name from: ${statement}`);
    }

    // For CREATE TABLE, we need to execute the raw SQL
    // Try using a dummy query to test if we can execute raw SQL
    try {
      const { error } = await this.supabase.rpc('exec_sql', { sql: statement });
      if (error) {
        throw error;
      }
    } catch (err) {
      // If exec_sql doesn't work, we'll need manual execution
      throw new Error(`CREATE TABLE requires manual execution: ${statement.substring(0, 100)}...`);
    }
  }

  private async executeCreateIndex(statement: string): Promise<void> {
    // Similar to CREATE TABLE
    try {
      const { error } = await this.supabase.rpc('exec_sql', { sql: statement });
      if (error) {
        throw error;
      }
    } catch (err) {
      // Index creation often fails in restricted environments
      console.warn(`⚠️  Index creation may require manual execution: ${statement.substring(0, 100)}...`);
    }
  }

  private async executeAlterTable(statement: string): Promise<void> {
    // ALTER TABLE statements
    try {
      const { error } = await this.supabase.rpc('exec_sql', { sql: statement });
      if (error) {
        throw error;
      }
    } catch (err) {
      throw new Error(`ALTER TABLE requires manual execution: ${statement.substring(0, 100)}...`);
    }
  }

  private async executeGenericStatement(statement: string): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('exec_sql', { sql: statement });
      if (error) {
        throw error;
      }
    } catch (err) {
      throw new Error(`Statement execution failed: ${statement.substring(0, 100)}...`);
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
      
      await this.executeSqlDirect(sql);
      
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
        console.log('\n📋 Manual execution required:');
        console.log('Please execute the following SQL in Supabase SQL editor:');
        console.log(`https://supabase.com/dashboard/project/ejkroycvspthfvjussim/sql`);
        console.log('\n' + content);
        // Don't throw error, just log it
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
  const runner = new DirectMigrationRunner();

  try {
    switch (command) {
      case 'run':
        await runner.runMigrations();
        break;
      case 'status':
        await runner.showStatus();
        break;
      default:
        console.log('Usage: ts-node migrate-direct.ts [run|status]');
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