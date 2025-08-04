#!/usr/bin/env ts-node

/**
 * Test script for the enhanced 1001Tracklists worker
 * Usage: npx ts-node test-1001tracklists-worker.ts <1001tracklists-url>
 */

import { OneTracklistWorker } from './src/workers/1001tracklists-worker';
import { logger } from './src/services/logger';

async function testWorker() {
  const url = process.argv[2];
  
  if (!url) {
    console.log('Usage: npx ts-node test-1001tracklists-worker.ts <1001tracklists-url>');
    console.log('Example: npx ts-node test-1001tracklists-worker.ts https://www.1001tracklists.com/tracklist/123456/artist-mix-name');
    process.exit(1);
  }

  if (!url.includes('1001tracklists.com')) {
    console.error('❌ Please provide a valid 1001Tracklists URL');
    process.exit(1);
  }

  console.log('🚀 Testing Enhanced 1001Tracklists Worker');
  console.log(`📋 Target URL: ${url}`);
  console.log('');

  const worker = new OneTracklistWorker();
  
  // Enable interactive mode for manual captcha solving if needed
  worker.setInteractiveMode(true);

  try {
    console.log('🔄 Fetching mix data...');
    
    // Test direct URL fetching
    const rawMixes = await worker.fetchNewMixes({
      urls: [url],
      maxResults: 1
    });

    if (rawMixes.length === 0) {
      console.log('❌ No mix data found');
      return;
    }

    const rawMix = rawMixes[0];
    console.log('✅ Mix data extracted successfully!');
    console.log('');
    
    // Display mix metadata
    console.log('📀 MIX METADATA:');
    console.log(`Title: ${rawMix.raw_title}`);
    console.log(`Artist: ${rawMix.raw_artist}`);
    console.log(`Upload Date: ${rawMix.uploaded_at}`);
    console.log(`Cover Image: ${rawMix.artwork_url}`);
    console.log(`External ID: ${rawMix.external_id}`);
    console.log('');

    // Display rich metadata
    const metadata = rawMix.raw_metadata as any;
    if (metadata) {
      console.log('🎵 RICH METADATA:');
      if (metadata.soundcloud_url) console.log(`SoundCloud: ${metadata.soundcloud_url}`);
      if (metadata.audio_url) console.log(`Audio URL: ${metadata.audio_url}`);
      if (metadata.trackCount) console.log(`Track Count: ${metadata.trackCount}`);
      console.log('');
    }

    // Test tracklist parsing
    if (worker.parseTracklist) {
      console.log('🔍 Parsing tracklist...');
      const tracks = await worker.parseTracklist(rawMix);
      
      if (tracks && tracks.length > 0) {
        console.log(`✅ Parsed ${tracks.length} tracks successfully!`);
        console.log('');
        console.log('🎶 TRACKLIST:');
        
        tracks.slice(0, 10).forEach((track, idx) => {
          const timestamp = track.timestamp_seconds 
            ? `${Math.floor(track.timestamp_seconds / 60)}:${(track.timestamp_seconds % 60).toString().padStart(2, '0')}`
            : '??:??';
          
          console.log(`${idx + 1}. [${timestamp}] ${track.line_text}`);
        });
        
        if (tracks.length > 10) {
          console.log(`... and ${tracks.length - 10} more tracks`);
        }
      } else {
        console.log('❌ No tracks found in tracklist');
      }
    }

    console.log('');
    console.log('🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testWorker();