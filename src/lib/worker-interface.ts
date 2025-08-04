import type { RawMix, RawTrack } from './supabase/types';

/**
 * Base interface that all ingestion workers must implement
 */
export interface IngestionWorker {
  /**
   * Fetch new mixes from the source platform
   * @param config Source-specific configuration (channels, artists, etc.)
   * @returns Array of raw mix data
   */
  fetchNewMixes(config: SourceConfig): Promise<RawMix[]>;
  
  /**
   * Parse tracklist from raw mix data (optional - some sources might not have tracklists)
   * @param rawMix The raw mix data to parse
   * @returns Array of raw track data, or null if no tracklist available
   */
  parseTracklist?(rawMix: RawMix): Promise<RawTrack[] | null>;
  
  /**
   * Worker type identifier
   */
  readonly workerType: WorkerType;
  
  /**
   * Human-readable name for logging
   */
  readonly name: string;
}

/**
 * Configuration for different source types
 */
export interface SourceConfig {
  // Common config
  maxResults?: number;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  
  // Job-specific config
  mode?: 'backfill' | 'rolling';
  isVerified?: boolean; // Auto-verify entities based on mode and confidence
  
  // Source-specific config
  channels?: string[];      // YouTube channel IDs
  artists?: string[];       // SoundCloud artist usernames
  labels?: string[];        // SoundCloud label usernames
  searchTerms?: string[];   // 1001Tracklists search terms
  urls?: string[];          // Direct URLs to scrape
  artistNames?: string[];   // Artist names for discovery worker
}

export type WorkerType = 'soundcloud' | 'youtube' | '1001tracklists' | 'artist-discovery';

/**
 * Result of a worker run
 */
export interface WorkerResult {
  success: boolean;
  mixesFound: number;
  mixesAdded: number;
  mixesSkipped: number;
  errors: string[];
  duration: number; // milliseconds
}

/**
 * Abstract base worker class with common functionality
 */
export abstract class BaseIngestionWorker implements IngestionWorker {
  abstract readonly workerType: WorkerType;
  abstract readonly name: string;
  
  /**
   * Fetch new mixes - must be implemented by subclasses
   */
  abstract fetchNewMixes(config: SourceConfig, backfillMode?: boolean): Promise<RawMix[]>;
  
  /**
   * Optional tracklist parsing - can be overridden by subclasses
   */
  parseTracklist?(rawMix: RawMix): Promise<RawTrack[] | null>;
  
  /**
   * Run the worker with error handling and logging
   */
  async run(config: SourceConfig): Promise<WorkerResult> {
    const startTime = Date.now();
    const result: WorkerResult = {
      success: false,
      mixesFound: 0,
      mixesAdded: 0,
      mixesSkipped: 0,
      errors: [],
      duration: 0,
    };
    
    try {
      console.log(`🔄 Starting ${this.name} worker...`);
      
      // Fetch new mixes - enable backfill mode if specified
      const backfillMode = (config as any).mode === 'backfill';
      const rawMixes = await this.fetchNewMixes(config, backfillMode);
      result.mixesFound = rawMixes.length;
      
      console.log(`📥 Found ${rawMixes.length} mixes from ${this.name}`);
      
      // Process each mix
      for (const rawMix of rawMixes) {
        try {
          // Check for duplicates and save
          const saved = await this.saveMixIfNotDuplicate(rawMix);
          if (saved) {
            result.mixesAdded++;
          } else {
            result.mixesSkipped++;
          }
        } catch (err) {
          const error = `Failed to process mix ${rawMix.source_url}: ${err}`;
          result.errors.push(error);
          console.error(error);
        }
      }
      
      // Determine success based on whether we found any content or encountered errors
      const hasContent = result.mixesFound > 0;
      const hasErrors = result.errors.length > 0;
      
      result.success = hasContent && !hasErrors;
      result.duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ ${this.name} completed: ${result.mixesAdded} added, ${result.mixesSkipped} skipped`);
      } else if (!hasContent && !hasErrors) {
        console.log(`⚠️ ${this.name} completed but found no content: 0 mixes found`);
      } else {
        console.log(`❌ ${this.name} completed with issues: ${result.mixesAdded} added, ${result.errors.length} errors`);
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
   * Save a raw mix if it's not a duplicate
   */
  protected async saveMixIfNotDuplicate(rawMix: RawMix): Promise<boolean> {
    // Import here to avoid circular dependencies
    const { checkForDuplicateRawMix } = await import('../lib/duplicate-detection');
    const { getServiceClient } = await import('../lib/supabase/service');
    
    // Check for duplicates
    const isDuplicate = await checkForDuplicateRawMix(
      rawMix.source_url,
      rawMix.external_id || undefined
    );
    
    if (isDuplicate) {
      console.log(`⏭️  Skipping duplicate mix: ${rawMix.source_url}`);
      return false;
    }
    
    // Save to raw_mixes table
    const supabase = getServiceClient();
    // Remove the id field since it will be auto-generated by the database
    const { id, ...mixData } = rawMix;
    const { data: savedMix, error } = await supabase
      .from('raw_mixes')
      .insert(mixData)
      .select('id')
      .single();
    
    if (error) {
      throw new Error(`Failed to save raw mix: ${error.message}`);
    }
    
    // Save context rule applications if present
    if (rawMix.suggested_contexts && Array.isArray(rawMix.suggested_contexts) && rawMix.suggested_contexts.length > 0) {
      await this.saveRuleApplications(savedMix.id, rawMix);
    }
    
    console.log(`💾 Saved new mix: ${rawMix.raw_title || rawMix.source_url}`);
    return true;
  }

  /**
   * Save rule applications for context suggestions
   */
  private async saveRuleApplications(rawMixId: string, rawMix: RawMix): Promise<void> {
    const { getServiceClient } = await import('../lib/supabase/service');
    const supabase = getServiceClient();
    
    // Type guard to ensure suggested_contexts is ContextSuggestion[]
    const suggestions = rawMix.suggested_contexts as any[];
    if (!Array.isArray(suggestions)) return;
    
    const ruleApplications = suggestions.map(suggestion => ({
      rule_id: suggestion.rule_id,
      raw_mix_id: rawMixId,
      suggested_context_type: suggestion.context_type,
      suggested_context_name: suggestion.context_name,
      confidence_score: suggestion.confidence,
      matched_text: suggestion.matched_text || null,
      reasoning: suggestion.reasoning,
      mix_title: rawMix.raw_title || '',
      mix_description: rawMix.raw_description || null,
      artist_name: rawMix.raw_artist || null,
      platform: rawMix.provider,
      channel_name: (rawMix.raw_metadata as any)?.channelTitle || null,
      channel_id: (rawMix.raw_metadata as any)?.channelId || null,
      requires_approval: suggestion.requires_approval,
      applied_automatically: true
    }));
    
    const { error } = await supabase
      .from('rule_applications')
      .insert(ruleApplications);
    
    if (error) {
      console.warn(`Failed to save rule applications for mix ${rawMixId}:`, error.message);
      // Don't throw error - rule applications are supplementary
    } else {
      console.log(`💡 Saved ${ruleApplications.length} context rule applications for mix`);
    }
  }
}