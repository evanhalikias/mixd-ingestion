#!/usr/bin/env ts-node

/**
 * Standalone test for 1001Tracklists scraping without database dependencies
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, type Browser, type Page } from 'playwright';

const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function testScraping() {
  const url = process.argv[2];
  
  if (!url) {
    console.log('Usage: npx ts-node test-scraping-only.ts <1001tracklists-url>');
    console.log('Example: npx ts-node test-scraping-only.ts https://www.1001tracklists.com/tracklist/123456/artist-mix-name');
    process.exit(1);
  }

  if (!url.includes('1001tracklists.com')) {
    console.error('❌ Please provide a valid 1001Tracklists URL');
    process.exit(1);
  }

  console.log('🚀 Testing 1001Tracklists Scraping (Standalone)');
  console.log(`📋 Target URL: ${url}`);
  console.log('');

  let browser: Browser | null = null;
  let page: Page | null = null;
  
  try {
    console.log('🌐 Launching browser...');
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    
    const context = await browser.newContext({
      userAgent: userAgent,
    });
    
    page = await context.newPage();
    
    console.log('🌐 Navigating to mix URL...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Wait for page to finish loading
    await page.waitForTimeout(10000);
    
    // Extract all data using sophisticated parsing
    const mixData = await page.evaluate(() => {
      // Extract title and date from the page title
      let fullTitle = '';
      let date = '';
      const pageTitleEl = document.querySelector('#pageTitle h1') as HTMLElement;
      if (pageTitleEl) {
        fullTitle = pageTitleEl.innerText.trim();
        // Try to extract date at the end (YYYY-MM-DD)
        const dateMatch = fullTitle.match(/(\d{4}-\d{2}-\d{2})$/);
        if (dateMatch) {
          date = dateMatch[1];
          fullTitle = fullTitle.replace(/\s*\d{4}-\d{2}-\d{2}$/, '').trim();
        }
      } else {
        fullTitle = 'Unknown Title';
      }

      const soundcloudLink = Array.from(document.querySelectorAll('a')).find((a: any) =>
        a.href && a.href.includes('soundcloud.com')
      )?.href || null;
      
      // Extract cover_url from the og:image meta tag
      const coverUrl = (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content || null;
      
      // Extract mix_artist from the author meta tag within the MusicPlaylist schema
      const mixArtist = (document.querySelector('div[itemtype="http://schema.org/MusicPlaylist"] meta[itemprop="author"]') as HTMLMetaElement)?.content || null;
      
      // Extract audio_url from SoundCloud iframe widget
      let audioUrl = null;
      const iframe = document.querySelector('iframe[src*="soundcloud.com/player"]') as HTMLIFrameElement;
      if (iframe) {
        const fullUrl = iframe.src;
        // Extract just the base URL with track ID, removing extra parameters
        const match = fullUrl.match(/^(https:\/\/w\.soundcloud\.com\/player\/\?url=https:\/\/api\.soundcloud\.com\/tracks\/\d+)/);
        if (match) {
          audioUrl = match[1];
        }
      }

      const trackRows = Array.from(document.querySelectorAll('div[id^="tlp_"].tlpTog.tlpItem'));
      let unknownTrackCounter = 0;
      const tracklist = trackRows.map((row: any, idx: number) => {
        const trackNumber = (row.querySelector('.fontXL') as HTMLElement)?.innerText.trim() || (idx + 1);
        let setTime = (row.querySelector('div.cue[data-mode="hours"]') as HTMLElement)?.innerText.trim() || '??:??';
        if (idx === 0 && setTime === '??:??') setTime = '00:00';
        let artist = (row.querySelector('meta[itemprop="byArtist"]') as HTMLMetaElement)?.content || 'Unknown Artist';
        let title = (row.querySelector('meta[itemprop="name"]') as HTMLMetaElement)?.content || 'Unknown Title';

        // Check for extra status (e.g., 'ID Remix') and append to title if present
        const statusEl = row.querySelector('.trackStatus') as HTMLElement;
        if (statusEl && statusEl.innerText.trim()) {
          const statusText = statusEl.innerText.trim();
          // Only append if not already present in the title
          if (!title.toLowerCase().includes(statusText.toLowerCase())) {
            title += (title.endsWith(' ') ? '' : ' ') + statusText;
          }
        }

        // Detect if played together with previous track
        let played_with_previous = false;
        const trackNumSpan = row.querySelector('.tracknumber_value') as HTMLElement;
        if (trackNumSpan && trackNumSpan.getAttribute('title') === 'played together with previous track') {
          played_with_previous = true;
        }

        // Helper function to escape regex special characters
        function escapeRegex(str: string): string {
          return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        // Regex to match 'Artist ft. ...' or 'Artist feat. ...' at the start of the title
        const artistFtRegex = new RegExp(`^(${escapeRegex(artist)})\\s*(ft\\.|feat\\.)\\s+([^–—:]+)\\s*[-–—:]\\s*(.+)`, 'i');
        const match = title.match(artistFtRegex);
        if (match) {
          artist = `${match[1]} ft. ${match[3].trim()}`;
          title = match[4].trim();
        } else {
          const artistBase = artist.replace(/\s*\([A-Z]{2,3}\)$/, '').trim();
          const artistPattern = `^(${escapeRegex(artist)}|${escapeRegex(artistBase)})\\s*[-–—:]\\s*`;
          title = title.replace(new RegExp(artistPattern, 'i'), '').trim();
        }

        // Check for Spotify icon
        const spotifyIcon = row.querySelector('i.fa-spotify') as HTMLElement;
        const spotify_url_exists = spotifyIcon && spotifyIcon.classList.contains('colorized') ? 1 : 0;

        // Determine if the track is unreleased (ID-style)
        const isUnknown = artist === 'Unknown Artist' && title === 'Unknown Title';
        let working_title = '';
        if (isUnknown) {
          unknownTrackCounter++;
          working_title = `ID${unknownTrackCounter.toString().padStart(2, '0')}`;
        }
        const context = isUnknown ? fullTitle : '';

        return {
          order: trackNumber,
          set_time: setTime,
          artist,
          title,
          original_title: title,   // preserve the scraped raw title
          working_title,           // used for ID-style tracks
          context,                 // only populated for unreleased IDs
          spotify_url_exists,
          played_with_previous
        };
      });

      return {
        mix: {
          title: fullTitle,
          date,
          mix_artist: mixArtist,
          soundcloud_url: soundcloudLink,
          cover_url: coverUrl,
          audio_url: audioUrl,
          tracklist
        }
      };
    });
    
    if (!mixData) {
      console.log('❌ No mix data found');
      return;
    }

    const mix = mixData.mix;
    console.log('✅ Mix data extracted successfully!');
    console.log('');
    
    // Display mix metadata
    console.log('📀 MIX METADATA:');
    console.log(`Title: ${mix.title}`);
    console.log(`Artist: ${mix.mix_artist}`);
    console.log(`Date: ${mix.date}`);
    console.log(`Cover Image: ${mix.cover_url}`);
    console.log(`SoundCloud: ${mix.soundcloud_url}`);
    console.log(`Audio URL: ${mix.audio_url}`);
    console.log(`Track Count: ${mix.tracklist?.length || 0}`);
    console.log('');
    
    // Display tracklist
    if (mix.tracklist && mix.tracklist.length > 0) {
      console.log('🎶 TRACKLIST:');
      
      mix.tracklist.slice(0, 15).forEach((track: any, idx: number) => {
        const indicators = [];
        if (track.played_with_previous) indicators.push('played together');
        if (track.spotify_url_exists) indicators.push('on Spotify');
        
        let trackInfo = '';
        if (track.working_title) {
          trackInfo = track.working_title;
          if (track.context) trackInfo += ` (${track.context})`;
        } else if (track.artist !== 'Unknown Artist' && track.title !== 'Unknown Title') {
          trackInfo = `${track.artist} - ${track.title}`;
        } else if (track.title !== 'Unknown Title') {
          trackInfo = track.title;
        }
        
        const indicatorStr = indicators.length > 0 ? ` [${indicators.join(', ')}]` : '';
        console.log(`${idx + 1}. [${track.set_time}] ${trackInfo}${indicatorStr}`);
      });
      
      if (mix.tracklist.length > 15) {
        console.log(`... and ${mix.tracklist.length - 15} more tracks`);
      }
    } else {
      console.log('❌ No tracks found in tracklist');
    }

    console.log('');
    console.log('🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

testScraping();