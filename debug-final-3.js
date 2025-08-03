const { getMixDetectionDetails } = require('./dist/lib/content-classification/mix-detector');

// Test the 3 missing mixes with various possible description scenarios
const missingMixes = [
  {
    title: "Folamour at Cathédrale Saint-Pierre in Geneva, Switzerland for Cercle & W Hotels",
    duration: 114 * 60,
    scenarios: [
      "Folamour performing at Cathédrale Saint-Pierre for Cercle",
      "Live performance with interview segments and behind the scenes content",
      "DJ set performance. Interview available after the show. Making of documentary included.",
      "Folamour at Cathédrale Saint-Pierre. Full interview with the artist available."
    ]
  },
  {
    title: "Adriatique at Hatshepsut Temple in Luxor, Egypt for Cercle",
    duration: 140 * 60,
    scenarios: [
      "Adriatique performing at Hatshepsut Temple for Cercle",
      "Live performance with interview content and behind the scenes footage",
      "Amazing DJ set. Behind the scenes documentary and artist interview included.",
      "Adriatique live performance. Making of documentary available."
    ]
  },
  {
    title: "Cercle Story - Chapter One (melodic mix)",
    duration: 45 * 60,
    scenarios: [
      "Compilation mix from Cercle performances",
      "Melodic mix compilation featuring various Cercle artists",
      "Chapter one of our story - melodic compilation mix",
      "Cercle Story compilation with behind the scenes content"
    ]
  }
];

console.log('🔍 Debugging the Final 3 Missing Mixes\\n');

missingMixes.forEach((mix, i) => {
  console.log(`${i + 1}. "${mix.title}"`);
  console.log(`   Duration: ${Math.round(mix.duration / 60)} minutes`);
  console.log();
  
  mix.scenarios.forEach((description, j) => {
    console.log(`   Scenario ${j + 1}: "${description}"`);
    
    const result = getMixDetectionDetails(
      mix.title,
      description,
      mix.duration,
      'Cercle'
    );
    
    const status = result.isMix ? "✅ MIX" : "❌ NOT MIX";
    console.log(`   Result: ${status} (score: ${result.score})`);
    console.log(`   Reasons: ${result.reasons.join(', ')}`);
    console.log();
  });
  
  console.log('   ----------------------------------------');
  console.log();
});