import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

import { getServiceClient } from '../lib/supabase/service';
import { MixCanonicalizer, type CanonicalizationResult } from '../canonicalizer/canonicalize-mix';
import { JobQueue } from '../services/job-queue';
import { logger } from '../services/logger';

/**
 * Hourly canonicalization job runner
 * Processes pending raw_mixes and converts them to production schema
 */

export interface CanonicalizationJobResult {
  success: boolean;
  totalProcessed: number;
  successfullyProcessed: number;
  errors: number;
  duration: number;
  results: CanonicalizationResult[];
}

export class CanonicalizationJobRunner {
  private supabase = getServiceClient();
  private canonicalizer = new MixCanonicalizer();
  private jobQueue = new JobQueue();
  
  /**
   * Run canonicalization for all pending raw mixes
   */
  async runCanonicalization(batchSize = 10): Promise<CanonicalizationJobResult> {
    const startTime = Date.now();
    logger.info('🔄 Starting canonicalization job');
    
    const jobResult: CanonicalizationJobResult = {
      success: false,
      totalProcessed: 0,
      successfullyProcessed: 0,
      errors: 0,
      duration: 0,
      results: [],
    };
    
    try {
      // Get pending raw mixes
      const pendingMixes = await this.getPendingRawMixes(batchSize);
      
      if (pendingMixes.length === 0) {
        logger.info('No pending raw mixes to process');
        jobResult.success = true;
        jobResult.duration = Date.now() - startTime;
        return jobResult;
      }
      
      logger.info(`Processing ${pendingMixes.length} pending raw mixes`);
      
      // Process each mix
      for (const rawMix of pendingMixes) {
        try {
          await this.markRawMixProcessing(rawMix.id);
          
          const result = await this.canonicalizer.canonicalizeMix(rawMix.id);
          jobResult.results.push(result);
          jobResult.totalProcessed++;
          
          if (result.success) {
            jobResult.successfullyProcessed++;
            logger.info(`✅ Successfully canonicalized: ${rawMix.raw_title || rawMix.source_url}`);
          } else {
            jobResult.errors++;
            await this.markRawMixFailed(rawMix.id, result.errors.join('; '));
            logger.error(`❌ Failed to canonicalize: ${rawMix.raw_title || rawMix.source_url}`);
            
            // Log individual errors
            for (const error of result.errors) {
              logger.error(`  - ${error}`);
            }
          }
          
        } catch (err) {
          jobResult.totalProcessed++;
          jobResult.errors++;
          
          const errorMessage = `Canonicalization error: ${err}`;
          logger.error(errorMessage, err as Error, { rawMixId: rawMix.id });
          
          await this.markRawMixFailed(rawMix.id, errorMessage);
          
          jobResult.results.push({
            success: false,
            tracksCreated: 0,
            artistsCreated: 0,
            aliasesCreated: 0,
            errors: [errorMessage],
          });
        }
      }
      
      jobResult.success = true;
      jobResult.duration = Date.now() - startTime;
      
      this.logCanonicalizationSummary(jobResult);
      
    } catch (err) {
      jobResult.duration = Date.now() - startTime;
      logger.error('Canonicalization job failed', err as Error);
      throw err;
    }
    
    return jobResult;
  }
  
  /**
   * Get pending raw mixes for processing
   */
  private async getPendingRawMixes(limit: number): Promise<Array<{
    id: string;
    raw_title: string | null;
    source_url: string;
    provider: string;
    created_at: string;
  }>> {
    const { data, error } = await this.supabase
      .from('raw_mixes')
      .select('id, raw_title, source_url, provider, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (error) {
      throw new Error(`Failed to fetch pending raw mixes: ${error.message}`);
    }
    
    return data || [];
  }
  
  /**
   * Mark raw mix as being processed
   */
  private async markRawMixProcessing(rawMixId: string): Promise<void> {
    const { error } = await this.supabase
      .from('raw_mixes')
      .update({
        status: 'processing',
        processed_at: new Date().toISOString(),
      })
      .eq('id', rawMixId);
    
    if (error) {
      logger.warn(`Failed to mark raw mix as processing: ${error.message}`);
    }
  }
  
  /**
   * Mark raw mix as failed
   */
  private async markRawMixFailed(rawMixId: string, errorMessage: string): Promise<void> {
    const { error } = await this.supabase
      .from('raw_mixes')
      .update({
        status: 'failed',
        error_message: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq('id', rawMixId);
    
    if (error) {
      logger.warn(`Failed to mark raw mix as failed: ${error.message}`);
    }
  }
  
  /**
   * Process failed mixes (retry mechanism)
   */
  async retryFailedMixes(maxAge = 24, batchSize = 5): Promise<CanonicalizationJobResult> {
    logger.info('🔄 Retrying failed canonicalizations');
    
    const cutoffDate = new Date(Date.now() - maxAge * 60 * 60 * 1000);
    
    // Reset failed mixes back to pending
    const { data: failedMixes, error: fetchError } = await this.supabase
      .from('raw_mixes')
      .select('id, raw_title, source_url')
      .eq('status', 'failed')
      .gte('created_at', cutoffDate.toISOString())
      .limit(batchSize);
    
    if (fetchError) {
      throw new Error(`Failed to fetch failed mixes: ${fetchError.message}`);
    }
    
    if (!failedMixes || failedMixes.length === 0) {
      logger.info('No failed mixes to retry');
      return {
        success: true,
        totalProcessed: 0,
        successfullyProcessed: 0,
        errors: 0,
        duration: 0,
        results: [],
      };
    }
    
    // Reset status to pending
    const { error: resetError } = await this.supabase
      .from('raw_mixes')
      .update({
        status: 'pending',
        error_message: null,
        processed_at: null,
      })
      .in('id', failedMixes.map(mix => mix.id));
    
    if (resetError) {
      throw new Error(`Failed to reset failed mixes: ${resetError.message}`);
    }
    
    logger.info(`Reset ${failedMixes.length} failed mixes to pending status`);
    
    // Process them normally
    return await this.runCanonicalization(batchSize);
  }
  
  /**
   * Get canonicalization statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    canonicalized: number;
    failed: number;
    total: number;
  }> {
    const { data, error } = await this.supabase
      .from('raw_mixes')
      .select('status')
      .then(result => {
        if (result.error) throw result.error;
        
        const stats = {
          pending: 0,
          processing: 0,
          canonicalized: 0,
          failed: 0,
          total: result.data?.length || 0,
        };
        
        for (const mix of result.data || []) {
          stats[mix.status as keyof typeof stats]++;
        }
        
        return { data: stats, error: null };
      });
    
    if (error) {
      throw new Error(`Failed to get stats: ${error}`);
    }
    
    return data!;
  }
  
  /**
   * Log canonicalization summary
   */
  private logCanonicalizationSummary(result: CanonicalizationJobResult): void {
    const totalTracks = result.results.reduce((sum, r) => sum + r.tracksCreated, 0);
    const totalArtists = result.results.reduce((sum, r) => sum + r.artistsCreated, 0);
    const totalAliases = result.results.reduce((sum, r) => sum + r.aliasesCreated, 0);
    
    logger.info('📊 Canonicalization Summary:', {
      metadata: {
        duration: `${(result.duration / 1000).toFixed(2)}s`,
        totalProcessed: result.totalProcessed,
        successfullyProcessed: result.successfullyProcessed,
        errors: result.errors,
        tracksCreated: totalTracks,
        artistsCreated: totalArtists,
        aliasesCreated: totalAliases,
        successRate: `${((result.successfullyProcessed / result.totalProcessed) * 100).toFixed(1)}%`,
      },
    });
  }
}

/**
 * CLI entry point for canonicalization
 */
export async function runCanonicalizationJob(): Promise<void> {
  const runner = new CanonicalizationJobRunner();
  
  try {
    await runner.runCanonicalization();
    process.exit(0);
  } catch (err) {
    logger.error('Canonicalization job failed', err as Error);
    process.exit(1);
  }
}

/**
 * CLI entry point for retry
 */
export async function retryFailedCanonicalization(): Promise<void> {
  const runner = new CanonicalizationJobRunner();
  
  try {
    await runner.retryFailedMixes();
    process.exit(0);
  } catch (err) {
    logger.error('Retry job failed', err as Error);
    process.exit(1);
  }
}

/**
 * CLI entry point for stats
 */
export async function showCanonicalizationStats(): Promise<void> {
  const runner = new CanonicalizationJobRunner();
  
  try {
    const stats = await runner.getStats();
    
    console.log('\n📊 Canonicalization Statistics:');
    console.log(`Total raw mixes: ${stats.total}`);
    console.log(`Pending: ${stats.pending}`);
    console.log(`Processing: ${stats.processing}`);
    console.log(`Canonicalized: ${stats.canonicalized}`);
    console.log(`Failed: ${stats.failed}`);
    
    if (stats.total > 0) {
      const completionRate = ((stats.canonicalized / stats.total) * 100).toFixed(1);
      console.log(`Completion rate: ${completionRate}%`);
    }
    
    process.exit(0);
  } catch (err) {
    logger.error('Stats command failed', err as Error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  const command = process.argv[2] || 'run';
  
  switch (command) {
    case 'run':
      runCanonicalizationJob();
      break;
    case 'retry':
      retryFailedCanonicalization();
      break;
    case 'stats':
      showCanonicalizationStats();
      break;
    default:
      console.log('Usage: npm run canonicalize [run|retry|stats]');
      process.exit(1);
  }
}