#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

async function testPlaylistDirect() {
  console.log('🧪 Testing playlist IDs directly...\n');
  
  const apiKey = process.env.YOUTUBE_API_KEY;
  const baseUrl = 'https://www.googleapis.com/youtube/v3';
  const channelId = 'UCGbmQlLpsrDOTGqFN7S65Qw';
  
  // Test different playlist ID variations
  const playlistVariations = [
    { name: 'API returned ID', id: 'UUGbmQlLpsrDOTGqFN7S65Qw' },
    { name: 'Corrected ID (UC->UU)', id: 'UUGbmQlLpsrDOTGqFN7S65Qw' }, // This is what it should be
    { name: 'Manual construction', id: channelId.replace('UC', 'UU') }
  ];
  
  for (const variation of playlistVariations) {
    console.log(`\n📡 Testing ${variation.name}: ${variation.id}`);
    
    try {
      const response = await axios.get(`${baseUrl}/playlistItems`, {
        params: {
          part: 'snippet',
          playlistId: variation.id,
          maxResults: 1,
          key: apiKey,
        },
      });
      
      console.log(`✅ ${variation.name} WORKS! Videos found:`, response.data.items?.length || 0);
      if (response.data.items?.[0]) {
        console.log(`   Sample video: ${response.data.items[0].snippet.title}`);
      }
    } catch (error) {
      console.log(`❌ ${variation.name} failed:`, error.response?.status, error.response?.data?.error?.message || error.message);
    }
  }
}

testPlaylistDirect().then(() => {
  console.log('\n🏁 Playlist ID testing complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Script failed:', error);
  process.exit(1);
});