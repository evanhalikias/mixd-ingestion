const { getMixDetectionDetails } = require('./dist/lib/content-classification/mix-detector');

// Test with actual Cercle videos the user mentioned
const cercleVideos = [
  {
    title: "Dixon at Cercle Festival 2024",
    duration: 75 * 60, // 75 minutes
    description: "Dixon performing at Cercle Festival 2024"
  },
  {
    title: "Shimza for Cercle",
    duration: 60 * 60, // 60 minutes
    description: "Shimza performing for Cercle"
  },
  {
    title: "Kiasmos live for Cercle",
    duration: 68 * 60, // 68 minutes
    description: "Kiasmos live for Cercle"
  },
  {
    title: "SOHMI for Cercle",
    duration: 45 * 60, // 45 minutes
    description: "SOHMI for Cercle"
  },
  {
    title: "Cassian for Cercle",
    duration: 52 * 60, // 52 minutes
    description: "Cassian for Cercle"
  },
  {
    title: "Behind Cercle | Maceo Plex at Chateau de Fontainebleau",
    duration: 12 * 60, // 12 minutes
    description: "Behind the scenes documentary"
  },
  {
    title: "Behind Cercle | SOHMI at Château de Versailles",
    duration: 8 * 60, // 8 minutes
    description: "Behind the scenes documentary"
  }
];

console.log('🎵 Testing Mix Detection on Actual Cercle Videos\n');

cercleVideos.forEach((video, i) => {
  console.log(`${i + 1}. "${video.title}"`);
  console.log(`   Duration: ${Math.round(video.duration / 60)} minutes`);
  
  const result = getMixDetectionDetails(
    video.title,
    video.description,
    video.duration,
    'Cercle'
  );
  
  const status = result.isMix ? "✅ MIX" : "❌ NOT MIX";
  console.log(`   Result: ${status} (score: ${result.score}, confidence: ${result.confidence})`);
  console.log(`   Reasons: ${result.reasons.join(', ')}`);
  console.log();
});