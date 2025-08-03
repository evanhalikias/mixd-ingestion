import { getServiceClient } from '../lib/supabase/service';
import { TrackMatcher, type TrackMatchResult } from '../lib/matching/track-matcher';
import { checkForDuplicateMix, mergeExternalIds } from '../lib/duplicate-detection';
import { addExternalId, type ExternalIds } from '../lib/external-ids';
import { logger } from '../services/logger';
import type { RawMix, RawTrack } from '../lib/supabase/types';

/**
 * Canonicalization pipeline for converting raw mixes to production schema
 * Handles the full process: raw staging → production tables
 */

export interface CanonicalizationResult {
  success: boolean;
  mixId?: string;
  tracksCreated: number;
  artistsCreated: number;
  aliasesCreated: number;
  errors: string[];
  skipped?: boolean;
  reason?: string;
}

export interface CanonicalizationOptions {
  mode?: 'backfill' | 'rolling';
  autoVerifyThreshold?: number; // Confidence threshold for auto-verification (0-1)
  systemUserId?: string; // User ID for automated verification tracking
}

export class MixCanonicalizer {
  private supabase = getServiceClient();
  private trackMatcher = new TrackMatcher();
  
  /**
   * Canonicalize a single raw mix
   */
  async canonicalizeMix(
    rawMixId: string, 
    options: CanonicalizationOptions = {}
  ): Promise<CanonicalizationResult> {
    const result: CanonicalizationResult = {
      success: false,
      tracksCreated: 0,
      artistsCreated: 0,
      aliasesCreated: 0,
      errors: [],
    };
    
    try {
      // Get raw mix and tracks
      const { rawMix, rawTracks } = await this.getRawMixData(rawMixId);
      
      if (!rawMix) {
        result.errors.push(`Raw mix not found: ${rawMixId}`);
        return result;
      }
      
      logger.info(`Canonicalizing mix: ${rawMix.raw_title}`, {
        rawMixId,
        workerType: 'canonicalization',
      });
      
      // Check for existing duplicates in production
      const externalIds = this.createExternalIds(rawMix);
      const duplicateCheck = await checkForDuplicateMix(externalIds);
      
      if (duplicateCheck.isDuplicate) {
        // Update existing mix instead of creating new
        return await this.updateExistingMix(rawMix, rawTracks, duplicateCheck.existingMixId!, result);
      }
      
      // Create new mix in production
      return await this.createNewMix(rawMix, rawTracks, result, options);
      
    } catch (err) {
      const error = `Canonicalization failed for ${rawMixId}: ${err}`;
      result.errors.push(error);
      logger.error(error, err as Error, { rawMixId });
      return result;
    }
  }
  
  /**
   * Get raw mix and associated tracks
   */
  private async getRawMixData(rawMixId: string): Promise<{
    rawMix: RawMix | null;
    rawTracks: RawTrack[];
  }> {
    // Get raw mix
    const { data: rawMix, error: mixError } = await this.supabase
      .from('raw_mixes')
      .select('*')
      .eq('id', rawMixId)
      .single();
    
    if (mixError) {
      throw new Error(`Failed to fetch raw mix: ${mixError.message}`);
    }
    
    // Get raw tracks
    const { data: rawTracks, error: tracksError } = await this.supabase
      .from('raw_tracks')
      .select('*')
      .eq('raw_mix_id', rawMixId)
      .order('position', { ascending: true });
    
    if (tracksError) {
      throw new Error(`Failed to fetch raw tracks: ${tracksError.message}`);
    }
    
    return { rawMix, rawTracks: rawTracks || [] };
  }
  
  /**
   * Determine if mix should be auto-verified based on mode
   */
  private shouldAutoVerifyMix(options: CanonicalizationOptions): boolean {
    // Rolling mode can auto-verify based on confidence
    // Backfill mode always requires manual review
    return options.mode === 'rolling';
  }

  /**
   * Get verification fields for auto-verified entities
   */
  private getVerificationFields(options: CanonicalizationOptions, shouldVerify: boolean): {
    is_verified: boolean;
    verified_by: string | null;
    verified_at: string | null;
  } {
    if (shouldVerify && options.systemUserId) {
      return {
        is_verified: true,
        verified_by: options.systemUserId,
        verified_at: new Date().toISOString()
      };
    }
    
    return {
      is_verified: shouldVerify,
      verified_by: null,
      verified_at: null
    };
  }

  /**
   * Determine if track should be auto-verified
   */
  private shouldAutoVerifyTrack(confidence: string, options: CanonicalizationOptions): boolean {
    if (options.mode === 'backfill') {
      return false; // Always manual review for backfill
    }
    
    // For rolling mode, use confidence threshold
    const threshold = options.autoVerifyThreshold || 0.9;
    return confidence === 'high' || (confidence === 'medium' && threshold <= 0.7);
  }

  /**
   * Determine if artist should be auto-verified
   */
  private shouldAutoVerifyArtist(options: CanonicalizationOptions): boolean {
    // Artists follow same rules as tracks but are generally more conservative
    return options.mode === 'rolling';
  }

  /**
   * Create external IDs object from raw mix
   */
  private createExternalIds(rawMix: RawMix): ExternalIds {
    let externalIds: ExternalIds = {};
    
    if (rawMix.external_id) {
      externalIds = addExternalId(externalIds, rawMix.provider, rawMix.external_id);
    }
    
    return externalIds;
  }
  
  /**
   * Update existing mix with new data (merge approach)
   */
  private async updateExistingMix(
    rawMix: RawMix,
    rawTracks: RawTrack[],
    existingMixId: string,
    result: CanonicalizationResult
  ): Promise<CanonicalizationResult> {
    logger.info(`Updating existing mix: ${existingMixId}`, {
      rawMixId: rawMix.id,
    });
    
    // Get existing mix data
    const { data: existingMix, error: fetchError } = await this.supabase
      .from('mixes')
      .select('external_ids, description, cover_url, duration')
      .eq('id', existingMixId)
      .single();
    
    if (fetchError) {
      result.errors.push(`Failed to fetch existing mix: ${fetchError.message}`);
      return result;
    }
    
    // Merge external IDs
    const newExternalIds = this.createExternalIds(rawMix);
    const mergedExternalIds = mergeExternalIds(
      existingMix.external_ids as ExternalIds,
      newExternalIds
    );
    
    // Update mix with merged data
    const { error: updateError } = await this.supabase
      .from('mixes')
      .update({
        external_ids: mergedExternalIds,
        // Only update if current values are null/empty
        description: existingMix.description || rawMix.raw_description,
        cover_url: existingMix.cover_url || rawMix.artwork_url,
        duration: existingMix.duration || rawMix.duration_seconds,
      })
      .eq('id', existingMixId);
    
    if (updateError) {
      result.errors.push(`Failed to update existing mix: ${updateError.message}`);
      return result;
    }
    
    // Process tracks if this source has better tracklist data
    if (rawTracks.length > 0) {
      await this.processTracksForExistingMix(existingMixId, rawTracks, result);
    }
    
    // Mark raw mix as processed
    await this.markRawMixProcessed(rawMix.id, existingMixId);
    
    result.success = true;
    result.mixId = existingMixId;
    result.skipped = false;
    result.reason = 'Updated existing mix with merged data';
    
    return result;
  }
  
  /**
   * Create new mix in production
   */
  private async createNewMix(
    rawMix: RawMix,
    rawTracks: RawTrack[],
    result: CanonicalizationResult,
    options: CanonicalizationOptions = {}
  ): Promise<CanonicalizationResult> {
    // Create the mix record
    const mixData = {
      title: rawMix.raw_title || 'Untitled Mix',
      description: rawMix.raw_description,
      audio_url: rawMix.source_url, // Use source URL as audio URL for now
      cover_url: rawMix.artwork_url,
      duration: rawMix.duration_seconds,
      published_date: rawMix.uploaded_at,
      external_ids: this.createExternalIds(rawMix),
      ...this.getVerificationFields(options, this.shouldAutoVerifyMix(options)),
      ingestion_source: rawMix.provider,
      raw_mix_id: rawMix.id,
    };
    
    const { data: mix, error: mixError } = await this.supabase
      .from('mixes')
      .insert(mixData)
      .select('id')
      .single();
    
    if (mixError) {
      result.errors.push(`Failed to create mix: ${mixError.message}`);
      return result;
    }
    
    const mixId = mix.id;
    result.mixId = mixId;
    
    logger.info(`Created mix: ${mixId}`, { rawMixId: rawMix.id });
    
    // Process mix artist if available
    if (rawMix.raw_artist) {
      await this.processMixArtist(mixId, rawMix.raw_artist, result, options);
    }
    
    // Process tracks
    if (rawTracks.length > 0) {
      await this.processTracks(mixId, rawTracks, result, options);
    }
    
    // Mark raw mix as processed
    await this.markRawMixProcessed(rawMix.id, mixId);
    
    result.success = true;
    return result;
  }
  
  /**
   * Process mix artist (DJ/host)
   */
  private async processMixArtist(
    mixId: string,
    rawArtist: string,
    result: CanonicalizationResult,
    options: CanonicalizationOptions = {}
  ): Promise<void> {
    try {
      const artistMatch = await this.trackMatcher.findMatchingArtists([rawArtist]);
      
      let artistId: string;
      
      if (artistMatch[0]?.match) {
        // Use existing artist
        artistId = artistMatch[0].match.id;
        logger.debug(`Using existing artist: ${artistMatch[0].match.name}`);
      } else {
        // Create new artist
        const { data: artist, error: artistError } = await this.supabase
          .from('artists')
          .insert({
            name: rawArtist,
            ...this.getVerificationFields(options, this.shouldAutoVerifyArtist(options)),
            ingestion_source: 'auto',
          })
          .select('id')
          .single();
        
        if (artistError) {
          result.errors.push(`Failed to create artist: ${artistError.message}`);
          return;
        }
        
        artistId = artist.id;
        result.artistsCreated++;
        logger.debug(`Created new artist: ${rawArtist}`);
      }
      
      // Link artist to mix
      const { error: linkError } = await this.supabase
        .from('mix_artists')
        .insert({
          mix_id: mixId,
          artist_id: artistId,
          role: 'dj',
        });
      
      if (linkError) {
        result.errors.push(`Failed to link mix artist: ${linkError.message}`);
      }
      
    } catch (err) {
      result.errors.push(`Failed to process mix artist: ${err}`);
    }
  }
  
  /**
   * Process tracks for a mix
   */
  private async processTracks(
    mixId: string,
    rawTracks: RawTrack[],
    result: CanonicalizationResult,
    options: CanonicalizationOptions = {}
  ): Promise<void> {
    for (const rawTrack of rawTracks) {
      try {
        await this.processTrack(mixId, rawTrack, result, options);
      } catch (err) {
        result.errors.push(`Failed to process track ${rawTrack.position}: ${err}`);
      }
    }
  }
  
  /**
   * Process tracks for existing mix (additive approach)
   */
  private async processTracksForExistingMix(
    mixId: string,
    rawTracks: RawTrack[],
    result: CanonicalizationResult
  ): Promise<void> {
    // Check if mix already has tracks
    const { data: existingTracks, error } = await this.supabase
      .from('mix_tracks')
      .select('position')
      .eq('mix_id', mixId)
      .limit(1);
    
    if (error) {
      result.errors.push(`Failed to check existing tracks: ${error.message}`);
      return;
    }
    
    // If mix already has tracks, don't overwrite (preserve existing data)
    if (existingTracks && existingTracks.length > 0) {
      logger.info(`Mix ${mixId} already has tracks, skipping track processing`);
      return;
    }
    
    // Process tracks normally
    await this.processTracks(mixId, rawTracks, result);
  }
  
  /**
   * Process a single track
   */
  private async processTrack(
    mixId: string,
    rawTrack: RawTrack,
    result: CanonicalizationResult,
    options: CanonicalizationOptions = {}
  ): Promise<void> {
    // Match against existing tracks and artists
    const matchResult = await this.trackMatcher.matchTrack({
      rawTitle: rawTrack.raw_title || undefined,
      rawArtist: rawTrack.raw_artist || undefined,
      lineText: rawTrack.line_text,
      position: rawTrack.position || 0,
    });
    
    let trackId: string;
    
    if (matchResult.track?.match && matchResult.track.isHighConfidence) {
      // Use existing track
      trackId = matchResult.track.match.id;
      logger.debug(`Using existing track: ${matchResult.track.match.title}`);
    } else {
      // Create new track
      trackId = await this.createNewTrack(rawTrack, matchResult, result);
    }
    
    // Create mix_tracks relationship
    const { error: mixTrackError } = await this.supabase
      .from('mix_tracks')
      .insert({
        mix_id: mixId,
        track_id: trackId,
        position: rawTrack.position,
        start_time: rawTrack.timestamp_seconds,
      });
    
    if (mixTrackError) {
      result.errors.push(`Failed to create mix_tracks: ${mixTrackError.message}`);
    }
    
    // Create track aliases
    await this.createTrackAliases(trackId, matchResult.aliases, mixId, result);
  }
  
  /**
   * Create new track
   */
  private async createNewTrack(
    rawTrack: RawTrack,
    matchResult: TrackMatchResult,
    result: CanonicalizationResult
  ): Promise<string> {
    const trackTitle = rawTrack.raw_title || this.extractTitleFromLine(rawTrack.line_text) || 'Unknown Track';
    
    const { data: track, error: trackError } = await this.supabase
      .from('tracks')
      .insert({
        title: trackTitle,
        ...this.getVerificationFields(options, this.shouldAutoVerifyTrack(matchResult.confidence, options)),
        ingestion_source: 'auto',
      })
      .select('id')
      .single();
    
    if (trackError) {
      throw new Error(`Failed to create track: ${trackError.message}`);
    }
    
    result.tracksCreated++;
    
    // Create track artists
    if (matchResult.artists.length > 0) {
      await this.createTrackArtists(track.id, matchResult.artists, result, options);
    } else if (rawTrack.raw_artist) {
      // Create artist from raw data
      await this.createTrackArtistFromRaw(track.id, rawTrack.raw_artist, result, options);
    }
    
    return track.id;
  }
  
  /**
   * Create track artists
   */
  private async createTrackArtists(
    trackId: string,
    artistMatches: TrackMatchResult['artists'],
    result: CanonicalizationResult,
    options: CanonicalizationOptions = {}
  ): Promise<void> {
    for (let i = 0; i < artistMatches.length; i++) {
      const artistMatch = artistMatches[i];
      let artistId: string;
      
      if (artistMatch.match && artistMatch.isHighConfidence) {
        artistId = artistMatch.match.id;
      } else {
        // Would need artist name to create new one
        // Skip for now if no high confidence match
        continue;
      }
      
      const { error } = await this.supabase
        .from('track_artists')
        .insert({
          track_id: trackId,
          artist_id: artistId,
          role: i === 0 ? 'primary' : 'featured',
          position: i + 1,
        });
      
      if (error) {
        result.errors.push(`Failed to create track_artists: ${error.message}`);
      }
    }
  }
  
  /**
   * Create track artist from raw data
   */
  private async createTrackArtistFromRaw(
    trackId: string,
    rawArtist: string,
    result: CanonicalizationResult,
    options: CanonicalizationOptions = {}
  ): Promise<void> {
    const { data: artist, error: artistError } = await this.supabase
      .from('artists')
      .insert({
        name: rawArtist,
        ...this.getVerificationFields(options, this.shouldAutoVerifyArtist(options)),
        ingestion_source: 'auto',
      })
      .select('id')
      .single();
    
    if (artistError) {
      result.errors.push(`Failed to create artist: ${artistError.message}`);
      return;
    }
    
    result.artistsCreated++;
    
    const { error: linkError } = await this.supabase
      .from('track_artists')
      .insert({
        track_id: trackId,
        artist_id: artist.id,
        role: 'primary',
        position: 1,
      });
    
    if (linkError) {
      result.errors.push(`Failed to link track artist: ${linkError.message}`);
    }
  }
  
  /**
   * Create track aliases
   */
  private async createTrackAliases(
    trackId: string,
    aliases: string[],
    mixId: string,
    result: CanonicalizationResult
  ): Promise<void> {
    for (const alias of aliases) {
      const { error } = await this.supabase
        .from('track_aliases')
        .insert({
          track_id: trackId,
          alias,
          source_type: 'ingestion',
          mix_id: mixId,
          is_primary: false,
        });
      
      if (error) {
        // Don't fail if alias already exists
        if (!error.message.includes('duplicate')) {
          result.errors.push(`Failed to create alias: ${error.message}`);
        }
      } else {
        result.aliasesCreated++;
      }
    }
  }
  
  /**
   * Mark raw mix as processed
   */
  private async markRawMixProcessed(rawMixId: string, canonicalizedMixId: string): Promise<void> {
    const { error } = await this.supabase
      .from('raw_mixes')
      .update({
        status: 'canonicalized',
        canonicalized_mix_id: canonicalizedMixId,
        processed_at: new Date().toISOString(),
      })
      .eq('id', rawMixId);
    
    if (error) {
      logger.error(`Failed to mark raw mix as processed: ${error.message}`);
    }
  }
  
  /**
   * Extract title from line text (helper method)
   */
  private extractTitleFromLine(lineText: string): string | null {
    if (!lineText) return null;
    
    // Remove timestamps and numbers
    let clean = lineText.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, '');
    clean = clean.replace(/^\d+[\.\)]\s*/, '');
    
    // Split by " - " if present
    const dashSplit = clean.split(' - ');
    if (dashSplit.length >= 2) {
      return dashSplit.slice(1).join(' - ').trim();
    }
    
    return clean.trim();
  }
}