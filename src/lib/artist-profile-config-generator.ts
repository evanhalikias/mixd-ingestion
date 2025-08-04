import { getServiceClient } from './supabase/service';
import type { ArtistProfile, BaseJobPayload } from './supabase/types';
import type { SourceConfig } from './worker-interface';
import { logger } from '../services/logger';

/**
 * Configuration generator for creating worker configs from discovered artist profiles
 */
export class ArtistProfileConfigGenerator {
  private supabase = getServiceClient();
  
  /**
   * Generate worker configurations for all verified artist profiles
   */
  async generateAllWorkerConfigs(options: {
    verificationStatus?: 'verified' | 'pending' | 'manual_review';
    minConfidence?: number;
    platforms?: ('soundcloud' | 'youtube' | '1001tracklists')[];
  } = {}): Promise<{
    soundcloud: SourceConfig;
    youtube: SourceConfig;
    '1001tracklists': SourceConfig;
  }> {
    const {
      verificationStatus = 'verified',
      minConfidence = 0.5,
      platforms = ['soundcloud', 'youtube', '1001tracklists']
    } = options;
    
    // Fetch artist profiles
    const { data: profiles, error } = await this.supabase
      .from('artist_profiles')
      .select('*')
      .eq('verification_status', verificationStatus);
    
    if (error) {
      throw new Error(`Failed to fetch artist profiles: ${error.message}`);
    }
    
    if (!profiles || profiles.length === 0) {
      logger.warn(`No artist profiles found with status: ${verificationStatus}`);
      return {
        soundcloud: { artists: [] },
        youtube: { channels: [] },
        '1001tracklists': { searchTerms: [] }
      };
    }
    
    logger.info(`Generating worker configs from ${profiles.length} artist profiles`);
    
    // Generate platform-specific configs
    const configs = {
      soundcloud: this.generateSoundCloudConfig(profiles, minConfidence),
      youtube: this.generateYouTubeConfig(profiles, minConfidence),
      '1001tracklists': this.generate1001TracklistsConfig(profiles, minConfidence)
    };
    
    // Log summary
    Object.entries(configs).forEach(([platform, config]) => {
      const count = this.getConfigItemCount(config);
      logger.info(`Generated ${platform} config with ${count} items`);
    });
    
    return configs;
  }
  
  /**
   * Generate worker configurations for a specific artist
   */
  async generateArtistWorkerConfigs(artistName: string): Promise<{
    soundcloud: SourceConfig;
    youtube: SourceConfig;
    '1001tracklists': SourceConfig;
  } | null> {
    // Find artist profile
    const { data: profile, error } = await this.supabase
      .from('artist_profiles')
      .select('*')
      .eq('artist_name', artistName)
      .maybeSingle();
    
    if (error) {
      throw new Error(`Failed to fetch artist profile: ${error.message}`);
    }
    
    if (!profile) {
      logger.warn(`No artist profile found for: ${artistName}`);
      return null;
    }
    
    return {
      soundcloud: this.generateSoundCloudConfig([profile], 0.4),
      youtube: this.generateYouTubeConfig([profile], 0.4),
      '1001tracklists': this.generate1001TracklistsConfig([profile], 0.4)
    };
  }
  
  /**
   * Generate job payloads for automated ingestion based on artist profiles
   */
  async generateIngestionJobs(options: {
    mode?: 'backfill' | 'rolling';
    batchSize?: number;
    verificationStatus?: 'verified' | 'pending' | 'manual_review';
    minConfidence?: number;
  } = {}): Promise<BaseJobPayload[]> {
    const {
      mode = 'rolling',
      batchSize = 50,
      verificationStatus = 'verified',
      minConfidence = 0.7
    } = options;
    
    const configs = await this.generateAllWorkerConfigs({
      verificationStatus,
      minConfidence
    });
    
    const jobs: BaseJobPayload[] = [];
    
    // Generate SoundCloud jobs
    if (configs.soundcloud.artists && configs.soundcloud.artists.length > 0) {
      for (const artist of configs.soundcloud.artists) {
        jobs.push({
          worker_type: 'soundcloud',
          source_id: artist,
          mode,
          batch_size: batchSize
        });
      }
    }
    
    // Generate YouTube jobs
    if (configs.youtube.channels && configs.youtube.channels.length > 0) {
      for (const channel of configs.youtube.channels) {
        jobs.push({
          worker_type: 'youtube',
          source_id: channel,
          mode,
          batch_size: batchSize
        });
      }
    }
    
    // Generate 1001Tracklists jobs
    if (configs['1001tracklists'].searchTerms && configs['1001tracklists'].searchTerms.length > 0) {
      for (const searchTerm of configs['1001tracklists'].searchTerms) {
        jobs.push({
          worker_type: '1001tracklists',
          source_id: searchTerm,
          mode,
          batch_size: batchSize
        });
      }
    }
    
    logger.info(`Generated ${jobs.length} ingestion jobs from artist profiles`);
    return jobs;
  }
  
  /**
   * Generate SoundCloud worker configuration
   */
  private generateSoundCloudConfig(profiles: ArtistProfile[], minConfidence: number): SourceConfig {
    const artists: string[] = [];
    
    for (const profile of profiles) {
      const confidence = this.getPlatformConfidence(profile, 'soundcloud');
      
      if (confidence >= minConfidence && profile.soundcloud_username) {
        artists.push(profile.soundcloud_username);
      }
    }
    
    return { artists };
  }
  
  /**
   * Generate YouTube worker configuration
   */
  private generateYouTubeConfig(profiles: ArtistProfile[], minConfidence: number): SourceConfig {
    const channels: string[] = [];
    
    for (const profile of profiles) {
      const confidence = this.getPlatformConfidence(profile, 'youtube');
      
      if (confidence >= minConfidence && profile.youtube_channel_id) {
        channels.push(profile.youtube_channel_id);
      }
    }
    
    return { channels };
  }
  
  /**
   * Generate 1001Tracklists worker configuration
   */
  private generate1001TracklistsConfig(profiles: ArtistProfile[], minConfidence: number): SourceConfig {
    const searchTerms: string[] = [];
    const urls: string[] = [];
    
    for (const profile of profiles) {
      const confidence = this.getPlatformConfidence(profile, '1001tracklists');
      
      if (confidence >= minConfidence) {
        if (profile.tracklists_1001_url) {
          urls.push(profile.tracklists_1001_url);
        } else {
          // Fallback to artist name search
          searchTerms.push(profile.artist_name);
        }
      }
    }
    
    return { searchTerms, urls };
  }
  
  /**
   * Get confidence score for a specific platform from an artist profile
   */
  private getPlatformConfidence(profile: ArtistProfile, platform: string): number {
    const confidenceScores = profile.confidence_scores as any;
    
    if (!confidenceScores || typeof confidenceScores !== 'object') {
      return 0;
    }
    
    return confidenceScores[platform] || 0;
  }
  
  /**
   * Count items in a config object
   */
  private getConfigItemCount(config: SourceConfig): number {
    let count = 0;
    
    if (config.artists) count += config.artists.length;
    if (config.channels) count += config.channels.length;
    if (config.searchTerms) count += config.searchTerms.length;
    if (config.urls) count += config.urls.length;
    if (config.labels) count += config.labels.length;
    
    return count;
  }
  
  /**
   * Get artist profiles that need verification
   */
  async getProfilesNeedingVerification(): Promise<ArtistProfile[]> {
    const { data: profiles, error } = await this.supabase
      .from('artist_profiles')
      .select('*')
      .in('verification_status', ['pending', 'manual_review'])
      .order('discovered_at', { ascending: false });
    
    if (error) {
      throw new Error(`Failed to fetch profiles needing verification: ${error.message}`);
    }
    
    return profiles || [];
  }
  
  /**
   * Verify an artist profile (manual approval)
   */
  async verifyArtistProfile(profileId: string, verifiedBy: string, notes?: string): Promise<void> {
    const updateData: any = {
      verification_status: 'verified',
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (notes) {
      updateData.notes = notes;
    }
    
    const { error } = await this.supabase
      .from('artist_profiles')
      .update(updateData)
      .eq('id', profileId);
    
    if (error) {
      throw new Error(`Failed to verify artist profile: ${error.message}`);
    }
    
    logger.info(`Artist profile ${profileId} verified by ${verifiedBy}`);
  }
  
  /**
   * Reject an artist profile
   */
  async rejectArtistProfile(profileId: string, rejectedBy: string, reason?: string): Promise<void> {
    const updateData: any = {
      verification_status: 'rejected',
      updated_at: new Date().toISOString()
    };
    
    if (reason) {
      updateData.notes = reason;
    }
    
    const { error } = await this.supabase
      .from('artist_profiles')
      .update(updateData)
      .eq('id', profileId);
    
    if (error) {
      throw new Error(`Failed to reject artist profile: ${error.message}`);
    }
    
    logger.info(`Artist profile ${profileId} rejected by ${rejectedBy}: ${reason || 'No reason provided'}`);
  }
}

/**
 * Utility functions for working with artist profile configurations
 */
export const artistProfileConfigUtils = {
  /**
   * Create a new config generator instance
   */
  createGenerator(): ArtistProfileConfigGenerator {
    return new ArtistProfileConfigGenerator();
  },
  
  /**
   * Quick function to generate configs for verified profiles
   */
  async generateVerifiedConfigs(): Promise<{
    soundcloud: SourceConfig;
    youtube: SourceConfig;
    '1001tracklists': SourceConfig;
  }> {
    const generator = new ArtistProfileConfigGenerator();
    return await generator.generateAllWorkerConfigs({
      verificationStatus: 'verified',
      minConfidence: 0.7
    });
  },
  
  /**
   * Quick function to generate ingestion jobs for an artist
   */
  async generateJobsForArtist(artistName: string, mode: 'backfill' | 'rolling' = 'rolling'): Promise<BaseJobPayload[]> {
    const generator = new ArtistProfileConfigGenerator();
    const configs = await generator.generateArtistWorkerConfigs(artistName);
    
    if (!configs) {
      return [];
    }
    
    const jobs: BaseJobPayload[] = [];
    
    // Add SoundCloud jobs
    if (configs.soundcloud.artists) {
      for (const artist of configs.soundcloud.artists) {
        jobs.push({
          worker_type: 'soundcloud',
          source_id: artist,
          mode,
          batch_size: 50
        });
      }
    }
    
    // Add YouTube jobs
    if (configs.youtube.channels) {
      for (const channel of configs.youtube.channels) {
        jobs.push({
          worker_type: 'youtube',
          source_id: channel,
          mode,
          batch_size: 50
        });
      }
    }
    
    // Add 1001Tracklists jobs
    if (configs['1001tracklists'].searchTerms) {
      for (const searchTerm of configs['1001tracklists'].searchTerms) {
        jobs.push({
          worker_type: '1001tracklists',
          source_id: searchTerm,
          mode,
          batch_size: 50
        });
      }
    }
    
    if (configs['1001tracklists'].urls) {
      for (const url of configs['1001tracklists'].urls) {
        jobs.push({
          worker_type: '1001tracklists',
          source_id: url,
          mode,
          batch_size: 50
        });
      }
    }
    
    return jobs;
  }
};