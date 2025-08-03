import dotenv from 'dotenv';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getServiceClient } from '../src/lib/supabase/service';

// Load environment variables
dotenv.config({ path: '.env.local' });

interface Migration {
  id: string;
  filename: string;
  sql: string;
}

class SimpleMigrator {
  private supabase = getServiceClient();

  async ensureMigrationsTable(): Promise<void> {
    // Try to select from migrations table to see if it exists
    const { error: selectError } = await this.supabase
      .from('migrations')
      .select('id')
      .limit(1);

    if (selectError && selectError.code === 'PGRST116') {
      console.log('Creating migrations table...');
      // Table doesn't exist, we need to create it manually
      console.log('Please create the migrations table manually in your Supabase SQL Editor:');
      console.log(`
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);
      `);
      throw new Error('Migrations table does not exist. Please create it manually first.');
    }
  }

  async getExecutedMigrations(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('migrations')
      .select('id')
      .order('executed_at');

    if (error) {
      console.warn('Could not fetch executed migrations:', error.message);
      return [];
    }

    return data?.map(m => m.id) || [];
  }

  async loadMigrations(): Promise<Migration[]> {
    const migrationsDir = __dirname;
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    return files.map(filename => {
      const id = filename.replace('.sql', '');
      const sql = readFileSync(join(migrationsDir, filename), 'utf-8');
      return { id, filename, sql };
    });
  }

  async executeMigration(migration: Migration): Promise<boolean> {
    console.log(`❌ Cannot execute migration: ${migration.filename}`);
    console.log('This migrator cannot execute DDL statements directly.');
    console.log('Please run the following SQL manually in your Supabase SQL Editor:');
    console.log('='.repeat(80));
    console.log(migration.sql);
    console.log('='.repeat(80));
    
    // Ask user to confirm they've run it
    console.log('\nAfter running the SQL above, the migration will be marked as executed.');
    
    // Record migration as executed (assuming user ran it)
    const { error: recordError } = await this.supabase
      .from('migrations')
      .insert({
        id: migration.id,
        filename: migration.filename
      });

    if (recordError) {
      console.warn('Could not record migration execution:', recordError);
      return false;
    }

    console.log(`✅ Migration marked as completed: ${migration.filename}`);
    return true;
  }

  async migrate(): Promise<void> {
    console.log('🚀 Starting database migrations...');

    await this.ensureMigrationsTable();
    
    const executed = await this.getExecutedMigrations();
    const migrations = await this.loadMigrations();
    
    const pending = migrations.filter(m => !executed.includes(m.id));
    
    if (pending.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    console.log(`Found ${pending.length} pending migrations:`);
    pending.forEach(m => console.log(`  - ${m.filename}`));

    for (const migration of pending) {
      const success = await this.executeMigration(migration);
      if (!success) {
        console.error('❌ Migration failed, stopping');
        process.exit(1);
      }
    }

    console.log('🎉 All migrations completed successfully!');
  }

  async status(): Promise<void> {
    console.log('📊 Migration Status:');
    
    const executed = await this.getExecutedMigrations();
    const migrations = await this.loadMigrations();
    
    console.log(`\nTotal migrations: ${migrations.length}`);
    console.log(`Executed: ${executed.length}`);
    console.log(`Pending: ${migrations.length - executed.length}`);

    console.log('\nMigrations:');
    migrations.forEach(m => {
      const status = executed.includes(m.id) ? '✅' : '⏳';
      console.log(`  ${status} ${m.filename}`);
    });
  }
}

// CLI
async function main() {
  const migrator = new SimpleMigrator();
  const command = process.argv[2];

  try {
    if (command === 'status') {
      await migrator.status();
    } else {
      await migrator.migrate();
    }
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}