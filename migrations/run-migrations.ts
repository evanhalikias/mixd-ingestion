import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables from .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigrations() {
  const migrations = [
    '001_create_staging_tables.sql',
    '002_add_production_columns.sql'
  ];

  console.log('🔄 Running database migrations...');

  for (const migrationFile of migrations) {
    try {
      console.log(`📄 Running ${migrationFile}...`);
      
      const migrationPath = join(__dirname, migrationFile);
      const sql = readFileSync(migrationPath, 'utf-8');
      
      // Execute the migration
      const { error } = await supabase.rpc('exec_sql', { sql });
      
      if (error) {
        console.error(`❌ Error running ${migrationFile}:`, error);
        process.exit(1);
      }
      
      console.log(`✅ ${migrationFile} completed successfully`);
    } catch (err) {
      console.error(`❌ Failed to read or execute ${migrationFile}:`, err);
      process.exit(1);
    }
  }

  console.log('🎉 All migrations completed successfully!');
}

// Alternative method using direct SQL execution if exec_sql RPC doesn't exist
async function runMigrationsDirectly() {
  const migrations = [
    '001_create_staging_tables.sql',
    '002_add_production_columns.sql'
  ];

  console.log('🔄 Running database migrations directly...');

  for (const migrationFile of migrations) {
    try {
      console.log(`📄 Running ${migrationFile}...`);
      
      const migrationPath = join(__dirname, migrationFile);
      const sql = readFileSync(migrationPath, 'utf-8');
      
      // Split by semicolons and execute each statement
      const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
      
      for (const statement of statements) {
        const { error } = await supabase.from('pg_stat_statements').select('*').limit(0);
        // This is a hack - we'll need to run these manually via Supabase dashboard
      }
      
      console.log(`✅ ${migrationFile} prepared (run manually in Supabase SQL editor)`);
    } catch (err) {
      console.error(`❌ Failed to read ${migrationFile}:`, err);
      process.exit(1);
    }
  }

  console.log('📋 Migration files prepared. Please run them manually in Supabase SQL editor.');
}

if (require.main === module) {
  runMigrationsDirectly().catch(console.error);
}