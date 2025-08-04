import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, type Browser, type Page } from 'playwright';
import { BaseIngestionWorker, type SourceConfig, type WorkerType } from '../lib/worker-interface';
import type { RawMix, ArtistProfile, PlatformDiscoveryResult, ArtistDiscoveryResult } from '../lib/supabase/types';
import { createExternalId } from '../lib/external-ids';
import { logger } from '../services/logger';
import { getServiceClient } from '../lib/supabase/service';

/**
 * Artist Link Discovery Worker
 * Discovers artist profiles across multiple platforms (SoundCloud, YouTube, Spotify, 1001Tracklists)
 * and stores comprehensive artist platform data for automated worker configuration
 */
export class ArtistLinkDiscoveryWorker extends BaseIngestionWorker {
  readonly workerType: WorkerType = 'artist-discovery';
  readonly name = 'Artist Link Discovery Worker';
  
  private userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  private requestDelay = 2000; // 2 second delay between requests
  private supabase = getServiceClient();
  
  // API credentials
  private youtubeApiKey: string;
  private spotifyClientId?: string;
  private spotifyClientSecret?: string;
  private spotifyAccessToken?: string;
  
  constructor() {
    super();
    this.youtubeApiKey = process.env.YOUTUBE_API_KEY || '';
    this.spotifyClientId = process.env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    if (!this.youtubeApiKey) {
      logger.warn('YOUTUBE_API_KEY not set, YouTube discovery will be disabled');
    }
    
    if (!this.spotifyClientId || !this.spotifyClientSecret) {
      logger.warn('Spotify credentials not set, Spotify discovery will be disabled');
    }
  }
  
  /**
   * Fetch new mixes - For discovery worker, this discovers artist profiles
   * Returns empty array since this worker doesn't discover mixes directly
   */
  async fetchNewMixes(config: SourceConfig): Promise<RawMix[]> {
    const { artistNames = [] } = config;
    
    if (artistNames.length === 0) {
      logger.warn('No artist names provided for discovery');
      return [];
    }
    
    // Process each artist name
    for (const artistName of artistNames) {
      try {
        logger.info(`🔍 Discovering platforms for artist: ${artistName}`);
        const discoveryResult = await this.discoverArtistPlatforms(artistName);
        await this.saveArtistProfile(discoveryResult);
      } catch (err) {
        logger.error(`Failed to discover platforms for ${artistName}`, err as Error, {
          workerType: this.workerType,
          artistName
        });
      }
    }
    
    // Artist discovery doesn't return raw mixes
    return [];
  }
  
  /**
   * Override run method to properly track artist profile discovery progress
   */
  async run(config: SourceConfig): Promise<import('../lib/worker-interface').WorkerResult> {
    const startTime = Date.now();
    const result: import('../lib/worker-interface').WorkerResult = {
      success: false,
      mixesFound: 0,
      mixesAdded: 0,
      mixesSkipped: 0,
      errors: [],
      duration: 0,
    };
    
    try {
      console.log(`🔄 Starting ${this.name} worker...`);
      
      const { artistNames = [] } = config;
      
      if (artistNames.length === 0) {
        logger.warn('No artist names provided for discovery');
        result.success = true; // Not an error, just no work to do
        result.duration = Date.now() - startTime;
        return result;
      }
      
      result.mixesFound = artistNames.length; // Track how many artists we're processing
      
      let processedCount = 0;
      let errorCount = 0;
      
      // Process each artist name
      for (const artistName of artistNames) {
        try {
          logger.info(`🔍 Discovering platforms for artist: ${artistName}`);
          const discoveryResult = await this.discoverArtistPlatforms(artistName);
          await this.saveArtistProfile(discoveryResult);
          processedCount++;
        } catch (err) {
          const error = `Failed to discover platforms for ${artistName}: ${err}`;
          result.errors.push(error);
          logger.error(error, err as Error, {
            workerType: this.workerType,
            artistName
          });
          errorCount++;
        }
      }
      
      result.mixesAdded = processedCount; // Successfully processed profiles
      result.mixesSkipped = errorCount;   // Failed profiles
      result.success = processedCount > 0 && errorCount === 0;
      result.duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ ${this.name} completed: ${processedCount} artists discovered`);
      } else {
        console.log(`⚠️ ${this.name} completed with issues: ${processedCount} succeeded, ${errorCount} failed`);
      }
      
    } catch (err) {
      const error = `${this.name} worker failed: ${err}`;
      result.errors.push(error);
      result.duration = Date.now() - startTime;
      console.error(error);
    }
    
    return result;
  }
  
  /**
   * Main discovery function - searches all platforms for an artist
   */
  private async discoverArtistPlatforms(artistName: string): Promise<ArtistDiscoveryResult> {
    const platforms: PlatformDiscoveryResult[] = [];
    const discoveryNotes: string[] = [];
    
    // Run all platform discoveries in parallel for efficiency
    const platformPromises = [
      this.discoverSoundCloudProfile(artistName),
      this.discoverYouTubeChannel(artistName),
      this.discoverSpotifyArtist(artistName),
      this.discover1001TracklistsProfile(artistName)
    ];
    
    const results = await Promise.allSettled(platformPromises);
    
    // Process results
    results.forEach((result, index) => {
      const platformNames = ['soundcloud', 'youtube', 'spotify', '1001tracklists'] as const;
      const platform = platformNames[index];
      
      if (result.status === 'fulfilled') {
        platforms.push(result.value);
        if (result.value.confidence > 0.7) {
          discoveryNotes.push(`High confidence ${platform} profile found`);
        } else if (result.value.confidence > 0.4) {
          discoveryNotes.push(`Medium confidence ${platform} profile found`);
        }
      } else {
        logger.warn(`${platform} discovery failed for ${artistName}`, { metadata: { error: result.reason } });
        platforms.push({
          platform,
          url: null,
          confidence: 0,
          metadata: {},
          error: result.reason?.message || 'Discovery failed'
        });
        discoveryNotes.push(`${platform} discovery failed: ${result.reason?.message || 'Unknown error'}`);
      }
    });
    
    // Calculate overall confidence (weighted average)
    const weights = { soundcloud: 0.3, youtube: 0.3, spotify: 0.25, '1001tracklists': 0.15 };
    const overallConfidence = platforms.reduce((acc, platform) => {
      return acc + (platform.confidence * weights[platform.platform]);
    }, 0);
    
    return {
      artist_name: artistName,
      platforms,
      overall_confidence: overallConfidence,
      discovery_notes: discoveryNotes
    };
  }
  
  /**
   * Discover SoundCloud profile via web scraping
   */
  private async discoverSoundCloudProfile(artistName: string): Promise<PlatformDiscoveryResult> {
    try {
      const searchUrl = `https://soundcloud.com/search/people?q=${encodeURIComponent(artistName)}`;
      
      const response = await axios.get(searchUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Look for user profiles in search results
      const profiles: Array<{url: string, username: string, displayName: string, followers: number}> = [];
      
      // Parse search results (SoundCloud's structure may vary)
      $('li').each((_, element) => {
        const $el = $(element);
        const profileLink = $el.find('a[href*="/"]').first();
        const href = profileLink.attr('href');
        
        if (href && href.match(/^\/[^\/]+$/)) {
          const username = href.substring(1);
          const displayName = profileLink.text().trim();
          const followersText = $el.find('[title*="follower"]').text();
          const followers = this.parseFollowerCount(followersText);
          
          profiles.push({
            url: `https://soundcloud.com${href}`,
            username,
            displayName,
            followers
          });
        }
      });
      
      if (profiles.length === 0) {
        return {
          platform: 'soundcloud',
          url: null,
          confidence: 0,
          metadata: { searchResults: 0 }
        };
      }
      
      // Find best match
      const bestMatch = this.findBestArtistMatch(artistName, profiles.map(p => ({
        ...p,
        name: p.displayName
      })));
      
      if (bestMatch) {
        const profile = profiles.find(p => p.displayName === bestMatch.name);
        if (profile) {
          return {
            platform: 'soundcloud',
            url: profile.url,
            username: profile.username,
            confidence: bestMatch.confidence,
            metadata: {
              display_name: profile.displayName,
              followers: profile.followers,
              search_results_count: profiles.length
            }
          };
        }
      }
      
      return {
        platform: 'soundcloud',
        url: null,
        confidence: 0,
        metadata: { searchResults: profiles.length, noGoodMatch: true }
      };
      
    } catch (error) {
      logger.error('SoundCloud discovery failed', error as Error);
      return {
        platform: 'soundcloud',
        url: null,
        confidence: 0,
        metadata: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Discover YouTube channel via API
   */
  private async discoverYouTubeChannel(artistName: string): Promise<PlatformDiscoveryResult> {
    if (!this.youtubeApiKey) {
      return {
        platform: 'youtube',
        url: null,
        confidence: 0,
        metadata: {},
        error: 'YouTube API key not configured'
      };
    }
    
    try {
      // Search for channels
      const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          q: artistName,
          type: 'channel',
          maxResults: 10,
          key: this.youtubeApiKey
        }
      });
      
      const channels = searchResponse.data.items || [];
      
      if (channels.length === 0) {
        return {
          platform: 'youtube',
          url: null,
          confidence: 0,
          metadata: { searchResults: 0 }
        };
      }
      
      // Get detailed channel information
      const channelIds = channels.map((c: any) => c.snippet.channelId);
      const channelsResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: {
          part: 'snippet,statistics',
          id: channelIds.join(','),
          key: this.youtubeApiKey
        }
      });
      
      const detailedChannels = channelsResponse.data.items || [];
      
      // Find best match
      const candidates = detailedChannels.map((channel: any) => ({
        name: channel.snippet.title,
        url: `https://www.youtube.com/channel/${channel.id}`,
        id: channel.id,
        subscribers: parseInt(channel.statistics.subscriberCount || '0'),
        videos: parseInt(channel.statistics.videoCount || '0'),
        description: channel.snippet.description || ''
      }));
      
      const bestMatch = this.findBestArtistMatch(artistName, candidates);
      
      if (bestMatch) {
        const channel = candidates.find(c => c.name === bestMatch.name);
        if (channel) {
          return {
            platform: 'youtube',
            url: channel.url,
            id: channel.id,
            confidence: bestMatch.confidence,
            metadata: {
              channel_title: channel.name,
              subscribers: channel.subscribers,
              video_count: channel.videos,
              description: channel.description.substring(0, 200)
            }
          };
        }
      }
      
      return {
        platform: 'youtube',
        url: null,
        confidence: 0,
        metadata: { searchResults: channels.length, noGoodMatch: true }
      };
      
    } catch (error) {
      logger.error('YouTube discovery failed', error as Error);
      return {
        platform: 'youtube',
        url: null,
        confidence: 0,
        metadata: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Discover Spotify artist via Web API
   */
  private async discoverSpotifyArtist(artistName: string): Promise<PlatformDiscoveryResult> {
    if (!this.spotifyClientId || !this.spotifyClientSecret) {
      return {
        platform: 'spotify',
        url: null,
        confidence: 0,
        metadata: {},
        error: 'Spotify credentials not configured'
      };
    }
    
    try {
      // Get access token if we don't have one
      if (!this.spotifyAccessToken) {
        await this.getSpotifyAccessToken();
      }
      
      // Search for artists
      const searchResponse = await axios.get('https://api.spotify.com/v1/search', {
        params: {
          q: artistName,
          type: 'artist',
          limit: 10
        },
        headers: {
          'Authorization': `Bearer ${this.spotifyAccessToken}`
        }
      });
      
      const artists = searchResponse.data.artists?.items || [];
      
      if (artists.length === 0) {
        return {
          platform: 'spotify',
          url: null,
          confidence: 0,
          metadata: { searchResults: 0 }
        };
      }
      
      // Find best match
      const candidates = artists.map((artist: any) => ({
        name: artist.name,
        url: artist.external_urls.spotify,
        id: artist.id,
        followers: artist.followers.total,
        popularity: artist.popularity,
        genres: artist.genres
      }));
      
      const bestMatch = this.findBestArtistMatch(artistName, candidates);
      
      if (bestMatch) {
        const artist = candidates.find(a => a.name === bestMatch.name);
        if (artist) {
          return {
            platform: 'spotify',
            url: artist.url,
            id: artist.id,
            confidence: bestMatch.confidence,
            metadata: {
              artist_name: artist.name,
              followers: artist.followers,
              popularity: artist.popularity,
              genres: artist.genres
            }
          };
        }
      }
      
      return {
        platform: 'spotify',
        url: null,
        confidence: 0,
        metadata: { searchResults: artists.length, noGoodMatch: true }
      };
      
    } catch (error) {
      logger.error('Spotify discovery failed', error as Error);
      return {
        platform: 'spotify',
        url: null,
        confidence: 0,
        metadata: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Discover 1001Tracklists profile via web scraping
   */
  private async discover1001TracklistsProfile(artistName: string): Promise<PlatformDiscoveryResult> {
    try {
      const searchUrl = `https://www.1001tracklists.com/search/?query=${encodeURIComponent(artistName)}&type=artist`;
      
      const response = await axios.get(searchUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000
      });
      
      const $ = cheerio.load(response.data);
      
      // Look for artist profiles in search results
      const profiles: Array<{url: string, name: string}> = [];
      
      $('a[href*="/dj/"]').each((_, element) => {
        const $el = $(element);
        const href = $el.attr('href');
        const name = $el.text().trim();
        
        if (href && name) {
          profiles.push({
            url: href.startsWith('http') ? href : `https://www.1001tracklists.com${href}`,
            name
          });
        }
      });
      
      if (profiles.length === 0) {
        return {
          platform: '1001tracklists',
          url: null,
          confidence: 0,
          metadata: { searchResults: 0 }
        };
      }
      
      // Find best match
      const bestMatch = this.findBestArtistMatch(artistName, profiles);
      
      if (bestMatch) {
        const profile = profiles.find(p => p.name === bestMatch.name);
        if (profile) {
          return {
            platform: '1001tracklists',
            url: profile.url,
            confidence: bestMatch.confidence,
            metadata: {
              artist_name: profile.name,
              search_results_count: profiles.length
            }
          };
        }
      }
      
      return {
        platform: '1001tracklists',
        url: null,
        confidence: 0,
        metadata: { searchResults: profiles.length, noGoodMatch: true }
      };
      
    } catch (error) {
      logger.error('1001Tracklists discovery failed', error as Error);
      return {
        platform: '1001tracklists',
        url: null,
        confidence: 0,
        metadata: {},
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Get Spotify access token using client credentials flow
   */
  private async getSpotifyAccessToken(): Promise<void> {
    if (!this.spotifyClientId || !this.spotifyClientSecret) {
      throw new Error('Spotify credentials not configured');
    }
    
    const response = await axios.post('https://accounts.spotify.com/api/token', 
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.spotifyClientId}:${this.spotifyClientSecret}`).toString('base64')}`
        }
      }
    );
    
    this.spotifyAccessToken = response.data.access_token;
  }
  
  /**
   * Find the best matching artist from candidates using string similarity and other heuristics
   */
  private findBestArtistMatch(searchName: string, candidates: Array<{name: string, [key: string]: any}>): {name: string, confidence: number} | null {
    if (candidates.length === 0) return null;
    
    const normalizedSearch = this.normalizeArtistName(searchName);
    
    let bestMatch: {name: string, confidence: number} | null = null;
    let highestScore = 0;
    
    for (const candidate of candidates) {
      const normalizedCandidate = this.normalizeArtistName(candidate.name);
      
      // Exact match gets highest score
      if (normalizedCandidate === normalizedSearch) {
        return { name: candidate.name, confidence: 0.95 };
      }
      
      // Calculate similarity score
      let score = this.calculateStringSimilarity(normalizedSearch, normalizedCandidate);
      
      // Boost score for partial matches
      if (normalizedCandidate.includes(normalizedSearch) || normalizedSearch.includes(normalizedCandidate)) {
        score = Math.max(score, 0.8);
      }
      
      // Boost score based on platform-specific signals
      if ('followers' in candidate && candidate.followers > 1000) {
        score += 0.1; // Popular accounts more likely to be real artists
      }
      
      if ('subscribers' in candidate && candidate.subscribers > 10000) {
        score += 0.1;
      }
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = { name: candidate.name, confidence: score };
      }
    }
    
    // Only return matches with reasonable confidence
    return bestMatch && bestMatch.confidence > 0.4 ? bestMatch : null;
  }
  
  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const matrix: number[][] = [];
    const len1 = str1.length;
    const len2 = str2.length;
    
    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    const maxLen = Math.max(len1, len2);
    return maxLen === 0 ? 1 : 1 - matrix[len2][len1] / maxLen;
  }
  
  /**
   * Normalize artist name for comparison
   */
  private normalizeArtistName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Parse follower count from text (e.g., "1.2K followers" -> 1200)
   */
  private parseFollowerCount(text: string): number {
    const match = text.match(/([\d.]+)\s*([kmb])?/i);
    if (!match) return 0;
    
    const num = parseFloat(match[1]);
    const unit = match[2]?.toLowerCase();
    
    switch (unit) {
      case 'k': return Math.round(num * 1000);
      case 'm': return Math.round(num * 1000000);
      case 'b': return Math.round(num * 1000000000);
      default: return Math.round(num);
    }
  }
  
  /**
   * Save artist profile to database
   */
  private async saveArtistProfile(discoveryResult: ArtistDiscoveryResult): Promise<void> {
    try {
      // Check if profile already exists
      const { data: existingProfile } = await this.supabase
        .from('artist_profiles')
        .select('id')
        .eq('artist_name', discoveryResult.artist_name)
        .maybeSingle();
      
      // Build confidence scores and platform metadata
      const confidenceScores: Record<string, number> = {};
      const platformMetadata: Record<string, any> = {};
      
      // Extract platform-specific data
      let soundcloudUrl = null, soundcloudUsername = null;
      let youtubeChannelUrl = null, youtubeChannelId = null;
      let spotifyArtistId = null, spotifyUrl = null;
      let tracklists1001Url = null;
      
      for (const platform of discoveryResult.platforms) {
        confidenceScores[platform.platform] = platform.confidence;
        platformMetadata[platform.platform] = platform.metadata;
        
        if (platform.url && platform.confidence > 0.4) {
          switch (platform.platform) {
            case 'soundcloud':
              soundcloudUrl = platform.url;
              soundcloudUsername = platform.username || null;
              break;
            case 'youtube':
              youtubeChannelUrl = platform.url;
              youtubeChannelId = platform.id || null;
              break;
            case 'spotify':
              spotifyUrl = platform.url;
              spotifyArtistId = platform.id || null;
              break;
            case '1001tracklists':
              tracklists1001Url = platform.url;
              break;
          }
        }
      }
      
      const profileData = {
        artist_name: discoveryResult.artist_name,
        soundcloud_url: soundcloudUrl,
        soundcloud_username: soundcloudUsername,
        youtube_channel_url: youtubeChannelUrl,
        youtube_channel_id: youtubeChannelId,
        spotify_artist_id: spotifyArtistId,
        spotify_url: spotifyUrl,
        tracklists_1001_url: tracklists1001Url,
        confidence_scores: confidenceScores,
        platform_metadata: {
          platforms: discoveryResult.platforms.filter(p => p.confidence > 0.4),
          discovery_timestamp: new Date().toISOString(),
          total_platforms_found: discoveryResult.platforms.length,
          ...platformMetadata
        },
        verification_status: discoveryResult.overall_confidence > 0.8 ? 'verified' : 'pending',
        discovery_method: 'automatic',
        notes: discoveryResult.discovery_notes.join('; '),
        
        // New staging workflow fields
        proposed_by: 'artist-discovery-worker',
        approval_status: 'pending' // All discovered artists need approval
      };
      
      if (existingProfile) {
        // Update existing profile
        const { error } = await this.supabase
          .from('artist_profiles')
          .update(profileData)
          .eq('id', existingProfile.id);
        
        if (error) {
          throw new Error(`Failed to update artist profile: ${error.message}`);
        }
        
        logger.info(`✅ Updated existing artist profile: ${discoveryResult.artist_name} (approval_status: pending)`);
      } else {
        // Insert new profile
        const { error } = await this.supabase
          .from('artist_profiles')
          .insert(profileData);
        
        if (error) {
          throw new Error(`Failed to insert artist profile: ${error.message}`);
        }
        
        logger.info(`🆕 Created new artist profile: ${discoveryResult.artist_name} (approval_status: pending)`);
      }
      
      // Log discovery summary
      const foundPlatforms = discoveryResult.platforms
        .filter(p => p.confidence > 0.4)
        .map(p => `${p.platform} (${Math.round(p.confidence * 100)}%)`)
        .join(', ');
      
      logger.info(`🎯 Discovery summary for ${discoveryResult.artist_name}: ${foundPlatforms || 'No platforms found'} | Overall confidence: ${Math.round(discoveryResult.overall_confidence * 100)}%`);
      
    } catch (error) {
      logger.error(`Failed to save artist profile for ${discoveryResult.artist_name}`, error as Error);
      throw error;
    }
  }
  
  /**
   * Add delay between requests
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}