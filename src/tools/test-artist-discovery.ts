#!/usr/bin/env node

import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

import { ArtistLinkDiscoveryWorker } from '../workers/artist-discovery-worker';
import { artistProfileConfigUtils } from '../lib/artist-profile-config-generator';
import { logger } from '../services/logger';

/**
 * Test script for the Artist Link Discovery Worker
 * Usage: npm run test:artist-discovery "Artist Name"
 */

async function testArtistDiscovery(artistName: string) {
  try {
    console.log(`🎯 Testing artist discovery for: "${artistName}"`);
    console.log('=' + '='.repeat(50));
    
    // Create and run the discovery worker
    const worker = new ArtistLinkDiscoveryWorker();
    
    const config = {
      artistNames: [artistName],
      maxResults: 1
    };
    
    console.log('\n🔄 Running artist discovery...');
    const result = await worker.run(config);
    
    console.log('\n📊 Discovery Results:');
    console.log(`Success: ${result.success}`);
    console.log(`Artists processed: ${result.mixesFound}`);
    console.log(`Profiles created/updated: ${result.mixesAdded}`);
    console.log(`Errors: ${result.errors.length}`);
    console.log(`Duration: ${result.duration}ms`);
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    // Try to generate worker configs from the discovered profile
    console.log('\n🔧 Generating worker configurations...');
    
    try {
      const configs = await artistProfileConfigUtils.generateJobsForArtist(artistName);
      
      if (configs.length > 0) {
        console.log(`✅ Generated ${configs.length} worker job(s):`);
        configs.forEach((job, index) => {
          console.log(`  ${index + 1}. ${job.worker_type}: ${job.source_id}`);
        });
        
        console.log('\n🎉 Success! You can now use these configurations to run ingestion for this artist.');
        console.log('\nExample usage:');
        console.log('1. Create ingestion jobs using the admin tool');
        console.log('2. Or use the generated configs directly in your worker calls');
        
      } else {
        console.log('⚠️  No worker configurations generated (may need manual verification)');
      }
      
    } catch (err) {
      console.error('❌ Failed to generate worker configs:', err);
    }
    
  } catch (error) {
    console.error('❌ Artist discovery test failed:', error);
    process.exit(1);
  }
}

// Run the test
const artistName = process.argv[2];

if (!artistName) {
  console.error('Usage: npm run test:artist-discovery "Artist Name"');
  console.error('Example: npm run test:artist-discovery "Rinzen"');
  process.exit(1);
}

testArtistDiscovery(artistName);