const { getMixDetectionDetails } = require('./dist/lib/content-classification/mix-detector');

// Debug why "Cercle Story" isn't being detected as a Cercle performance
const title = "Cercle Story - Chapter One (melodic mix)";
const channelName = "Cercle";

console.log('🔍 Debugging Cercle Story Detection\\n');
console.log('Title:', title);
console.log('Channel:', channelName);
console.log();

// Check each condition in our isCerclePerformance logic
const titleLower = title.toLowerCase();
const channelLower = channelName.toLowerCase();
const duration = 45 * 60;
const isLongEnough = duration >= 20 * 60;

console.log('Conditions check:');
console.log('- Channel includes "cercle":', channelLower.includes('cercle'));
console.log('- Is long enough (20+ min):', isLongEnough);
console.log('- Title includes "for cercle":', titleLower.includes('for cercle'));
console.log('- Title includes "at cercle":', titleLower.includes('at cercle'));
console.log('- Title includes "live at":', titleLower.includes('live at'));
console.log('- Title includes "live for":', titleLower.includes('live for'));
console.log('- Title includes "live from":', titleLower.includes('live from'));
console.log('- Title matches at pattern:', /\\w+\\s+at\\s+\\w+.*for\\s+cercle/i.test(title));
console.log('- Title matches for pattern:', /\\w+\\s+for\\s+cercle\\s+at/i.test(title));
console.log('- Title includes "cercle festival":', /cercle festival/i.test(title));

const isCerclePerformance = channelLower.includes('cercle') && isLongEnough && (
  titleLower.includes('for cercle') ||
  titleLower.includes('at cercle') ||
  titleLower.includes('live at') ||
  titleLower.includes('live for') ||
  titleLower.includes('live from') ||
  /\\w+\\s+at\\s+\\w+.*for\\s+cercle/i.test(title) ||
  /\\w+\\s+for\\s+cercle\\s+at/i.test(title) ||
  /cercle festival/i.test(title)
);

console.log();
console.log('Overall isCerclePerformance:', isCerclePerformance);

if (!isCerclePerformance) {
  console.log();
  console.log('❌ ISSUE: "Cercle Story" is not being detected as a Cercle performance');
  console.log('💡 SOLUTION: Add pattern for "cercle story" or similar Cercle content');
}

// Test the actual detection
const result = getMixDetectionDetails(title, "Melodic compilation mix", duration, channelName);
console.log();
console.log('Mix detection result:');
console.log('- Is mix:', result.isMix);
console.log('- Score:', result.score);
console.log('- Reasons:', result.reasons.join(', '));