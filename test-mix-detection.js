const { getMixDetectionDetails } = require('./src/lib/content-classification/mix-detector');

// Test cases
const testCases = [
  {
    name: "Monolink at Cercle (should be mix)",
    title: "Monolink live at Cercle Odyssey, Paris",
    description: "Monolink performing at Cercle Odyssey in Paris. A show where electronic and live instrumental music blend into one seamless journey.",
    duration: 3600, // 1 hour
    channelName: "Cercle"
  },
  {
    name: "Calvin Harris song (should NOT be mix)",
    title: "Calvin Harris - Summer (Official Video)",
    description: "Official music video for 'Summer' by Calvin Harris. Available on Spotify and iTunes.",
    duration: 210, // 3.5 minutes
    channelName: "Calvin Harris"
  },
  {
    name: "Deep House mix (should be mix)",
    title: "Deep House Mix 2024 | Best of Deep House Music | 1 Hour Mix",
    description: "Tracklist:\n00:00 Artist1 - Track1\n05:30 Artist2 - Track2\nDownload the mix at...",
    duration: 3600, // 1 hour
    channelName: "Deep House Nation"
  },
  {
    name: "Boiler Room set (should be mix)",
    title: "Amelie Lens | Boiler Room x Dekmantel Festival",
    description: "Amelie Lens recorded live at Boiler Room x Dekmantel Festival in Amsterdam",
    duration: 3900, // 65 minutes
    channelName: "Boiler Room"
  },
  {
    name: "Short song (should NOT be mix)",
    title: "New Progressive House Track 2024",
    description: "New single release. Buy on Beatport.",
    duration: 180, // 3 minutes
    channelName: "Enhanced Music"
  }
];

console.log("🎵 Mix Detection Test Results\n");

testCases.forEach((testCase, i) => {
  console.log(`${i + 1}. ${testCase.name}`);
  console.log(`   Title: "${testCase.title}"`);
  
  const result = getMixDetectionDetails(
    testCase.title,
    testCase.description,
    testCase.duration,
    testCase.channelName
  );
  
  const status = result.isMix ? "✅ MIX" : "❌ NOT MIX";
  console.log(`   Result: ${status} (${result.confidence}, score: ${result.score})`);
  console.log(`   Reasons: ${result.reasons.slice(0, 3).join(', ')}`);
  console.log();
});