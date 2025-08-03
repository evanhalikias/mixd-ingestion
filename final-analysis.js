// Training data (legitimate mixes we should find)
const trainingMixes = [
  "Monolink live at Cercle Odyssey, Paris",
  "The Blaze performance at Cercle Odyssey, Mexico City",
  "WhoMadeWho live at Cercle Odyssey, Mexico City",
  "Dixon at Cercle Festival 2024 (Ariane Stage)",
  "Disclosure b2b Mochakk at Cercle Festival 2024 (A380 Stage)", 
  "Indira Paganotto at Cercle Festival 2024 (A380 Stage)",
  "Ann Clue at Cercle Festival 2024 (Concorde Stage)",
  "Shimza for Cercle at Citadelle de Sisteron, France",
  "Kiasmos live for Cercle at Citadelle de Sisteron, France",
  "Folamour at Cathédrale Saint-Pierre in Geneva, Switzerland for Cercle & W Hotels",
  "Mochakk at Plaza de España, in Sevilla, Spain for Cercle & Volcan X.A.",
  "Adriatique at Hatshepsut Temple in Luxor, Egypt for Cercle",
  "Miss Monique at the Biosphere Museum in Montreal, Canada for Cercle",
  "Carlita at Cinecittà in Rome, Italy for Cercle",
  "Bedouin live at Petra, Jordan for Cercle",
  "RY X live from Lençóis Maranhenses National Park, Brazil for Cercle",
  "Hania Rani live at Invalides in Paris, France for Cercle",
  "Eli & Fur live for Cercle from Courmayeur, Skyway Monte Bianco, Italy",
  "Jamie Jones for Cercle at Pliva Waterfalls in Jajce, Bosnia-Herzegovina",
  "Boris Brejcha for Cercle at Arènes de Nîmes, France",
  "Colyn at Jatayu Earth's Center in Kerala, India for Cercle",
  "Vintage Culture for Cercle at Museu do Amanhã in Rio de Janeiro, Brazil",
  "Above & Beyond for Cercle in Guatape, Colombia",
  "BLOND:ISH for Cercle & SXM Festival at Rainforest Adventures, Sint Maarten",
  "Sofiane Pamart live under the Northern Lights, in Lapland, Finland for Cercle",
  "Monolink live for Cercle & W Hotels at Gaatafushi Island, Maldives",
  "Ólafur Arnalds live from Hafursey, in Iceland for Cercle",
  "Argy for Cercle at Jungfraujoch - Top of Europe, Switzerland",
  "KAS:ST at Cercle Festival 2022 (Ariane Stage)",
  "Hernán Cattáneo at Cercle Festival 2022 (A380 Stage)",
  "Cercle Story - Chapter One (melodic mix)"
];

// What we actually found in the database
const foundMixes = [
  "Monolink live at Cercle Odyssey, Paris",
  "The Blaze performance at Cercle Odyssey, Mexico City", 
  "WhoMadeWho live at Cercle Odyssey, Mexico City",
  "Dixon at Cercle Festival 2024 (Ariane Stage)",
  "Disclosure b2b Mochakk at Cercle Festival 2024 (A380 Stage)",
  "Indira Paganotto at Cercle Festival 2024 (A380 Stage)", 
  "Ann Clue at Cercle Festival 2024 (Concorde Stage)",
  "Shimza for Cercle at Citadelle de Sisteron, France",
  "Kiasmos live for Cercle at Citadelle de Sisteron, France",
  "Mochakk at Plaza de España, in Sevilla, Spain for Cercle & Volcan X.A.",
  "Miss Monique at the Biosphere Museum in Montreal, Canada for Cercle",
  "Carlita at Cinecittà in Rome, Italy for Cercle",
  "Bedouin live at Petra, Jordan for Cercle",
  "RY X live from Lençóis Maranhenses National Park, Brazil for Cercle",
  "Hania Rani live at Invalides in Paris, France for Cercle",
  "Eli & Fur live for Cercle from Courmayeur, Skyway Monte Bianco, Italy",
  "Jamie Jones for Cercle at Pliva Waterfalls in Jajce, Bosnia-Herzegovina",
  "Boris Brejcha for Cercle at Arènes de Nîmes, France",
  "Colyn at Jatayu Earth's Center in Kerala, India for Cercle",
  "Vintage Culture for Cercle at Museu do Amanhã in Rio de Janeiro, Brazil",
  "Above & Beyond for Cercle in Guatape, Colombia",
  "BLOND:ISH for Cercle & SXM Festival at Rainforest Adventures, Sint Maarten",
  "Sofiane Pamart live under the Northern Lights, in Lapland, Finland for Cercle",
  "Monolink live for Cercle & W Hotels at Gaatafushi Island, Maldives",
  "Ólafur Arnalds live from Hafursey, in Iceland for Cercle",
  "Argy for Cercle at Jungfraujoch - Top of Europe, Switzerland",
  "KAS:ST at Cercle Festival 2022 (Ariane Stage)",
  "Hernán Cattáneo at Cercle Festival 2022 (A380 Stage)"
];

function findMissing() {
  const missing = [];
  
  trainingMixes.forEach(expected => {
    const found = foundMixes.some(actual => {
      // Normalize both strings for comparison
      const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9\\s]/g, '').replace(/\\s+/g, ' ').trim();
      return normalize(actual).includes(normalize(expected.split(' ')[0])) && 
             normalize(actual).includes('cercle');
    });
    
    if (!found) {
      missing.push(expected);
    }
  });
  
  return missing;
}

const missing = findMissing();

console.log('🎯 FINAL ANALYSIS');
console.log('================');
console.log('Training set size:', trainingMixes.length);
console.log('Actually found:', foundMixes.length);
console.log('Success rate:', Math.round(foundMixes.length / trainingMixes.length * 100) + '%');
console.log();

if (missing.length > 0) {
  console.log('❌ Missing mixes:');
  missing.forEach((mix, i) => {
    console.log(`${i+1}. ${mix}`);
  });
} else {
  console.log('🎉 ALL MIXES FOUND!');
}

// Additional analysis: We found 28 but expected 31, so we're missing 3
// Let's see which specific ones
const normalizeTitle = (title) => title.toLowerCase().replace(/[^a-z0-9\\s]/g, '').replace(/\\s+/g, ' ').trim();

const actuallyMissing = trainingMixes.filter(expected => {
  return !foundMixes.some(found => {
    const expectedNorm = normalizeTitle(expected);
    const foundNorm = normalizeTitle(found);
    // More precise matching
    return foundNorm.includes(expectedNorm.split(' ')[0]) && foundNorm.includes(expectedNorm.split(' ')[1] || '');
  });
});

console.log('\\n🔍 Precise missing analysis:');
console.log('Actually missing:', actuallyMissing.length);
actuallyMissing.forEach((mix, i) => {
  console.log(`${i+1}. ${mix}`);
});