#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

async function testYouTubeWorkerDirect() {
  console.log('🧪 Testing YouTube worker directly with Cercle...\n');
  
  try {
    // Import the YouTube worker
    const { YouTubeWorker } = await import('./dist/workers/youtube-worker.js');
    
    const worker = new YouTubeWorker();
    
    console.log('🔄 Running YouTube worker directly...');
    
    // Test with the Cercle channel URL
    const config = {
      channels: ['https://www.youtube.com/c/Cercle'],
      maxResults: 5,
      dateRange: {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        to: new Date()
      }
    };
    
    console.log('Config:', config);
    
    const result = await worker.run(config);
    
    console.log('\n📊 Direct worker result:');
    console.log('Success:', result.success);
    console.log('Mixes found:', result.mixesFound);
    console.log('Mixes added:', result.mixesAdded);
    console.log('Mixes skipped:', result.mixesSkipped);
    console.log('Errors:', result.errors.length);
    console.log('Duration:', result.duration, 'ms');
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach((error, i) => {
        console.log(`${i + 1}. ${error}`);
      });
    }
    
    if (result.mixesFound > 0) {
      console.log('\n✅ Worker found content - this means the issue is in the job pipeline!');
    } else {
      console.log('\n❌ Worker found no content - this is a worker/API issue');
    }
    
  } catch (error) {
    console.error('💥 Direct worker test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testYouTubeWorkerDirect().then(() => {
  console.log('\n🏁 Direct worker test complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});