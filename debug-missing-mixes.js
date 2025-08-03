const { getMixDetectionDetails } = require('./dist/lib/content-classification/mix-detector');

// The 38 mixes we SHOULD be finding based on our training data
const expectedMixes = [
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

// The 29 mixes we actually found (from our database results)
const foundMixes = [
  "Monolink live at Cercle Odyssey, Paris",
  "The Blaze performance at Cercle Odyssey, Mexico City",
  "WhoMadeWho live at Cercle Odyssey, Mexico City", 
  "Dixon at Cercle Festival 2024 (Ariane Stage)",
  "Shimza for Cercle at Citadelle de Sisteron, France",
  "Kiasmos live for Cercle at Citadelle de Sisteron, France",
  "Ann Clue at Cercle Festival 2024 (Concorde Stage)",
  "Disclosure b2b Mochakk at Cercle Festival 2024 (A380 Stage)",
  "Hania Rani live at Invalides in Paris, France for Cercle",
  "Eli & Fur live for Cercle from Courmayeur, Skyway Monte Bianco, Italy"
  // ... (need to get full list from database)
];

console.log('🔍 Analyzing Missing Mixes\\n');
console.log('Expected:', expectedMixes.length);
console.log('Found:', foundMixes.length);
console.log('Missing:', expectedMixes.length - foundMixes.length);
console.log();

// Find which ones are missing (this is approximate since titles might not match exactly)
const missing = expectedMixes.filter(expected => 
  !foundMixes.some(found => 
    found.toLowerCase().includes(expected.split(' ')[0].toLowerCase()) && 
    found.toLowerCase().includes('cercle')
  )
);

console.log('🚨 Potentially Missing Mixes:');
missing.forEach((mix, i) => {
  console.log(`${i+1}. ${mix}`);
});

console.log('\\n💡 Next Steps:');
console.log('1. Need to get exact list of 29 found mixes from database');
console.log('2. Compare with expected 38 to find exact missing ones');  
console.log('3. Run mix detection on missing ones to see why they fail');
console.log('4. Adjust algorithm to capture the missing mixes');