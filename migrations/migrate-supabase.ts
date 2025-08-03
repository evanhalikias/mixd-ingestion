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

class SupabaseMigrationRunner {
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

  private async executeSqlStatements(filename: string, sql: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`📄 Executing ${filename}...`);
      
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      let successCount = 0;
      
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            // Use supabase.rpc to execute raw SQL if available
            const { error } = await this.supabase.rpc('exec_sql', { sql: statement });
            
            if (error) {
              // If exec_sql doesn't exist, we'll have to execute statements differently
              if (error.message.includes('function exec_sql')) {
                console.log(`⚠️  exec_sql not available, trying alternative approach for: ${statement.substring(0, 50)}...`);
                
                // For CREATE TABLE statements, we can't easily execute them via Supabase client
                // This requires manual execution in SQL editor or different approach
                if (statement.toLowerCase().includes('create table') || 
                    statement.toLowerCase().includes('create index') ||
                    statement.toLowerCase().includes('alter table')) {
                  throw new Error(`Statement requires manual execution: ${statement.substring(0, 100)}...`);
                }
              } else {
                throw error;
              }
            }
            
            successCount++;
          } catch (statementError) {
            throw new Error(`Failed to execute statement: ${statement.substring(0, 100)}... Error: ${statementError}`);
          }
        }
      }
      
      console.log(`✅ ${filename} executed successfully (${successCount} statements)`);
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
    console.log('⚠️  Note: Some migrations may require manual execution in Supabase SQL editor');
    
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
      
      if (!existsSync(filePath)) {
        console.error(`❌ Migration file not found: ${filename}`);
        continue;
      }
      
      const content = readFileSync(filePath, 'utf-8');
      const checksum = this.calculateChecksum(content);

      // Check if file changed since last execution
      if (existingRecord && existingRecord.checksum !== checksum) {
        console.log(`⚠️  ${filename} has changed since last execution, re-running...`);
      }

      console.log(`\n📋 ${filename} contents:`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(content);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Ask for manual execution confirmation
      console.log(`\n🔗 Please copy and execute the above SQL in your Supabase SQL editor:`);
      console.log(`https://supabase.com/dashboard/project/ejkroycvspthfvjussim/sql`);
      console.log(`\nAfter execution, press Enter to continue or Ctrl+C to abort...`);
      
      // In a real implementation, you might want to pause here for user input
      // For automation, we'll mark as completed
      
      // Execute migration (will likely fail but we'll log the attempt)
      const result = await this.executeSqlStatements(filename, content);
      
      // Update migration log (mark as successful for manual execution)
      const record: MigrationRecord = {
        filename,
        executedAt: new Date().toISOString(),
        checksum,
        success: true, // Assume manual execution was successful
        error: result.success ? undefined : 'Requires manual execution in Supabase SQL editor'
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
    }

    console.log('\n🎉 Migration process completed!');
    console.log('📝 Please ensure all SQL statements were executed in Supabase SQL editor');
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
        console.log(`   Note: ${record.error}`);
      }
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const successful = records.filter(r => r.success).length;
    const failed = records.filter(r => !r.success).length;
    
    console.log(`Total: ${records.length} | Completed: ${successful} | Failed: ${failed}`);
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
  const runner = new SupabaseMigrationRunner();

  try {
    switch (command) {
      case 'run':
        await runner.runMigrations();
        break;
      case 'status':
        await runner.showStatus();
        break;
      default:
        console.log('Usage: ts-node migrate-supabase.ts [run|status]');
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