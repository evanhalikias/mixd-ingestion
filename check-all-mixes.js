const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function checkAllMixes() {
  const { data: rawMixes } = await supabase
    .from('raw_mixes')
    .select('raw_title, raw_artist, raw_metadata')
    .order('created_at', { ascending: false });
    
  console.log('🎵 All Ingested Mixes:\n');
  
  rawMixes?.forEach((mix, i) => {
    console.log(`${i + 1}. ${mix.raw_title}`);
    console.log(`   Artist: ${mix.raw_artist}`);
    console.log(`   Method: ${mix.raw_metadata?.artistExtraction?.method}`);
    console.log(`   Confidence: ${mix.raw_metadata?.artistExtraction?.confidence}`);
    console.log(`   Mix Score: ${mix.raw_metadata?.mixDetection?.score}`);
    console.log();
  });
}

checkAllMixes().catch(console.error);