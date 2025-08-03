const { YouTubeWorker } = require('./dist/workers/youtube-worker');
const { getMixDetectionDetails } = require('./dist/lib/content-classification/mix-detector');

// Test specific videos that should be mixes but are being excluded
const testVideoIds = [
  'tRzDYkjMFtg', // Example - we need actual video IDs
  // We can get these from the backfill logs or by searching YouTube
];

async function debugYouTubeData() {
  console.log('🔍 Debugging YouTube API data vs our test expectations\n');
  
  const worker = new YouTubeWorker();
  
  // Get a few recent Cercle videos to see what the descriptions actually contain
  const videos = await worker.fetchChannelVideos('UCPKT_csvP72boVX0XrMtagQ', 20, undefined, false);
  
  console.log('📹 Sample YouTube videos with their actual descriptions:\n');
  
  videos.slice(0, 10).forEach((video, i) => {
    const duration = video.duration_seconds;
    
    console.log(`${i + 1}. "${video.raw_title}"`);
    console.log(`   Duration: ${Math.round(duration / 60)} minutes`);
    console.log(`   Description (first 200 chars): "${video.raw_description?.substring(0, 200)}..."`);
    
    // Test our mix detection on this real data
    const result = getMixDetectionDetails(
      video.raw_title,
      video.raw_description || '',
      duration,
      'Cercle'
    );
    
    const status = result.isMix ? "✅ MIX" : "❌ NOT MIX";
    console.log(`   Detection: ${status} (score: ${result.score})`);
    console.log(`   Reasons: ${result.reasons.join(', ')}`);
    
    // If it's a long video but not detected as mix, this is our problem
    if (duration >= 20 * 60 && !result.isMix) {
      console.log(`   🚨 ISSUE: Long video not detected as mix!`);
      console.log(`   Full description: "${video.raw_description}"`);
    }
    
    console.log();
  });
}

// Load environment and run
require('dotenv').config({ path: '.env.local' });
debugYouTubeData().catch(console.error);