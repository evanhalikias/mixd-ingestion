#!/usr/bin/env node
/**
 * Backfill job for historical mix ingestion
 * Designed to run once to capture several years of content
 */

import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../services/logger';
import { YouTubeWorker } from '../workers/youtube-worker';

// Backfill configuration
const BACKFILL_CONFIG = {
  // How many videos to fetch per channel (YouTube channels can have 1000+ videos)
  maxVideosPerChannel: 500,
  
  // Date range for backfill (last 4 years)
  yearsBack: 4,
  
  // Batch size for processing (to avoid memory issues)
  batchSize: 50,
  
  // Delay between API calls (milliseconds) 
  delayBetweenCalls: 200
};

async function main() {
  try {
    logger.info('🔄 Starting historical backfill job');
    
    // Load backfill configuration (or fall back to regular config)
    let config;
    try {
      const backfillPath = join(process.cwd(), 'config', 'backfill-sources.json');
      const configData = readFileSync(backfillPath, 'utf-8');
      config = JSON.parse(configData);
      logger.info('Using dedicated backfill configuration');
    } catch {
      const defaultPath = join(process.cwd(), 'config', 'sources.json');
      const configData = readFileSync(defaultPath, 'utf-8');
      config = JSON.parse(configData);
      logger.info('Using regular configuration for backfill');
    }
    const youtubeConfig = config.youtube;
    
    if (!youtubeConfig.enabled) {
      logger.info('YouTube ingestion is disabled, skipping backfill');
      return;
    }
    
    // Calculate date range for backfill
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - BACKFILL_CONFIG.yearsBack);
    
    logger.info(`Backfilling YouTube content from ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}`);
    logger.info(`Channels: ${youtubeConfig.channels.length}, Max videos per channel: ${BACKFILL_CONFIG.maxVideosPerChannel}`);
    
    // Override config for backfill
    const backfillConfig = {
      ...youtubeConfig,
      maxResults: BACKFILL_CONFIG.maxVideosPerChannel,
      dateRange: { from: fromDate, to: toDate }
    };
    
    // Initialize worker
    const worker = new YouTubeWorker();
    
    // Run backfill in backfill mode (enables pagination)
    logger.info('🔄 Fetching historical videos...');
    const rawMixes = await worker.fetchNewMixes(backfillConfig, true);
    
    logger.info(`📥 Found ${rawMixes.length} historical mixes to process`);
    
    if (rawMixes.length === 0) {
      logger.info('No new mixes found during backfill');
      return;
    }
    
    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    
    // Process in batches to avoid overwhelming the database
    let processed = 0;
    let duplicates = 0;
    let errors = 0;
    
    for (let i = 0; i < rawMixes.length; i += BACKFILL_CONFIG.batchSize) {
      const batch = rawMixes.slice(i, i + BACKFILL_CONFIG.batchSize);
      logger.info(`Processing batch ${Math.floor(i / BACKFILL_CONFIG.batchSize) + 1}/${Math.ceil(rawMixes.length / BACKFILL_CONFIG.batchSize)} (${batch.length} mixes)`);
      
      for (const rawMix of batch) {
        try {
          // Check if we already have this mix
          const { data: existing } = await supabase
            .from('raw_mixes')
            .select('id')
            .eq('external_id', rawMix.external_id)
            .single();
          
          if (existing) {
            logger.debug(`⏭️  Skipping duplicate mix: ${rawMix.source_url}`);
            duplicates++;
            continue;
          }
          
          // Insert new mix
          const { error } = await supabase
            .from('raw_mixes')
            .insert(rawMix);
          
          if (error) {
            logger.error(`Failed to save mix: ${rawMix.raw_title}`, error);
            errors++;
          } else {
            logger.info(`💾 Saved historical mix: ${rawMix.raw_title} (${rawMix.uploaded_at?.split('T')[0]})`);
            processed++;
          }
          
        } catch (err) {
          logger.error(`Error processing mix: ${rawMix.raw_title}`, err as Error);
          errors++;
        }
      }
      
      // Small delay between batches
      if (i + BACKFILL_CONFIG.batchSize < rawMixes.length) {
        await new Promise(resolve => setTimeout(resolve, BACKFILL_CONFIG.delayBetweenCalls));
      }
    }
    
    logger.info('📊 Backfill Summary:');
    logger.info(`✅ Processed: ${processed} new mixes`);
    logger.info(`⏭️  Skipped: ${duplicates} duplicates`);
    logger.info(`❌ Errors: ${errors} failed`);
    logger.info(`🎵 Total historical mixes found: ${rawMixes.length}`);
    
    // Log some statistics about what we found
    const yearCounts = rawMixes.reduce((acc, mix) => {
      const year = new Date(mix.uploaded_at!).getFullYear();
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    
    logger.info('📅 Mixes by year:');
    Object.entries(yearCounts)
      .sort(([a], [b]) => parseInt(b) - parseInt(a))
      .forEach(([year, count]) => {
        logger.info(`  ${year}: ${count} mixes`);
      });
    
  } catch (error) {
    logger.error('Backfill job failed', error as Error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}