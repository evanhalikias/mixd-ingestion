import axios from 'axios';
import { BaseIngestionWorker, type SourceConfig, type WorkerType } from '../lib/worker-interface';
import type { RawMix, RawTrack } from '../lib/supabase/types';
import { createExternalId } from '../lib/external-ids';
import { logger } from '../services/logger';
import { extractArtistsFromVideo, extractMultipleArtists } from '../lib/artist-extraction/intelligent-parser';
import { getMixDetectionDetails } from '../lib/content-classification/mix-detector';
import { detectContextsAndVenues } from '../utils/contextVenueDetector';
import { contextVenueService } from '../lib/contextVenueService';

/**
 * YouTube ingestion worker
 * Fetches mixes from YouTube channels and parses tracklists from descriptions/comments
 */
export class YouTubeWorker extends BaseIngestionWorker {
  readonly workerType: WorkerType = 'youtube';
  readonly name = 'YouTube Worker';
  
  private apiKey: string;
  private baseUrl = 'https://www.googleapis.com/youtube/v3';
  
  constructor() {
    super();
    this.apiKey = process.env.YOUTUBE_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('YOUTUBE_API_KEY environment variable is required');
    }
  }
  
  /**
   * Fetch new mixes from YouTube channels
   */
  async fetchNewMixes(config: SourceConfig, backfillMode: boolean = false): Promise<RawMix[]> {
    const { channels = [], maxResults = 50, dateRange } = config;
    
    if (channels.length === 0) {
      logger.warn('No YouTube channels configured');
      return [];
    }
    
    const rawMixes: RawMix[] = [];
    
    for (const channelId of channels) {
      try {
        const mode = backfillMode ? 'backfill' : 'daily';
        logger.info(`Fetching videos from YouTube channel: ${channelId} (${mode} mode)`);
        const videos = await this.fetchChannelVideos(channelId, maxResults, dateRange, backfillMode);
        rawMixes.push(...videos);
      } catch (err) {
        const errorMessage = `Failed to fetch videos from channel ${channelId}: ${err instanceof Error ? err.message : err}`;
        logger.error(errorMessage, err as Error, {
          workerType: this.workerType,
        });
        
        // Re-throw the error to ensure the job fails properly instead of appearing successful
        throw new Error(errorMessage);
      }
    }
    
    return rawMixes;
  }
  
  /**
   * Parse tracklist from YouTube video description or pinned comment
   */
  async parseTracklist(rawMix: RawMix): Promise<RawTrack[] | null> {
    const videoId = this.extractVideoId(rawMix.source_url);
    if (!videoId) {
      logger.warn(`Could not extract video ID from URL: ${rawMix.source_url}`);
      return null;
    }
    
    logger.debug(`Parsing tracklist for YouTube video: ${rawMix.raw_title}`);
    
    let tracks: RawTrack[] = [];
    
    // First try description
    if (rawMix.raw_description) {
      tracks = this.parseTracklistFromText(rawMix.raw_description, rawMix.id, 'description');
    }
    
    // If no tracks found in description, try pinned comment
    if (tracks.length === 0) {
      try {
        const pinnedComment = await this.getPinnedComment(videoId);
        if (pinnedComment) {
          tracks = this.parseTracklistFromText(pinnedComment, rawMix.id, 'pinned_comment');
        }
      } catch (err) {
        logger.warn(`Failed to fetch pinned comment for video ${videoId}`, { metadata: err });
      }
    }
    
    logger.info(`Parsed ${tracks.length} tracks from YouTube video`);
    return tracks.length > 0 ? tracks : null;
  }
  
  /**
   * Fetch videos from a YouTube channel with pagination support
   */
  private async fetchChannelVideos(
    channelIdOrUrl: string,
    maxResults: number,
    dateRange?: { from?: Date; to?: Date },
    enablePagination: boolean = false
  ): Promise<RawMix[]> {
    // Resolve channel ID from URL if needed
    const channelId = await this.resolveChannelId(channelIdOrUrl);
    
    // First get the uploads playlist ID
    const channelResponse = await axios.get(`${this.baseUrl}/channels`, {
      params: {
        part: 'contentDetails',
        id: channelId,
        key: this.apiKey,
      },
    });
    
    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      throw new Error(`Channel not found: ${channelId} (original: ${channelIdOrUrl})`);
    }
    
    const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;
    
    // Debug logging for playlist ID
    logger.info(`Channel ${channelId} uploads playlist: ${uploadsPlaylistId}`);
    
    // Validate and fix playlist ID if needed
    let validPlaylistId = uploadsPlaylistId;
    if (!uploadsPlaylistId) {
      // Fallback: construct uploads playlist ID from channel ID
      validPlaylistId = channelId.replace('UC', 'UU');
      logger.warn(`No uploads playlist found, using constructed ID: ${validPlaylistId}`);
    } else if (uploadsPlaylistId.startsWith('UUU')) {
      // Fix double-U issue if it exists
      validPlaylistId = uploadsPlaylistId.replace(/^UUU/, 'UU');
      logger.warn(`Fixed double-U playlist ID: ${uploadsPlaylistId} -> ${validPlaylistId}`);
    }
    
    // Get videos from uploads playlist with pagination support
    let allPlaylistItems: any[] = [];
    let nextPageToken: string | undefined;
    let remainingResults = maxResults;
    
    do {
      const batchSize = Math.min(50, remainingResults); // YouTube API max per request is 50
      
      const playlistResponse = await axios.get(`${this.baseUrl}/playlistItems`, {
        params: {
          part: 'snippet,contentDetails',
          playlistId: validPlaylistId,
          maxResults: batchSize,
          pageToken: nextPageToken,
          key: this.apiKey,
        },
      });
      
      const batchItems = playlistResponse.data.items || [];
      allPlaylistItems.push(...batchItems);
      
      nextPageToken = playlistResponse.data.nextPageToken;
      remainingResults -= batchItems.length;
      
      // If pagination is disabled, only get first page
      if (!enablePagination) break;
      
      // Add delay between requests to be respectful
      if (nextPageToken && remainingResults > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } while (nextPageToken && remainingResults > 0);
    
    const playlistItems = allPlaylistItems;
    
    // Get detailed video information in batches (YouTube API can only handle ~50 IDs per request)
    const videoIds = playlistItems.map((item: any) => item.contentDetails.videoId);
    let allVideos: any[] = [];
    
    // Process video IDs in batches of 50
    for (let i = 0; i < videoIds.length; i += 50) {
      const batchIds = videoIds.slice(i, i + 50);
      
      const videosResponse = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'snippet,contentDetails,statistics',
          id: batchIds.join(','),
          key: this.apiKey,
        },
      });
      
      const batchVideos = videosResponse.data.items || [];
      allVideos.push(...batchVideos);
      
      // Add delay between video detail requests
      if (i + 50 < videoIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const videos = allVideos;
    
    logger.info(`Found ${videos.length} total videos from channel (${playlistItems.length} playlist items fetched)`);
    
    // Debug: Log first 10 video titles to see what we're getting
    logger.info('First 10 videos from API:');
    videos.slice(0, 10).forEach((video: any, index: number) => {
      const duration = this.parseDuration(video.contentDetails.duration);
      logger.info(`${index + 1}. "${video.snippet.title}" (${Math.round((duration || 0) / 60)}min, ${video.snippet.publishedAt})`);
    });
    
    const validMixes = videos.filter((video: any) => this.isValidMix(video, dateRange));
    
    logger.info(`After mix filtering: ${validMixes.length} valid mixes`);
    
    return Promise.all(validMixes.map((video: any) => this.mapVideoToRawMix(video)));
  }
  
  /**
   * Fetch a single video by ID
   */
  async fetchVideoData(videoId: string): Promise<RawMix[]> {
    try {
      logger.info(`Fetching YouTube video: ${videoId}`);
      
      const videosResponse = await axios.get(`${this.baseUrl}/videos`, {
        params: {
          part: 'snippet,contentDetails,statistics',
          id: videoId,
          key: this.apiKey,
        },
      });
      
      const videos = videosResponse.data.items || [];
      
      if (videos.length === 0) {
        logger.warn(`Video not found: ${videoId}`);
        return [];
      }
      
      const validVideos = videos.filter((video: any) => this.isValidMix(video));
      return Promise.all(validVideos.map((video: any) => this.mapVideoToRawMix(video)));
        
    } catch (err) {
      logger.error(`Failed to fetch video ${videoId}`, err as Error, {
        workerType: this.workerType,
      });
      return [];
    }
  }

  /**
   * Get pinned comment from a YouTube video
   */
  private async getPinnedComment(videoId: string): Promise<string | null> {
    try {
      const commentsResponse = await axios.get(`${this.baseUrl}/commentThreads`, {
        params: {
          part: 'snippet',
          videoId,
          order: 'relevance',
          maxResults: 10,
          key: this.apiKey,
        },
      });
      
      const comments = commentsResponse.data.items || [];
      
      // Look for pinned comment (usually the first one from channel owner)
      for (const comment of comments) {
        const snippet = comment.snippet.topLevelComment.snippet;
        if (snippet.authorChannelId) {
          // This is likely a pinned comment if it's from the channel owner
          return snippet.textDisplay;
        }
      }
      
      return null;
    } catch (err) {
      logger.debug(`Failed to fetch comments for video ${videoId}:`, { metadata: err });
      return null;
    }
  }
  
  /**
   * Parse tracklist from text (description or comment)
   */
  private parseTracklistFromText(text: string, rawMixId: string, source: string): RawTrack[] {
    const tracks: RawTrack[] = [];
    const lines = text.split('\n');
    let position = 1;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (this.isTrackLine(trimmedLine)) {
        const parsedTrack = this.parseTrackLine(trimmedLine, position);
        if (parsedTrack) {
          tracks.push({
            id: undefined as any, // Will be generated by database
            raw_mix_id: rawMixId,
            line_text: trimmedLine,
            position,
            timestamp_seconds: parsedTrack.timestamp ?? null,
            raw_artist: parsedTrack.artist ?? null,
            raw_title: parsedTrack.title ?? null,
            source,
            created_at: new Date().toISOString(),
          });
          position++;
        }
      }
    }
    
    return tracks;
  }
  
  /**
   * Check if a video is a valid mix using comprehensive detection
   */
  private isValidMix(video: any, dateRange?: { from?: Date; to?: Date }): boolean {
    // Filter by date range first
    if (dateRange) {
      const publishedAt = new Date(video.snippet.publishedAt);
      if (dateRange.from && publishedAt < dateRange.from) return false;
      if (dateRange.to && publishedAt > dateRange.to) return false;
    }
    
    // Get duration in seconds
    const duration = this.parseDuration(video.contentDetails.duration);
    if (!duration) return false;
    
    // Use comprehensive mix detection
    const detection = getMixDetectionDetails(
      video.snippet.title,
      video.snippet.description || '',
      duration,
      video.snippet.channelTitle,
      video.snippet.tags || []
    );
    
    // Log detection details for monitoring
    if (detection.isMix) {
      logger.info(`✅ Mix detected: "${video.snippet.title}" (${detection.confidence}, score: ${detection.score}) - ${detection.reasons.slice(0, 2).join(', ')} - ${Math.round(duration / 60)}min`);
    } else {
      logger.info(`❌ Not a mix: "${video.snippet.title}" (score: ${detection.score}) - ${detection.reasons.slice(0, 2).join(', ')} - ${Math.round(duration / 60)}min`);
    }
    
    return detection.isMix;
  }
  
  /**
   * Parse YouTube duration format (PT1H2M3S) to seconds
   */
  private parseDuration(duration: string): number | null {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;
    
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    const seconds = parseInt(match[3] || '0');
    
    return hours * 3600 + minutes * 60 + seconds;
  }
  
  /**
   * Map YouTube video data to RawMix
   */
  private async mapVideoToRawMix(video: any): Promise<RawMix> {
    const duration = this.parseDuration(video.contentDetails.duration);
    
    // Use intelligent artist extraction
    const artistExtraction = extractArtistsFromVideo(
      video.snippet.title,
      video.snippet.channelTitle,
      video.snippet.description || '',
      video.snippet.channelId
    );
    
    // Handle multiple artists - join them with " x " for now
    let primaryArtist: string;
    if (artistExtraction.performingArtists.length > 1) {
      // Multiple artists - join with " x "
      primaryArtist = artistExtraction.performingArtists.join(' x ');
    } else if (artistExtraction.performingArtists.length === 1) {
      // Single artist
      primaryArtist = artistExtraction.performingArtists[0];
    } else {
      // Fallback: for artist channels, use clean channel name; otherwise use full channel name
      const channelName = video.snippet.channelTitle;
      // If it's an artist channel (like "YOTTO"), use that; otherwise use full name
      primaryArtist = this.extractArtistFromChannelName(channelName) || channelName;
    }
    
    // Get mix detection details for metadata
    const mixDetection = getMixDetectionDetails(
      video.snippet.title,
      video.snippet.description || '',
      duration || 0,
      video.snippet.channelTitle,
      video.snippet.tags || []
    );

    // Detect contexts and venues
    const contextVenueDetection = await detectContextsAndVenues(
      video.snippet.title,
      video.snippet.description || '',
      video.snippet.channelTitle,
      video.snippet.channelId
    );
    
    logger.debug(`Artist extraction for "${video.snippet.title}": ${artistExtraction.extractionMethod} (${artistExtraction.confidence}) -> ${artistExtraction.performingArtists.join(', ')}`);
    
    if (contextVenueDetection.contexts.length > 0 || contextVenueDetection.venue) {
      logger.info(`Context/venue detection for "${video.snippet.title}":`, {
        metadata: {
          contexts: contextVenueDetection.contexts.map(c => `${c.name} (${c.type}, ${c.confidence})`),
          venue: contextVenueDetection.venue ? 
            `${contextVenueDetection.venue.name} (${contextVenueDetection.venue.confidence})` : 
            undefined
        }
      });
    }
    
    return {
      id: undefined as any, // Will be generated by database
      provider: 'youtube',
      source_url: `https://www.youtube.com/watch?v=${video.id}`,
      external_id: createExternalId('youtube', video.id),
      raw_title: video.snippet.title,
      raw_description: video.snippet.description,
      raw_artist: primaryArtist,
      uploaded_at: new Date(video.snippet.publishedAt).toISOString(),
      duration_seconds: duration,
      artwork_url: this.getBestThumbnail(video.snippet.thumbnails),
      raw_metadata: {
        videoId: video.id,
        channelId: video.snippet.channelId,
        channelTitle: video.snippet.channelTitle,
        categoryId: video.snippet.categoryId,
        tags: video.snippet.tags || [],
        viewCount: parseInt(video.statistics.viewCount || '0'),
        likeCount: parseInt(video.statistics.likeCount || '0'),
        commentCount: parseInt(video.statistics.commentCount || '0'),
        // Artist extraction metadata
        artistExtraction: {
          method: artistExtraction.extractionMethod,
          confidence: artistExtraction.confidence,
          allArtists: artistExtraction.performingArtists,
          hostChannel: artistExtraction.hostChannel,
          originalChannelArtist: video.snippet.channelTitle
        },
        // Mix detection metadata
        mixDetection: {
          confidence: mixDetection.confidence,
          score: mixDetection.score,
          reasons: mixDetection.reasons
        },
        // Context and venue detection metadata
        contextVenueDetection: {
          contexts: contextVenueDetection.contexts.map(context => ({
            name: context.name,
            type: context.type,
            role: context.role,
            confidence: context.confidence,
            reason_codes: context.reason_codes,
            external_ids: context.external_ids || {}
          })),
          venue: contextVenueDetection.venue ? {
            name: contextVenueDetection.venue.name,
            city: contextVenueDetection.venue.city,
            country: contextVenueDetection.venue.country,
            confidence: contextVenueDetection.venue.confidence,
            reason_codes: contextVenueDetection.venue.reason_codes,
            external_ids: contextVenueDetection.venue.external_ids || {}
          } : undefined
        } as any
      },
      status: 'pending',
      canonicalized_mix_id: null,
      error_message: null,
      created_at: new Date().toISOString(),
      processed_at: null,
    };
  }
  
  /**
   * Get the best quality thumbnail URL
   */
  private getBestThumbnail(thumbnails: any): string | null {
    if (!thumbnails) return null;
    
    // Prefer higher quality thumbnails
    const qualities = ['maxres', 'high', 'medium', 'standard', 'default'];
    
    for (const quality of qualities) {
      if (thumbnails[quality]) {
        return thumbnails[quality].url;
      }
    }
    
    return null;
  }
  
  /**
   * Extract video ID from YouTube URL
   */
  private extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }
  
  /**
   * Check if a line looks like a track listing
   */
  private isTrackLine(line: string): boolean {
    // Common patterns for track listings in YouTube descriptions:
    // - Contains timestamp (00:00, [00:00], 1:23:45)
    // - Contains "- " (artist - title)
    // - Starts with number (1. , 01. , etc.)
    // - Contains track numbering
    
    const patterns = [
      /^\d+[\.\)]\s+/, // Starts with number
      /\d{1,2}:\d{2}/, // Contains timestamp
      /\s-\s/, // Contains dash separator
      /^\[\d+:\d+\]/, // Starts with timestamp in brackets
      /\d+:\d+\s+/, // Timestamp followed by space
    ];
    
    return patterns.some(pattern => pattern.test(line)) && 
           line.length > 10 && 
           !line.toLowerCase().includes('subscribe') &&
           !line.toLowerCase().includes('follow');
  }
  
  /**
   * Extract clean artist name from channel name
   */
  private extractArtistFromChannelName(channelName: string): string | null {
    // Remove common suffixes that indicate it's an artist channel
    const cleanName = channelName
      .replace(/\s*(music|official|records|recordings|label)\s*$/i, '')
      .replace(/\s*-\s*(topic|auto-generated)\s*$/i, '')
      .trim();
    
    // If it's significantly shorter and doesn't contain business words, it's likely an artist name
    const businessWords = /\b(music|records|entertainment|media|group|collective|agency)\b/i;
    
    if (cleanName.length >= 2 && cleanName.length < channelName.length * 0.8 && !businessWords.test(cleanName)) {
      return cleanName;
    }
    
    // For artist channels like "YOTTO", return as-is if it looks like an artist name
    if (!businessWords.test(channelName) && channelName.length <= 15) {
      return channelName;
    }
    
    return null;
  }

  /**
   * Parse a track line to extract artist, title, and timestamp
   */
  private parseTrackLine(line: string, position: number): {
    artist?: string;
    title?: string;
    timestamp?: number;
  } | null {
    // Remove leading numbers and dots
    let cleanLine = line.replace(/^\d+[\.\)]\s*/, '');
    
    // Extract timestamp - YouTube often uses [mm:ss] or mm:ss format
    const timestampPatterns = [
      /^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*/, // [00:00] or 00:00 at start
      /(\d{1,2}):(\d{2})(?::(\d{2}))?\s+/, // 00:00 followed by space
    ];
    
    let timestamp: number | undefined;
    
    for (const pattern of timestampPatterns) {
      const match = cleanLine.match(pattern);
      if (match) {
        const hours = match[3] ? parseInt(match[1]) : 0;
        const minutes = match[3] ? parseInt(match[2]) : parseInt(match[1]);
        const seconds = match[3] ? parseInt(match[3]) : parseInt(match[2]);
        
        timestamp = hours * 3600 + minutes * 60 + seconds;
        cleanLine = cleanLine.replace(match[0], '').trim();
        break;
      }
    }
    
    // Try to split artist and title by " - "
    const dashSplit = cleanLine.split(' - ');
    if (dashSplit.length >= 2) {
      return {
        artist: dashSplit[0].trim(),
        title: dashSplit.slice(1).join(' - ').trim(),
        timestamp,
      };
    }
    
    // Try to split by " by " (common in YouTube)
    const bySplit = cleanLine.split(' by ');
    if (bySplit.length === 2) {
      return {
        title: bySplit[0].trim(),
        artist: bySplit[1].trim(),
        timestamp,
      };
    }
    
    // If no clear artist/title split, treat the whole line as title
    return {
      title: cleanLine.trim(),
      timestamp,
    };
  }

  /**
   * Resolve a channel URL or username to a Channel ID
   */
  private async resolveChannelId(input: string): Promise<string> {
    // If it's already a channel ID (starts with UC and is 24 chars), return as-is
    if (input.match(/^UC[a-zA-Z0-9_-]{22}$/)) {
      return input;
    }

    // Parse different URL formats
    let username: string | null = null;
    let channelHandle: string | null = null;

    const urlPatterns = [
      // https://www.youtube.com/c/Cercle -> Cercle
      { pattern: /youtube\.com\/c\/([^\/\?&#]+)/, type: 'username' },
      // https://www.youtube.com/@cercle -> @cercle 
      { pattern: /youtube\.com\/@([^\/\?&#]+)/, type: 'handle' },
      // https://www.youtube.com/user/username -> username
      { pattern: /youtube\.com\/user\/([^\/\?&#]+)/, type: 'username' },
      // https://www.youtube.com/channel/UC... -> UC... (already handled above)
      { pattern: /youtube\.com\/channel\/([^\/\?&#]+)/, type: 'id' },
    ];

    for (const { pattern, type } of urlPatterns) {
      const match = input.match(pattern);
      if (match) {
        if (type === 'id') {
          return match[1]; // Direct channel ID
        } else if (type === 'handle') {
          channelHandle = '@' + match[1];
        } else {
          username = match[1];
        }
        break;
      }
    }

    // If no URL pattern matched, assume it's a direct username or handle
    if (!username && !channelHandle) {
      if (input.startsWith('@')) {
        channelHandle = input;
      } else {
        username = input;
      }
    }

    // Try to resolve using the YouTube API
    try {
      let response;
      
      if (channelHandle) {
        // Use handle (new YouTube API feature)
        response = await axios.get(`${this.baseUrl}/channels`, {
          params: {
            part: 'id',
            forHandle: channelHandle,
            key: this.apiKey,
          },
        });
      } else if (username) {
        // Use legacy username
        response = await axios.get(`${this.baseUrl}/channels`, {
          params: {
            part: 'id',
            forUsername: username,
            key: this.apiKey,
          },
        });
      } else {
        throw new Error('Could not parse channel identifier');
      }

      if (response.data.items && response.data.items.length > 0) {
        const resolvedId = response.data.items[0].id;
        logger.info(`Resolved channel: ${input} -> ${resolvedId}`);
        return resolvedId;
      }

      throw new Error(`Channel not found for: ${input}`);
    } catch (error) {
      logger.error(`Failed to resolve channel ID for: ${input}`, error as Error);
      throw new Error(`Could not resolve channel: ${input}`);
    }
  }
}