const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function checkMetadata() {
  const { data: rawMix } = await supabase
    .from('raw_mixes')
    .select('raw_title, raw_artist, raw_metadata')
    .limit(1)
    .single();
    
  console.log('Raw Mix:');
  console.log('Title:', rawMix?.raw_title);
  console.log('Artist:', rawMix?.raw_artist);
  console.log('\nArtist Extraction Metadata:');
  console.log(JSON.stringify(rawMix?.raw_metadata?.artistExtraction, null, 2));
}

checkMetadata().catch(console.error);