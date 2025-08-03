const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function clearTestData() {
  console.log('Clearing test data...');
  
  // Delete production data first (due to foreign keys)
  await supabase.from('mix_artists').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('mixes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  // Delete staging data
  await supabase.from('raw_tracks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('raw_mixes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  console.log('Test data cleared!');
}

clearTestData().catch(console.error);