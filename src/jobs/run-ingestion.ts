import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

import { readFileSync } from 'fs';
import { join } from 'path';
import { SoundCloudWorker } from '../workers/soundcloud-worker';
import { YouTubeWorker } from '../workers/youtube-worker';
import { OneTracklistWorker } from '../workers/1001tracklists-worker';
import { JobQueue } from '../services/job-queue';
import { logger } from '../services/logger';
import { BaseIngestionWorker, type SourceConfig, type WorkerResult } from '../lib/worker-interface';

/**
 * Daily ingestion job runner
 * Orchestrates all ingestion workers based on configuration
 */

interface IngestionConfig {
  soundcloud?: {
    enabled: boolean;
    artists: string[];
    labels: string[];
    maxResults: number;
  };
  youtube?: {
    enabled: boolean;
    channels: string[];
    maxResults: number;
  };
  '1001tracklists'?: {
    enabled: boolean;
    searchTerms: string[];
    urls: string[];
    maxResults: number;
  };
  dateRange?: {
    daysBack: number; // How many days back to search
  };
}

export class IngestionJobRunner {
  private jobQueue = new JobQueue();
  private workers = new Map<string, BaseIngestionWorker>([
    ['soundcloud', new SoundCloudWorker()],
    ['youtube', new YouTubeWorker()],
    ['1001tracklists', new OneTracklistWorker()],
  ]);
  
  /**
   * Run all enabled ingestion workers
   */
  async runIngestion(configPath?: string): Promise<void> {
    const startTime = Date.now();
    logger.info('🚀 Starting daily ingestion job');
    
    try {
      // Load configuration
      const config = await this.loadConfig(configPath);
      
      // Create date range filter
      const dateRange = this.createDateRange(config.dateRange?.daysBack || 7);
      
      const results: { [key: string]: WorkerResult } = {};
      
      // Run SoundCloud ingestion
      if (config.soundcloud?.enabled) {
        results.soundcloud = await this.runSoundCloudIngestion(config.soundcloud, dateRange);
      }
      
      // Run YouTube ingestion
      if (config.youtube?.enabled) {
        results.youtube = await this.runYouTubeIngestion(config.youtube, dateRange);
      }
      
      // Run 1001Tracklists ingestion
      if (config['1001tracklists']?.enabled) {
        results['1001tracklists'] = await this.run1001TracklistsIngestion(
          config['1001tracklists'],
          dateRange
        );
      }
      
      // Log summary
      this.logIngestionSummary(results, Date.now() - startTime);
      
    } catch (err) {
      logger.error('Ingestion job failed', err as Error);
      throw err;
    }
  }
  
  /**
   * Run SoundCloud ingestion
   */
  private async runSoundCloudIngestion(
    config: NonNullable<IngestionConfig['soundcloud']>,
    dateRange: { from: Date; to: Date }
  ): Promise<WorkerResult> {
    const worker = this.workers.get('soundcloud');
    if (!worker) throw new Error('SoundCloud worker not found');
    
    const sourceConfig: SourceConfig = {
      artists: config.artists,
      labels: config.labels,
      maxResults: config.maxResults,
      dateRange,
    };
    
    logger.info(`Running SoundCloud ingestion for ${config.artists.length + config.labels.length} sources`);
    
    return await worker.run(sourceConfig);
  }
  
  /**
   * Run YouTube ingestion
   */
  private async runYouTubeIngestion(
    config: NonNullable<IngestionConfig['youtube']>,
    dateRange: { from: Date; to: Date }
  ): Promise<WorkerResult> {
    const worker = this.workers.get('youtube');
    if (!worker) throw new Error('YouTube worker not found');
    
    const sourceConfig: SourceConfig = {
      channels: config.channels,
      maxResults: config.maxResults,
      dateRange,
    };
    
    logger.info(`Running YouTube ingestion for ${config.channels.length} channels`);
    
    return await worker.run(sourceConfig);
  }
  
  /**
   * Run 1001Tracklists ingestion
   */
  private async run1001TracklistsIngestion(
    config: NonNullable<IngestionConfig['1001tracklists']>,
    dateRange: { from: Date; to: Date }
  ): Promise<WorkerResult> {
    const worker = this.workers.get('1001tracklists');
    if (!worker) throw new Error('1001Tracklists worker not found');
    
    const sourceConfig: SourceConfig = {
      searchTerms: config.searchTerms,
      urls: config.urls,
      maxResults: config.maxResults,
      dateRange,
    };
    
    logger.info(`Running 1001Tracklists ingestion for ${config.searchTerms.length} search terms and ${config.urls.length} URLs`);
    
    return await worker.run(sourceConfig);
  }
  
  /**
   * Load ingestion configuration
   */
  private async loadConfig(configPath?: string): Promise<IngestionConfig> {
    const defaultPath = join(process.cwd(), 'config', 'sources.json');
    const path = configPath || defaultPath;
    
    try {
      const configData = readFileSync(path, 'utf-8');
      const config = JSON.parse(configData) as IngestionConfig;
      
      logger.info(`Loaded ingestion config from: ${path}`);
      return config;
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        logger.warn(`Config file not found: ${path}, using default config`);
        return this.getDefaultConfig();
      }
      throw new Error(`Failed to load config: ${err}`);
    }
  }
  
  /**
   * Get default configuration
   */
  private getDefaultConfig(): IngestionConfig {
    return {
      soundcloud: {
        enabled: false,
        artists: [],
        labels: [],
        maxResults: 50,
      },
      youtube: {
        enabled: false,
        channels: [],
        maxResults: 50,
      },
      '1001tracklists': {
        enabled: false,
        searchTerms: [],
        urls: [],
        maxResults: 50,
      },
      dateRange: {
        daysBack: 7,
      },
    };
  }
  
  /**
   * Create date range for filtering
   */
  private createDateRange(daysBack: number): { from: Date; to: Date } {
    const to = new Date();
    const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
    
    return { from, to };
  }
  
  /**
   * Log ingestion summary
   */
  private logIngestionSummary(results: { [key: string]: WorkerResult }, durationMs: number): void {
    const totalMixesFound = Object.values(results).reduce((sum, r) => sum + r.mixesFound, 0);
    const totalMixesAdded = Object.values(results).reduce((sum, r) => sum + r.mixesAdded, 0);
    const totalMixesSkipped = Object.values(results).reduce((sum, r) => sum + r.mixesSkipped, 0);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors.length, 0);
    
    logger.info('📊 Ingestion Summary:', {
      metadata: {
        duration: `${(durationMs / 1000).toFixed(2)}s`,
        totalMixesFound,
        totalMixesAdded,
        totalMixesSkipped,
        totalErrors,
        results,
      },
    });
    
    // Log individual worker results
    for (const [workerType, result] of Object.entries(results)) {
      const status = result.success ? '✅' : '❌';
      logger.info(`${status} ${workerType}: ${result.mixesAdded} added, ${result.mixesSkipped} skipped, ${result.errors.length} errors`);
      
      // Log errors
      for (const error of result.errors) {
        logger.error(`${workerType} error: ${error}`);
      }
    }
  }
}

/**
 * CLI entry point
 */
export async function runIngestionJob(): Promise<void> {
  const runner = new IngestionJobRunner();
  
  try {
    await runner.runIngestion();
    process.exit(0);
  } catch (err) {
    logger.error('Ingestion job failed', err as Error);
    process.exit(1);
  }
}

/**
 * CLI entry point for single URL ingestion
 */
export async function runSingleUrlIngestion(workerType: string, url: string): Promise<void> {
  const runner = new IngestionJobRunner();
  
  try {
    const worker = runner['workers'].get(workerType);
    if (!worker) {
      throw new Error(`Unknown worker type: ${workerType}`);
    }
    
    logger.info(`🔄 Ingesting single URL: ${url}`);
    
    // Create a basic config for single URL
    const config: SourceConfig = {
      maxResults: 1,
      dateRange: {
        from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year back
        to: new Date(),
      },
    };
    
    // Add URL to appropriate config field based on worker type
    if (workerType === 'youtube') {
      // Extract video ID from URL and treat as a single channel search
      const videoId = extractYouTubeVideoId(url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL format');
      }
      // We'll need to modify the worker to handle single URLs
      // For now, use a direct approach
      await processSingleYouTubeUrl(worker, url);
    } else if (workerType === 'soundcloud') {
      await processSingleSoundCloudUrl(worker, url);
    } else if (workerType === '1001tracklists') {
      config.urls = [url];
      await worker.run(config);
    } else {
      throw new Error(`Single URL ingestion not supported for ${workerType}`);
    }
    
    logger.info('✅ Single URL ingestion completed');
    process.exit(0);
  } catch (err) {
    logger.error('Single URL ingestion failed', err as Error);
    process.exit(1);
  }
}

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

/**
 * Helper function to save a mix if not duplicate
 */
async function saveMixIfNotDuplicate(rawMix: any): Promise<boolean> {
  const { checkForDuplicateRawMix } = await import('../lib/duplicate-detection');
  const { getServiceClient } = await import('../lib/supabase/service');
  
  // Check for duplicates
  const isDuplicate = await checkForDuplicateRawMix(
    rawMix.source_url,
    rawMix.external_id || undefined
  );
  
  if (isDuplicate) {
    logger.info(`⏭️ Skipping duplicate mix: ${rawMix.source_url}`);
    return false;
  }
  
  // Save to raw_mixes table
  const supabase = getServiceClient();
  // Remove the id field since it will be auto-generated by the database
  const { id, ...mixData } = rawMix;
  const { error } = await supabase
    .from('raw_mixes')
    .insert(mixData);
  
  if (error) {
    throw new Error(`Failed to save raw mix: ${error.message}`);
  }
  
  logger.info(`💾 Saved new mix: ${rawMix.raw_title || rawMix.source_url}`);
  return true;
}

/**
 * Process single YouTube URL directly
 */
async function processSingleYouTubeUrl(worker: BaseIngestionWorker, url: string): Promise<void> {
  // Import YouTube worker specific methods
  const { YouTubeWorker } = await import('../workers/youtube-worker');
  
  if (!(worker instanceof YouTubeWorker)) {
    throw new Error('Expected YouTubeWorker instance');
  }
  
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }
  
  // Fetch single video data
  const rawMixes = await worker.fetchVideoData(videoId);
  
  if (rawMixes.length > 0) {
    // Save the mix directly
    const rawMix = rawMixes[0];
    const saved = await saveMixIfNotDuplicate(rawMix);
    
    if (saved) {
      logger.info('✅ YouTube mix saved successfully');
    } else {
      logger.info('⏭️ YouTube mix already exists (skipped)');
    }
  } else {
    logger.warn('No valid mix data found for this YouTube URL');
  }
}

/**
 * Process single SoundCloud URL directly
 */
async function processSingleSoundCloudUrl(worker: BaseIngestionWorker, url: string): Promise<void> {
  // For now, use the config-based approach with the single URL
  const config: SourceConfig = {
    urls: [url],
    maxResults: 1,
    dateRange: {
      from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year back
      to: new Date(),
    },
  };
  
  const result = await worker.run(config);
  
  if (result.mixesAdded > 0) {
    logger.info('✅ SoundCloud mix saved successfully');
  } else if (result.mixesSkipped > 0) {
    logger.info('⏭️ SoundCloud mix already exists (skipped)');
  } else if (result.errors.length > 0) {
    logger.error('❌ SoundCloud ingestion failed: ' + result.errors.join(', '));
  } else {
    logger.warn('No valid mix data found for this SoundCloud URL');
  }
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 2) {
    // Single URL mode: npm run ingest youtube "https://..."
    const [workerType, url] = args;
    runSingleUrlIngestion(workerType, url);
  } else if (args.length === 0) {
    // Batch mode: npm run ingest
    runIngestionJob();
  } else {
    console.log('Usage:');
    console.log('  npm run ingest                           # Run all configured sources');
    console.log('  npm run ingest <type> <url>             # Ingest single URL');
    console.log('  npm run ingest youtube "https://..."    # Single YouTube video');
    console.log('  npm run ingest soundcloud "https://..." # Single SoundCloud track');
    console.log('  npm run ingest 1001tracklists "https://..." # Single 1001Tracklists mix');
    process.exit(1);
  }
}