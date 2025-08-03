#!/usr/bin/env node
/**
 * Dedicated YouTube backfill job with context/venue detection
 * Supports full-channel backfill mode with batching and safety considerations
 */

import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

import { readFileSync } from 'fs';
import { join } from 'path';
import fetch from 'node-fetch';
import { logger } from '../services/logger';
import { YouTubeWorker } from '../workers/youtube-worker';
import { contextVenueService } from '../lib/contextVenueService';
import { checkForDuplicateRawMix } from '../lib/duplicate-detection';
import { getServiceClient } from '../lib/supabase/service';
import type { RawMix } from '../lib/supabase/types';

// Backfill configuration with safety considerations
const BACKFILL_CONFIG = {
  // Batch size for processing (safety: prevent long-running failures)
  batchSize: 100,
  
  // Maximum videos to process per channel (safety limit)
  maxVideosPerChannel: 1000,
  
  // Date range for backfill (last 4 years)
  yearsBack: 4,
  
  // Delay between batches (milliseconds) - be respectful to APIs
  delayBetweenBatches: 1000,
  
  // Delay between API calls (milliseconds)
  delayBetweenCalls: 200,

  // Context/venue detection settings
  detection: {
    // Always mark backfill results as unverified for manual review
    autoVerify: false,
    
    // Log all detection results for analysis
    logAllDetections: true
  }
};

interface BackfillStats {
  totalVideosFound: number;
  totalProcessed: number;
  totalSkipped: number;
  totalErrors: number;
  contextsCreated: number;
  contextsReused: number;
  venuesCreated: number;
  venuesReused: number;
  batchesProcessed: number;
  processingTimeMs: number;
}

/**
 * Process a batch of raw mixes with context/venue detection
 */
async function processBatch(
  rawMixes: RawMix[],
  batchNumber: number,
  totalBatches: number,
  channelId: string
): Promise<{
  processed: number;
  skipped: number;
  errors: number;
  contextsCreated: number;
  contextsReused: number;
  venuesCreated: number;
  venuesReused: number;
}> {
  const supabase = getServiceClient();
  let processed = 0;
  let skipped = 0;
  let errors = 0;
  let contextsCreated = 0;
  let contextsReused = 0;
  let venuesCreated = 0;
  let venuesReused = 0;

  logger.info(`Processing batch ${batchNumber}/${totalBatches} (${rawMixes.length} mixes)`, {
    metadata: { channelId, batchSize: rawMixes.length }
  });

  for (const rawMix of rawMixes) {
    try {
      // Check for duplicates
      const isDuplicate = await checkForDuplicateRawMix(
        rawMix.source_url,
        rawMix.external_id || undefined
      );

      if (isDuplicate) {
        logger.debug(`⏭️ Skipping duplicate mix: ${rawMix.source_url}`);
        skipped++;
        continue;
      }

      // Process context/venue detection from metadata
      const contextVenueData = (rawMix.raw_metadata as any)?.contextVenueDetection;
      if (contextVenueData) {
        try {
          // Process detected contexts and venues
          const detectionResults = await contextVenueService.processDetectionResults(
            rawMix.id, // Note: this will be the actual ID after insertion
            contextVenueData.contexts || [],
            contextVenueData.venue,
            BACKFILL_CONFIG.detection.autoVerify
          );

          // Update stats
          contextsCreated += detectionResults.contexts.filter(c => c.created).length;
          contextsReused += detectionResults.contexts.filter(c => !c.created).length;
          if (detectionResults.venue) {
            if (detectionResults.venue.created) {
              venuesCreated++;
            } else {
              venuesReused++;
            }
          }

          // Log detection results for QA
          if (BACKFILL_CONFIG.detection.logAllDetections) {
            await logDetectionResults(rawMix, contextVenueData, detectionResults);
          }

        } catch (detectionError) {
          logger.error(`Context/venue detection failed for mix: ${rawMix.raw_title}`, 
            detectionError as Error, {
              metadata: { rawMixId: rawMix.id, sourceUrl: rawMix.source_url }
            });
        }
      }

      // Insert raw mix into database
      const { id, ...mixData } = rawMix; // Remove id as it will be auto-generated
      const { error } = await supabase
        .from('raw_mixes')
        .insert(mixData);

      if (error) {
        logger.error(`Failed to save mix: ${rawMix.raw_title}`, error);
        errors++;
      } else {
        logger.info(`💾 Saved backfill mix: ${rawMix.raw_title} (${rawMix.uploaded_at?.split('T')[0]})`);
        processed++;
      }

    } catch (err) {
      logger.error(`Error processing mix: ${rawMix.raw_title}`, err as Error);
      errors++;
    }
  }

  return {
    processed,
    skipped,
    errors,
    contextsCreated,
    contextsReused,
    venuesCreated,
    venuesReused
  };
}

/**
 * Log detection results to ingestion_logs for QA analysis
 */
async function logDetectionResults(
  rawMix: RawMix,
  contextVenueData: any,
  detectionResults: any
): Promise<void> {
  const supabase = getServiceClient();
  
  const logEntry = {
    raw_mix_id: rawMix.id,
    worker_type: 'youtube_backfill',
    message: 'Context/venue detection results',
    level: 'info' as const,
    metadata: {
      mix_title: rawMix.raw_title,
      source_url: rawMix.source_url,
      contexts_detected: contextVenueData.contexts?.map((c: any) => ({
        name: c.name,
        type: c.type,
        role: c.role,
        confidence: c.confidence,
        reason_codes: c.reason_codes
      })) || [],
      venue_detected: contextVenueData.venue ? {
        name: contextVenueData.venue.name,
        city: contextVenueData.venue.city,
        confidence: contextVenueData.venue.confidence,
        reason_codes: contextVenueData.venue.reason_codes
      } : undefined,
      processing_results: {
        contexts_created: detectionResults.contexts.filter((c: any) => c.created).length,
        contexts_reused: detectionResults.contexts.filter((c: any) => !c.created).length,
        venue_created: detectionResults.venue?.created || false,
        venue_reused: detectionResults.venue && !detectionResults.venue.created
      }
    }
  };

  try {
    await supabase.from('ingestion_logs').insert(logEntry);
  } catch (error) {
    logger.error('Failed to log detection results', error as Error);
  }
}

/**
 * Resolve YouTube channel ID from various input formats
 */
async function resolveChannelId(input: string): Promise<string> {
  // If it's already a channel ID (starts with UC and is 24 characters)
  if (input.startsWith('UC') && input.length === 24) {
    return input;
  }

  // Extract from various YouTube URL formats
  const urlPatterns = [
    /youtube\.com\/channel\/([a-zA-Z0-9_-]{24})/,
    /youtube\.com\/@([a-zA-Z0-9_-]+)/,
    /youtube\.com\/c\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/user\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of urlPatterns) {
    const match = input.match(pattern);
    if (match) {
      const identifier = match[1];
      
      // If it's already a channel ID
      if (identifier.startsWith('UC') && identifier.length === 24) {
        return identifier;
      }
      
      // Otherwise it's a username/handle - we need to resolve it
      return await resolveUsernameToChannelId(identifier);
    }
  }

  // If no URL pattern matched, treat as username/handle
  return await resolveUsernameToChannelId(input);
}

/**
 * Resolve username/handle to channel ID using YouTube API
 */
async function resolveUsernameToChannelId(username: string): Promise<string> {
  const worker = new YouTubeWorker();
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY environment variable is required');
  }

  try {
    logger.info(`Resolving username/handle to channel ID: ${username}`);
    
    // Try forUsername parameter first (legacy usernames)
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${encodeURIComponent(username)}&key=${apiKey}`
      );
      const data = await response.json() as any;
      
      if (data.items && data.items.length > 0) {
        const channelId = data.items[0].id;
        logger.info(`✅ Resolved username ${username} to channel ID: ${channelId}`);
        return channelId;
      }
    } catch (error) {
      logger.debug(`forUsername lookup failed for ${username}:`, { metadata: error });
    }

    // Try handle parameter (newer @handles)
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(username)}&key=${apiKey}`
      );
      const data = await response.json() as any;
      
      if (data.items && data.items.length > 0) {
        const channelId = data.items[0].id;
        logger.info(`✅ Resolved handle ${username} to channel ID: ${channelId}`);
        return channelId;
      }
    } catch (error) {
      logger.debug(`forHandle lookup failed for ${username}:`, { metadata: error });
    }

    throw new Error(`Could not resolve ${username} to a YouTube channel ID. Please provide the full channel URL or channel ID.`);
    
  } catch (error) {
    logger.error(`Failed to resolve username/handle: ${username}`, error as Error);
    throw error;
  }
}

/**
 * Main backfill function for a specific YouTube channel
 */
async function backfillYouTubeChannel(
  channelInput: string,
  maxResults?: number
): Promise<BackfillStats> {
  const startTime = Date.now();
  
  // Resolve channel input to actual channel ID
  const channelId = await resolveChannelId(channelInput);
  
  logger.info(`🔄 Starting YouTube backfill for channel: ${channelId} (input: ${channelInput})`);

  // Calculate date range for backfill
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - BACKFILL_CONFIG.yearsBack);

  const actualMaxResults = Math.min(
    maxResults || BACKFILL_CONFIG.maxVideosPerChannel,
    BACKFILL_CONFIG.maxVideosPerChannel
  );

  logger.info(`Backfill parameters:`, {
    metadata: {
      channelId,
      dateRange: `${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`,
      maxResults: actualMaxResults,
      batchSize: BACKFILL_CONFIG.batchSize
    }
  });

  // Initialize worker and fetch videos
  const worker = new YouTubeWorker();
  const backfillConfig = {
    channels: [channelId],
    maxResults: actualMaxResults,
    dateRange: { from: fromDate, to: toDate }
  };

  const rawMixes = await worker.fetchNewMixes(backfillConfig, true); // true = backfill mode
  
  logger.info(`📥 Found ${rawMixes.length} videos to process for backfill`);

  if (rawMixes.length === 0) {
    return {
      totalVideosFound: 0,
      totalProcessed: 0,
      totalSkipped: 0,
      totalErrors: 0,
      contextsCreated: 0,
      contextsReused: 0,
      venuesCreated: 0,
      venuesReused: 0,
      batchesProcessed: 0,
      processingTimeMs: Date.now() - startTime
    };
  }

  // Process in batches with safety considerations
  const stats: BackfillStats = {
    totalVideosFound: rawMixes.length,
    totalProcessed: 0,
    totalSkipped: 0,
    totalErrors: 0,
    contextsCreated: 0,
    contextsReused: 0,
    venuesCreated: 0,
    venuesReused: 0,
    batchesProcessed: 0,
    processingTimeMs: 0
  };

  const totalBatches = Math.ceil(rawMixes.length / BACKFILL_CONFIG.batchSize);

  for (let i = 0; i < rawMixes.length; i += BACKFILL_CONFIG.batchSize) {
    const batch = rawMixes.slice(i, i + BACKFILL_CONFIG.batchSize);
    const batchNumber = Math.floor(i / BACKFILL_CONFIG.batchSize) + 1;

    const batchResults = await processBatch(batch, batchNumber, totalBatches, channelId);

    // Update overall stats
    stats.totalProcessed += batchResults.processed;
    stats.totalSkipped += batchResults.skipped;
    stats.totalErrors += batchResults.errors;
    stats.contextsCreated += batchResults.contextsCreated;
    stats.contextsReused += batchResults.contextsReused;
    stats.venuesCreated += batchResults.venuesCreated;
    stats.venuesReused += batchResults.venuesReused;
    stats.batchesProcessed++;

    // Delay between batches to be respectful
    if (i + BACKFILL_CONFIG.batchSize < rawMixes.length) {
      logger.debug(`Waiting ${BACKFILL_CONFIG.delayBetweenBatches}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, BACKFILL_CONFIG.delayBetweenBatches));
    }
  }

  stats.processingTimeMs = Date.now() - startTime;

  // Log final summary
  logger.info('📊 YouTube Backfill Summary:', {
    metadata: {
      channelId,
      ...stats,
      processingTimeSeconds: (stats.processingTimeMs / 1000).toFixed(2)
    }
  });

  // Log year distribution
  const yearCounts = rawMixes.reduce((acc, mix) => {
    const year = new Date(mix.uploaded_at!).getFullYear();
    acc[year] = (acc[year] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  logger.info('📅 Videos by year:');
  Object.entries(yearCounts)
    .sort(([a], [b]) => parseInt(b) - parseInt(a))
    .forEach(([year, count]) => {
      logger.info(`  ${year}: ${count} videos`);
    });

  return stats;
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage:');
    console.log('  npm run backfill:youtube <channel> [maxResults]');
    console.log('');
    console.log('Channel formats supported:');
    console.log('  • Channel ID: UCPKT_csvP72boVX0XrMtagQ');
    console.log('  • @Handle: @Yottomusic');
    console.log('  • Full URL: https://www.youtube.com/@Yottomusic');
    console.log('  • Channel URL: https://www.youtube.com/channel/UCPKT_csvP72boVX0XrMtagQ');
    console.log('  • Legacy user URL: https://www.youtube.com/user/username');
    console.log('');
    console.log('Examples:');
    console.log('  npm run backfill:youtube @Yottomusic 50                              # Yotto channel, 50 videos');
    console.log('  npm run backfill:youtube "https://www.youtube.com/@Yottomusic"     # Yotto channel (full URL)');
    console.log('  npm run backfill:youtube UCPKT_csvP72boVX0XrMtagQ                  # Cercle channel (ID)');
    console.log('  npm run backfill:youtube UC_CiDDWOQNqhzD-h_8kOXBg 1000            # Tomorrowland channel');
    process.exit(1);
  }

  const channelInput = args[0];
  const maxResults = args[1] ? parseInt(args[1]) : undefined;

  if (maxResults && (isNaN(maxResults) || maxResults <= 0)) {
    console.error('Error: maxResults must be a positive number');
    process.exit(1);
  }

  try {
    const stats = await backfillYouTubeChannel(channelInput, maxResults);
    
    logger.info('✅ YouTube backfill completed successfully', { metadata: stats });
    process.exit(0);
  } catch (error) {
    logger.error('❌ YouTube backfill failed', error as Error);
    process.exit(1);
  }
}

// Export for testing
export { backfillYouTubeChannel, BACKFILL_CONFIG };

if (require.main === module) {
  main();
}