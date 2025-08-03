import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
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

class MigrationRunner {
  private client: Client;
  private migrationLogPath: string;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this.client = new Client({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false } // Required for Supabase
    });

    this.migrationLogPath = join(__dirname, 'migration-log.json');
  }

  async connect() {
    await this.client.connect();
    console.log('✅ Connected to database');
  }

  async disconnect() {
    await this.client.end();
    console.log('✅ Disconnected from database');
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

  private async executeSqlFile(filename: string): Promise<{ success: boolean; error?: string }> {
    const filePath = join(__dirname, filename);
    
    if (!existsSync(filePath)) {
      return { success: false, error: `Migration file not found: ${filename}` };
    }

    const sql = readFileSync(filePath, 'utf-8');
    
    try {
      console.log(`📄 Executing ${filename}...`);
      
      // Execute the entire SQL content
      await this.client.query(sql);
      
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
  const runner = new MigrationRunner();

  try {
    await runner.connect();

    switch (command) {
      case 'run':
        await runner.runMigrations();
        break;
      case 'status':
        await runner.showStatus();
        break;
      default:
        console.log('Usage: ts-node migrate.ts [run|status]');
        process.exit(1);
    }

  } catch (err) {
    console.error('💥 Migration failed:', err);
    process.exit(1);
  } finally {
    await runner.disconnect();
  }
}

if (require.main === module) {
  main();
}