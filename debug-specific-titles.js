const { getMixDetectionDetails } = require('./dist/lib/content-classification/mix-detector');

// Test specific Cercle performances that should be mixes
const cerclePerformances = [
  {
    title: "Folamour at Cathédrale Saint-Pierre in Geneva, Switzerland for Cercle & W Hotels",
    duration: 114 * 60, // 114 minutes
    description: "Folamour performing at Cathédrale Saint-Pierre for Cercle"
  },
  {
    title: "Mochakk at Plaza de España, in Sevilla, Spain for Cercle & Volcan X.A.",
    duration: 156 * 60, // 156 minutes  
    description: "Mochakk performing at Plaza de España for Cercle"
  },
  {
    title: "Adriatique at Hatshepsut Temple in Luxor, Egypt for Cercle",
    duration: 140 * 60, // 140 minutes
    description: "Adriatique performing at Hatshepsut Temple for Cercle"
  },
  {
    title: "Miss Monique at the Biosphere Museum in Montreal, Canada for Cercle",
    duration: 133 * 60, // 133 minutes
    description: "Miss Monique performing at the Biosphere Museum for Cercle"
  },
  {
    title: "Bedouin live at Petra, Jordan for Cercle",
    duration: 114 * 60, // 114 minutes
    description: "Bedouin performing live at Petra for Cercle"
  }
];

console.log('🎵 Testing Cercle Performance Detection\n');

cerclePerformances.forEach((video, i) => {
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