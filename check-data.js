const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function checkData() {
  const { data: rawMix } = await supabase
    .from('raw_mixes')
    .select('raw_title, raw_artist, raw_description')
    .limit(1)
    .single();
    
  console.log('Raw Mix Data:');
  console.log('Title:', rawMix?.raw_title);
  console.log('Artist:', rawMix?.raw_artist);
  console.log('Description preview:', rawMix?.raw_description?.substring(0, 200) + '...');
  
  const { data: mixData } = await supabase
    .from('mixes')
    .select('title, mix_artists(artists(name, role))')
    .limit(1)
    .single();
    
  console.log('\nProduction Mix Data:');
  console.log('Title:', mixData?.title);
  console.log('Artists:', mixData?.mix_artists);
}

checkData().catch(console.error);