const { getMixDetectionDetails } = require('./dist/lib/content-classification/mix-detector');

// Test the specific videos that were being excluded by interview filter
const problematicVideos = [
  {
    title: "Folamour at Cathédrale Saint-Pierre in Geneva, Switzerland for Cercle & W Hotels",
    description: "This is an amazing performance. Join us for an interview with the artist after the show. Full set video.",
    duration: 114 * 60,
    channelName: "Cercle"
  },
  {
    title: "Mochakk at Plaza de España, in Sevilla, Spain for Cercle & Volcan X.A.",
    description: "Epic DJ set performance. Interview content available in description.",
    duration: 156 * 60,
    channelName: "Cercle"
  },
  {
    title: "Adriatique at Hatshepsut Temple in Luxor, Egypt for Cercle",
    description: "Live performance with interview segments",
    duration: 140 * 60,
    channelName: "Cercle"
  },
  // Non-Cercle channel to make sure we don't break other channels
  {
    title: "DJ Interview about mixing techniques",
    description: "This is actually an interview, not a performance",
    duration: 30 * 60,
    channelName: "Other Channel"
  }
];

console.log('🔧 Testing Interview Override Fix\\n');

problematicVideos.forEach((video, i) => {
  console.log(`${i + 1}. "${video.title}"`);
  console.log(`   Channel: ${video.channelName}`);
  console.log(`   Duration: ${Math.round(video.duration / 60)} minutes`);
  
  const result = getMixDetectionDetails(
    video.title,
    video.description,
    video.duration,
    video.channelName
  );
  
  const status = result.isMix ? "✅ MIX" : "❌ NOT MIX";
  console.log(`   Result: ${status} (score: ${result.score})`);
  console.log(`   Reasons: ${result.reasons.join(', ')}`);
  console.log();
});