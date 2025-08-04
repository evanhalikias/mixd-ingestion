#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });

async function testWorkingChannel() {
  console.log('🧪 Testing with a known working channel...\n');
  
  try {
    // Import the YouTube worker
    const { YouTubeWorker } = await import('./dist/workers/youtube-worker.js');
    
    const worker = new YouTubeWorker();
    
    // Test with a major music channel that should definitely work
    // Using Monstercat which is a popular EDM label with public content
    const configs = [
      {
        name: 'Monstercat (by URL)',
        config: {
          channels: ['https://www.youtube.com/user/MonstercatMedia'],
          maxResults: 3,
          dateRange: {
            from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            to: new Date()
          }
        }
      },
      {
        name: 'Cercle (original that should work)',
        config: {
          channels: ['https://www.youtube.com/c/Cercle'],
          maxResults: 3,
          dateRange: {
            from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            to: new Date()
          }
        }
      }
    ];
    
    for (const testCase of configs) {
      console.log(`\n🔄 Testing ${testCase.name}...`);
      
      try {
        const result = await worker.run(testCase.config);
        
        console.log('📊 Result:');
        console.log('Success:', result.success);
        console.log('Mixes found:', result.mixesFound);
        console.log('Mixes added:', result.mixesAdded);
        console.log('Errors:', result.errors.length);
        
        if (result.success && result.mixesFound > 0) {
          console.log('✅ This channel works! Using it will help isolate the issue.');
          break;
        } else if (result.errors.length > 0) {
          console.log('❌ Errors:', result.errors[0]);
        }
      } catch (error) {
        console.log('❌ Error:', error.message);
      }
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

testWorkingChannel().then(() => {
  console.log('\n🏁 Working channel test complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});