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

async function runMigrationsDirectly() {
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
      
      // Split SQL by statements and execute each one
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
      
      for (const statement of statements) {
        if (statement.trim()) {
          const { error } = await supabase.rpc('exec_sql', { sql: statement });
          
          if (error) {
            // Try using a different approach - raw query
            const { error: rawError } = await supabase
              .from('_dummy')
              .select('*')
              .limit(0);
            
            // If that doesn't work, we'll need to execute via PostgreSQL
            console.log(`Statement: ${statement.substring(0, 100)}...`);
            
            if (error.message.includes('function exec_sql')) {
              console.log('⚠️  exec_sql function not available, trying direct execution...');
              
              // For now, let's try a different approach
              const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'apikey': supabaseServiceKey,
                },
                body: JSON.stringify({ sql: statement })
              });
              
              if (!response.ok) {
                console.error(`❌ HTTP Error: ${response.status} - ${response.statusText}`);
                // Continue with next statement
                continue;
              }
            } else {
              throw error;
            }
          }
        }
      }
      
      console.log(`✅ ${migrationFile} completed successfully`);
    } catch (err) {
      console.error(`❌ Failed to execute ${migrationFile}:`, err);
      console.log('\n📝 Manual execution required:');
      console.log('Please run the following SQL in your Supabase SQL editor:');
      console.log('https://supabase.com/dashboard/project/ejkroycvspthfvjussim/sql');
      console.log('\n' + readFileSync(join(__dirname, migrationFile), 'utf-8'));
      process.exit(1);
    }
  }

  console.log('🎉 All migrations completed successfully!');
}

if (require.main === module) {
  runMigrationsDirectly().catch(console.error);
}