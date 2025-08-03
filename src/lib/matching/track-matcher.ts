import { getServiceClient } from '../supabase/service';
import {
  findBestTrackMatch,
  findBestArtistMatch,
  normalizeText,
  extractArtistVariations,
  generateSearchAliases,
  validateMatch,
  type MatchCandidate,
  type MatchResult,
} from './fuzzy-matcher';
import { logger } from '../../services/logger';

/**
 * Track matching service for canonicalization
 * Handles matching raw track data against existing tracks in the database
 */

export interface TrackMatchResult {
  track: MatchResult<ExistingTrack> | null;
  artists: MatchResult<ExistingArtist>[];
  shouldCreateNew: boolean;
  confidence: 'high' | 'medium' | 'low';
  aliases: string[];
}

export interface ExistingTrack {
  id: string;
  title: string;
  metadata?: any;
}

export interface ExistingArtist {
  id: string;
  name: string;
  metadata?: any;
}

export interface RawTrackData {
  rawTitle?: string;
  rawArtist?: string;
  lineText: string;
  position: number;
}

/**
 * Main track matching service
 */
export class TrackMatcher {
  private supabase = getServiceClient();
  private trackCache = new Map<string, ExistingTrack[]>();
  private artistCache = new Map<string, ExistingArtist[]>();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes
  private lastCacheUpdate = 0;
  
  /**
   * Match a raw track against existing tracks and artists
   */
  async matchTrack(rawTrack: RawTrackData): Promise<TrackMatchResult> {
    const { rawTitle, rawArtist, lineText } = rawTrack;
    
    // If we don't have basic track info, can't match
    if (!rawTitle && !rawArtist && !lineText) {
      return {
        track: null,
        artists: [],
        shouldCreateNew: false,
        confidence: 'low',
        aliases: [],
      };
    }
    
    // Extract title and artists from available data
    const titleToMatch = rawTitle || this.extractTitleFromLine(lineText);
    const artistsToMatch = this.extractArtistsFromData(rawArtist, lineText);
    
    if (!titleToMatch) {
      logger.debug(`No title extracted for track: ${lineText}`);
      return {
        track: null,
        artists: [],
        shouldCreateNew: false,
        confidence: 'low',
        aliases: [],
      };
    }
    
    logger.debug(`Matching track: "${titleToMatch}" by [${artistsToMatch.join(', ')}]`);
    
    // Match against existing tracks
    const trackMatch = await this.findMatchingTrack(titleToMatch);
    
    // Match artists
    const artistMatches = await this.findMatchingArtists(artistsToMatch);
    
    // Determine overall confidence and whether to create new
    const confidence = this.calculateOverallConfidence(trackMatch, artistMatches);
    const shouldCreateNew = this.shouldCreateNewTrack(trackMatch, artistMatches, confidence);
    
    // Generate aliases for track_aliases table
    const aliases = this.generateTrackAliases(titleToMatch, artistsToMatch, lineText);
    
    return {
      track: trackMatch,
      artists: artistMatches,
      shouldCreateNew,
      confidence,
      aliases,
    };
  }
  
  /**
   * Find matching track in database
   */
  private async findMatchingTrack(title: string): Promise<MatchResult<ExistingTrack> | null> {
    // Get potential matches from database
    const candidates = await this.searchTracks(title);
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Convert to match candidates
    const matchCandidates: MatchCandidate[] = candidates.map(track => ({
      id: track.id,
      text: track.title,
      metadata: track,
    }));
    
    const result = findBestTrackMatch(title, matchCandidates);
    
    if (result.match) {
      // Validate the match
      const validation = validateMatch(title, result.match, result.score);
      if (!validation.isValid) {
        logger.debug(`Track match validation failed: ${validation.reason}`);
        return null;
      }
      
      // Convert back to track match result
      return {
        match: result.match.metadata,
        score: result.score,
        isHighConfidence: result.isHighConfidence,
        alternatives: result.alternatives.map(alt => ({
          item: alt.item.metadata,
          score: alt.score,
        })),
      };
    }
    
    return null;
  }
  
  /**
   * Find matching artists in database
   */
  async findMatchingArtists(artistNames: string[]): Promise<MatchResult<ExistingArtist>[]> {
    const matches: MatchResult<ExistingArtist>[] = [];
    
    for (const artistName of artistNames) {
      const candidates = await this.searchArtists(artistName);
      
      if (candidates.length === 0) {
        matches.push({
          match: null,
          score: 0,
          isHighConfidence: false,
          alternatives: [],
        });
        continue;
      }
      
      const matchCandidates: MatchCandidate[] = candidates.map(artist => ({
        id: artist.id,
        text: artist.name,
        metadata: artist,
      }));
      
      const result = findBestArtistMatch(artistName, matchCandidates);
      
      if (result.match) {
        const validation = validateMatch(artistName, result.match, result.score);
        if (validation.isValid) {
          matches.push({
            match: result.match.metadata,
            score: result.score,
            isHighConfidence: result.isHighConfidence,
            alternatives: result.alternatives.map(alt => ({
              item: alt.item.metadata,
              score: alt.score,
            })),
          });
        } else {
          logger.debug(`Artist match validation failed: ${validation.reason}`);
          matches.push({
            match: null,
            score: result.score,
            isHighConfidence: false,
            alternatives: result.alternatives.map(alt => ({
              item: alt.item.metadata,
              score: alt.score,
            })),
          });
        }
      } else {
        matches.push({
          match: null,
          score: result.score,
          isHighConfidence: false,
          alternatives: result.alternatives.map(alt => ({
            item: alt.item.metadata,
            score: alt.score,
          })),
        });
      }
    }
    
    return matches;
  }
  
  /**
   * Search for tracks in database with caching
   */
  private async searchTracks(query: string): Promise<ExistingTrack[]> {
    await this.refreshCacheIfNeeded();
    
    const normalizedQuery = normalizeText(query);
    const cacheKey = normalizedQuery.substring(0, 3); // Use first 3 chars as cache key
    
    if (this.trackCache.has(cacheKey)) {
      return this.trackCache.get(cacheKey)!.filter(track =>
        normalizeText(track.title).includes(normalizedQuery) ||
        normalizedQuery.includes(normalizeText(track.title))
      );
    }
    
    // Search database
    const { data, error } = await this.supabase
      .from('tracks')
      .select('id, title')
      .ilike('title', `%${normalizedQuery}%`)
      .limit(50);
    
    if (error) {
      logger.error('Error searching tracks', error);
      return [];
    }
    
    const tracks = data.map(track => ({
      id: track.id,
      title: track.title,
    }));
    
    this.trackCache.set(cacheKey, tracks);
    return tracks;
  }
  
  /**
   * Search for artists in database with caching
   */
  private async searchArtists(query: string): Promise<ExistingArtist[]> {
    await this.refreshCacheIfNeeded();
    
    const normalizedQuery = normalizeText(query);
    const cacheKey = normalizedQuery.substring(0, 3);
    
    if (this.artistCache.has(cacheKey)) {
      return this.artistCache.get(cacheKey)!.filter(artist =>
        normalizeText(artist.name).includes(normalizedQuery) ||
        normalizedQuery.includes(normalizeText(artist.name))
      );
    }
    
    // Search database
    const { data, error } = await this.supabase
      .from('artists')
      .select('id, name')
      .ilike('name', `%${normalizedQuery}%`)
      .limit(50);
    
    if (error) {
      logger.error('Error searching artists', error);
      return [];
    }
    
    const artists = data.map(artist => ({
      id: artist.id,
      name: artist.name,
    }));
    
    this.artistCache.set(cacheKey, artists);
    return artists;
  }
  
  /**
   * Extract title from raw line text
   */
  private extractTitleFromLine(lineText: string): string | null {
    if (!lineText) return null;
    
    // Remove timestamps
    let clean = lineText.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, '');
    
    // Remove leading numbers
    clean = clean.replace(/^\d+[\.\)]\s*/, '');
    
    // Split by " - " if present
    const dashSplit = clean.split(' - ');
    if (dashSplit.length >= 2) {
      return dashSplit.slice(1).join(' - ').trim();
    }
    
    // Split by " by " if present (title by artist)
    const bySplit = clean.split(' by ');
    if (bySplit.length === 2) {
      return bySplit[0].trim();
    }
    
    return clean.trim();
  }
  
  /**
   * Extract artists from raw data
   */
  private extractArtistsFromData(rawArtist?: string, lineText?: string): string[] {
    const artists = new Set<string>();
    
    // Add raw artist if provided
    if (rawArtist) {
      extractArtistVariations(rawArtist).forEach(artist => artists.add(artist));
    }
    
    // Extract from line text
    if (lineText) {
      const extractedArtist = this.extractArtistFromLine(lineText);
      if (extractedArtist) {
        extractArtistVariations(extractedArtist).forEach(artist => artists.add(artist));
      }
    }
    
    return Array.from(artists).filter(artist => artist.length > 1);
  }
  
  /**
   * Extract artist from line text
   */
  private extractArtistFromLine(lineText: string): string | null {
    if (!lineText) return null;
    
    // Remove timestamps and numbers
    let clean = lineText.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, '');
    clean = clean.replace(/^\d+[\.\)]\s*/, '');
    
    // Split by " - " (artist - title)
    const dashSplit = clean.split(' - ');
    if (dashSplit.length >= 2) {
      return dashSplit[0].trim();
    }
    
    // Split by " by " (title by artist)
    const bySplit = clean.split(' by ');
    if (bySplit.length === 2) {
      return bySplit[1].trim();
    }
    
    return null;
  }
  
  /**
   * Calculate overall confidence based on track and artist matches
   */
  private calculateOverallConfidence(
    trackMatch: MatchResult<ExistingTrack> | null,
    artistMatches: MatchResult<ExistingArtist>[]
  ): 'high' | 'medium' | 'low' {
    const trackConfident = trackMatch?.isHighConfidence || false;
    const artistsConfident = artistMatches.some(match => match.isHighConfidence);
    
    if (trackConfident && artistsConfident) return 'high';
    if (trackConfident || artistsConfident) return 'medium';
    return 'low';
  }
  
  /**
   * Determine whether to create a new track
   */
  private shouldCreateNewTrack(
    trackMatch: MatchResult<ExistingTrack> | null,
    artistMatches: MatchResult<ExistingArtist>[],
    confidence: 'high' | 'medium' | 'low'
  ): boolean {
    // If we have a high confidence track match, don't create new
    if (trackMatch?.isHighConfidence) {
      return false;
    }
    
    // If we have reasonable track or artist info but no high confidence matches,
    // create new with is_verified=false for admin review
    return true;
  }
  
  /**
   * Generate aliases for track_aliases table
   */
  private generateTrackAliases(
    title: string,
    artists: string[],
    lineText: string
  ): string[] {
    const aliases = new Set<string>();
    
    // Add title variations
    generateSearchAliases(title).forEach(alias => aliases.add(alias));
    
    // Add combined artist + title variations
    for (const artist of artists.slice(0, 2)) { // Limit to first 2 artists
      aliases.add(`${artist} - ${title}`);
      aliases.add(`${title} by ${artist}`);
    }
    
    // Add original line text as alias
    if (lineText && lineText !== title) {
      aliases.add(lineText.trim());
    }
    
    return Array.from(aliases).filter(alias => alias.length > 0);
  }
  
  /**
   * Refresh cache if expired
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate > this.cacheExpiry) {
      this.trackCache.clear();
      this.artistCache.clear();
      this.lastCacheUpdate = now;
    }
  }
  
  /**
   * Clear all caches (useful for testing)
   */
  clearCache(): void {
    this.trackCache.clear();
    this.artistCache.clear();
    this.lastCacheUpdate = 0;
  }
}