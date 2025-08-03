const { getMixDetectionDetails } = require('./dist/lib/content-classification/mix-detector');
const { extractArtistsFromVideo } = require('./dist/lib/artist-extraction/intelligent-parser');

// Comprehensive Cercle catalog test based on YouTube screenshots
// This includes the major DJ performances and sets from Cercle's channel
const cercleCatalog = [
  // Recent Cercle Odyssey performances
  {
    title: "Monolink live at Cercle Odyssey, Paris",
    duration: 104 * 60,
    description: "Monolink performing at Cercle Odyssey in Paris",
    expectedArtist: "Monolink",
    expectedLocation: "Paris",
    shouldBeMix: true
  },
  {
    title: "The Blaze performance at Cercle Odyssey, Mexico City", 
    duration: 90 * 60,
    description: "The Blaze performing at Cercle Odyssey in Mexico City",
    expectedArtist: "The Blaze",
    expectedLocation: "Mexico City",
    shouldBeMix: true
  },
  {
    title: "WhoMadeWho live at Cercle Odyssey, Mexico City",
    duration: 90 * 60, 
    description: "WhoMadeWho performing at Cercle Odyssey in Mexico City",
    expectedArtist: "WhoMadeWho",
    expectedLocation: "Mexico City", 
    shouldBeMix: true
  },

  // Cercle Festival 2024
  {
    title: "Dixon at Cercle Festival 2024 (Ariane Stage)",
    duration: 89 * 60,
    description: "Dixon performing at Cercle Festival 2024",
    expectedArtist: "Dixon",
    expectedLocation: "Cercle Festival 2024",
    shouldBeMix: true
  },
  {
    title: "Disclosure b2b Mochakk at Cercle Festival 2024 (A380 Stage)",
    duration: 147 * 60,
    description: "Disclosure b2b Mochakk at Cercle Festival 2024",
    expectedArtist: "Disclosure",
    expectedLocation: "Cercle Festival 2024", 
    shouldBeMix: true
  },
  {
    title: "Indira Paganotto at Cercle Festival 2024 (A380 Stage)",
    duration: 123 * 60,
    description: "Indira Paganotto at Cercle Festival 2024",
    expectedArtist: "Indira Paganotto",
    expectedLocation: "Cercle Festival 2024",
    shouldBeMix: true
  },
  {
    title: "Ann Clue at Cercle Festival 2024 (Concorde Stage)",
    duration: 89 * 60,
    description: "Ann Clue at Cercle Festival 2024",
    expectedArtist: "Ann Clue", 
    expectedLocation: "Cercle Festival 2024",
    shouldBeMix: true
  },

  // Location-based Cercle performances
  {
    title: "Shimza for Cercle at Citadelle de Sisteron, France",
    duration: 126 * 60,
    description: "Shimza performing at Citadelle de Sisteron for Cercle",
    expectedArtist: "Shimza",
    expectedLocation: "Citadelle de Sisteron, France",
    shouldBeMix: true
  },
  {
    title: "Kiasmos live for Cercle at Citadelle de Sisteron, France", 
    duration: 88 * 60,
    description: "Kiasmos performing at Citadelle de Sisteron for Cercle",
    expectedArtist: "Kiasmos",
    expectedLocation: "Citadelle de Sisteron, France",
    shouldBeMix: true
  },
  {
    title: "Folamour at Cathédrale Saint-Pierre in Geneva, Switzerland for Cercle & W Hotels",
    duration: 114 * 60,
    description: "Folamour performing at Cathédrale Saint-Pierre for Cercle",
    expectedArtist: "Folamour",
    expectedLocation: "Geneva, Switzerland",
    shouldBeMix: true
  },
  {
    title: "Mochakk at Plaza de España, in Sevilla, Spain for Cercle & Volcan X.A.",
    duration: 156 * 60,
    description: "Mochakk performing at Plaza de España for Cercle",
    expectedArtist: "Mochakk", 
    expectedLocation: "Sevilla, Spain",
    shouldBeMix: true
  },
  {
    title: "Adriatique at Hatshepsut Temple in Luxor, Egypt for Cercle",
    duration: 140 * 60,
    description: "Adriatique performing at Hatshepsut Temple for Cercle",
    expectedArtist: "Adriatique",
    expectedLocation: "Luxor, Egypt",
    shouldBeMix: true
  },
  {
    title: "Miss Monique at the Biosphere Museum in Montreal, Canada for Cercle",
    duration: 133 * 60,
    description: "Miss Monique performing at the Biosphere Museum for Cercle",
    expectedArtist: "Miss Monique",
    expectedLocation: "Montreal, Canada", 
    shouldBeMix: true
  },
  {
    title: "Carlita at Cinecittà in Rome, Italy for Cercle",
    duration: 104 * 60,
    description: "Carlita performing at Cinecittà for Cercle",
    expectedArtist: "Carlita",
    expectedLocation: "Rome, Italy",
    shouldBeMix: true
  },
  {
    title: "Bedouin live at Petra, Jordan for Cercle",
    duration: 114 * 60,
    description: "Bedouin performing live at Petra for Cercle",
    expectedArtist: "Bedouin",
    expectedLocation: "Petra, Jordan",
    shouldBeMix: true
  },
  {
    title: "RY X live from Lençóis Maranhenses National Park, Brazil for Cercle",
    duration: 93 * 60,
    description: "RY X performing live from Lençóis Maranhenses for Cercle",
    expectedArtist: "RY X",
    expectedLocation: "Brazil",
    shouldBeMix: true
  },
  {
    title: "Hania Rani live at Invalides in Paris, France for Cercle",
    duration: 105 * 60,
    description: "Hania Rani performing live at Invalides for Cercle",
    expectedArtist: "Hania Rani",
    expectedLocation: "Paris, France",
    shouldBeMix: true
  },
  {
    title: "Eli & Fur live for Cercle from Courmayeur, Skyway Monte Bianco, Italy",
    duration: 90 * 60,
    description: "Eli & Fur performing for Cercle from Skyway Monte Bianco",
    expectedArtist: "Eli & Fur",
    expectedLocation: "Italy",
    shouldBeMix: true
  },
  {
    title: "Jamie Jones for Cercle at Pliva Waterfalls in Jajce, Bosnia-Herzegovina",
    duration: 114 * 60,
    description: "Jamie Jones performing for Cercle at Pliva Waterfalls",
    expectedArtist: "Jamie Jones",
    expectedLocation: "Bosnia-Herzegovina",
    shouldBeMix: true
  },
  {
    title: "Boris Brejcha for Cercle at Arènes de Nîmes, France",
    duration: 107 * 60,
    description: "Boris Brejcha performing for Cercle at Arènes de Nîmes",
    expectedArtist: "Boris Brejcha",
    expectedLocation: "France",
    shouldBeMix: true
  },
  {
    title: "Colyn at Jatayu Earth's Center in Kerala, India for Cercle",
    duration: 110 * 60,
    description: "Colyn performing at Jatayu Earth's Center for Cercle",
    expectedArtist: "Colyn",
    expectedLocation: "Kerala, India",
    shouldBeMix: true
  },
  {
    title: "Vintage Culture for Cercle at Museu do Amanhã in Rio de Janeiro, Brazil", 
    duration: 110 * 60,
    description: "Vintage Culture performing for Cercle at Museu do Amanhã",
    expectedArtist: "Vintage Culture",
    expectedLocation: "Rio de Janeiro, Brazil",
    shouldBeMix: true
  },
  {
    title: "Above & Beyond for Cercle in Guatape, Colombia",
    duration: 94 * 60,
    description: "Above & Beyond performing for Cercle in Guatape",
    expectedArtist: "Above & Beyond",
    expectedLocation: "Guatape, Colombia",
    shouldBeMix: true
  },
  {
    title: "BLOND:ISH for Cercle & SXM Festival at Rainforest Adventures, Sint Maarten",
    duration: 75 * 60,
    description: "BLOND:ISH performing for Cercle & SXM Festival",
    expectedArtist: "BLOND:ISH",
    expectedLocation: "Sint Maarten",
    shouldBeMix: true
  },
  {
    title: "Sofiane Pamart live under the Northern Lights, in Lapland, Finland for Cercle",
    duration: 78 * 60,
    description: "Sofiane Pamart performing under the Northern Lights for Cercle",
    expectedArtist: "Sofiane Pamart",
    expectedLocation: "Lapland, Finland",
    shouldBeMix: true
  },
  {
    title: "Monolink live for Cercle & W Hotels at Gaatafushi Island, Maldives",
    duration: 102 * 60,
    description: "Monolink performing for Cercle & W Hotels at Gaatafushi Island",
    expectedArtist: "Monolink",
    expectedLocation: "Maldives",
    shouldBeMix: true
  },
  {
    title: "Ólafur Arnalds live from Hafursey, in Iceland for Cercle",
    duration: 87 * 60,
    description: "Ólafur Arnalds performing live from Hafursey for Cercle",
    expectedArtist: "Ólafur Arnalds",
    expectedLocation: "Iceland",
    shouldBeMix: true
  },
  {
    title: "Argy for Cercle at Jungfraujoch - Top of Europe, Switzerland",
    duration: 117 * 60,
    description: "Argy performing for Cercle at Jungfraujoch - Top of Europe",
    expectedArtist: "Argy",
    expectedLocation: "Switzerland",
    shouldBeMix: true
  },

  // Cercle Festival 2022
  {
    title: "KAS:ST at Cercle Festival 2022 (Ariane Stage)",
    duration: 69 * 60,
    description: "KAS:ST performing at Cercle Festival 2022",
    expectedArtist: "KAS:ST",
    expectedLocation: "Cercle Festival 2022",
    shouldBeMix: true
  },
  {
    title: "Hernán Cattáneo at Cercle Festival 2022 (A380 Stage)",
    duration: 116 * 60,
    description: "Hernán Cattáneo performing at Cercle Festival 2022",
    expectedArtist: "Hernán Cattáneo",
    expectedLocation: "Cercle Festival 2022",
    shouldBeMix: true
  },

  // Cercle Story compilations
  {
    title: "Cercle Story - Chapter One (melodic mix)",
    duration: 45 * 60,
    description: "Cercle Story melodic mix compilation",
    expectedArtist: "Cercle",
    expectedLocation: null,
    shouldBeMix: true
  },
  {
    title: "Cercle Story: Chapter Two (melodic mix)",
    duration: 50 * 60,
    description: "Cercle Story melodic mix compilation chapter two",
    expectedArtist: "Cercle", 
    expectedLocation: null,
    shouldBeMix: false // This should be excluded as it contains "making of"
  },

  // Content that should NOT be detected as mixes
  {
    title: "Behind Cercle Odyssey I Chapter 4: Curtain Up",
    duration: 19 * 60,
    description: "Behind the scenes content from Cercle Odyssey",
    expectedArtist: "Cercle",
    expectedLocation: null,
    shouldBeMix: false
  },
  {
    title: "Behind Cercle Odyssey | Chapter One: The Call Of The Unknown",
    duration: 8 * 60,
    description: "Behind the scenes documentary about Cercle Odyssey",
    expectedArtist: "Cercle",
    expectedLocation: null,
    shouldBeMix: false
  },
  {
    title: "Monolink's full performance at Cercle Odyssey is out!",
    duration: 1 * 60,
    description: "Promotional video for Monolink performance",
    expectedArtist: "Monolink",
    expectedLocation: null,
    shouldBeMix: false
  },
  {
    title: "The Blaze - SIREN (Live Version) | Cercle Odyssey",
    duration: 5 * 60,
    description: "Single track from The Blaze",
    expectedArtist: "The Blaze",
    expectedLocation: null,
    shouldBeMix: false
  },
  {
    title: "Mochakk plays One More Time - Sevilla",
    duration: 1 * 60,
    description: "Short clip of Mochakk playing a track",
    expectedArtist: "Mochakk",
    expectedLocation: "Sevilla",
    shouldBeMix: false
  },
  {
    title: "CERCLE FESTIVAL 2026",
    duration: 0.5 * 60,
    description: "Announcement video for Cercle Festival 2026",
    expectedArtist: "Cercle",
    expectedLocation: null,
    shouldBeMix: false
  }
];

console.log('🎵 Testing Cercle Catalog Mix Detection & Artist Extraction\\n');

let totalTests = 0;
let passedMixDetection = 0;
let passedArtistExtraction = 0;
let failedTests = [];

cercleCatalog.forEach((video, i) => {
  totalTests++;
  console.log(`${i + 1}. "${video.title}"`);
  console.log(`   Duration: ${Math.round(video.duration / 60)} minutes`);
  
  // Test mix detection
  const mixResult = getMixDetectionDetails(
    video.title,
    video.description,
    video.duration,
    'Cercle'
  );
  
  const mixDetectionCorrect = mixResult.isMix === video.shouldBeMix;
  if (mixDetectionCorrect) {
    passedMixDetection++;
  } else {
    failedTests.push({
      title: video.title,
      issue: `Mix detection wrong: expected ${video.shouldBeMix}, got ${mixResult.isMix}`,
      reasons: mixResult.reasons
    });
  }
  
  const mixStatus = mixResult.isMix ? "✅ MIX" : "❌ NOT MIX";
  const correctness = mixDetectionCorrect ? "✅" : "❌";
  console.log(`   Mix Detection: ${mixStatus} ${correctness} (score: ${mixResult.score})`);
  console.log(`   Reasons: ${mixResult.reasons.join(', ') || 'None'}`);
  
  // Test artist extraction
  if (video.shouldBeMix) {
    const artistResult = extractArtistsFromVideo(
      video.title,
      'Cercle',
      video.description,
      'UCPKT_csvP72boVX0XrMtagQ'
    );
    
    const extractedArtist = artistResult.performingArtists.length > 0 
      ? artistResult.performingArtists[0] 
      : 'Cercle';
    
    const artistCorrect = extractedArtist.toLowerCase().includes(video.expectedArtist.toLowerCase()) ||
                         video.expectedArtist.toLowerCase().includes(extractedArtist.toLowerCase());
    
    if (artistCorrect) {
      passedArtistExtraction++;
    } else {
      failedTests.push({
        title: video.title,
        issue: `Artist extraction wrong: expected "${video.expectedArtist}", got "${extractedArtist}"`,
        method: artistResult.extractionMethod
      });
    }
    
    const artistStatus = artistCorrect ? "✅" : "❌";
    console.log(`   Artist: "${extractedArtist}" ${artistStatus} (method: ${artistResult.extractionMethod})`);
  }
  
  console.log();
});

console.log('📊 Test Results Summary:');
console.log(`Total tests: ${totalTests}`);
console.log(`Mix detection accuracy: ${passedMixDetection}/${totalTests} (${Math.round(passedMixDetection/totalTests*100)}%)`);

const mixTests = cercleCatalog.filter(v => v.shouldBeMix).length;
console.log(`Artist extraction accuracy: ${passedArtistExtraction}/${mixTests} (${Math.round(passedArtistExtraction/mixTests*100)}%)`);

if (failedTests.length > 0) {
  console.log('\\n❌ Failed Tests:');
  failedTests.forEach((failure, i) => {
    console.log(`${i + 1}. "${failure.title}"`);
    console.log(`   Issue: ${failure.issue}`);
    if (failure.reasons) console.log(`   Reasons: ${failure.reasons.join(', ')}`);
    if (failure.method) console.log(`   Method: ${failure.method}`);
    console.log();
  });
} else {
  console.log('\\n🎉 All tests passed!');
}