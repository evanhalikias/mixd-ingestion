import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

import { getServiceClient } from '../lib/supabase/service';
import { logger } from '../services/logger';
import type { 
  IngestionJob, 
  BaseJobPayload, 
  StructuredError,
  SystemHealth 
} from '../lib/supabase/types';
import { SoundCloudWorker } from '../workers/soundcloud-worker';
import { YouTubeWorker } from '../workers/youtube-worker';
import { OneTracklistWorker } from '../workers/1001tracklists-worker';
import { MixCanonicalizer, type CanonicalizationOptions } from '../canonicalizer/canonicalize-mix';
import type { SourceConfig, BaseIngestionWorker } from '../lib/worker-interface';

/**
 * Job processor that polls for pending ingestion jobs and executes them
 */

export interface JobExecutionResult {
  success: boolean;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  errors: StructuredError[];
  duration: number;
}

export class IngestionJobProcessor {
  private supabase = getServiceClient();
  private isRunning = false;
  private pollInterval = 2 * 60 * 1000; // 2 minutes
  private currentJobId: string | null = null;
  private canonicalizer = new MixCanonicalizer();
  private readonly SYSTEM_USER_ID = 'system-auto-verify'; // System user for automated verification
  
  private workers = new Map<string, BaseIngestionWorker>([
    ['soundcloud', new SoundCloudWorker()],
    ['youtube', new YouTubeWorker()],
    ['1001tracklists', new OneTracklistWorker()],
  ]);

  /**
   * Ensure system user exists for automated verification tracking
   */
  private async ensureSystemUser(): Promise<void> {
    try {
      // Check if system user exists in users table
      const { data: existingUser, error: fetchError } = await this.supabase
        .from('users')
        .select('id')
        .eq('id', this.SYSTEM_USER_ID)
        .maybeSingle();

      if (fetchError) {
        logger.warn('Could not check for system user (users table may not exist)', fetchError);
        return;
      }

      if (!existingUser) {
        // Create system user for verification tracking
        const { error: insertError } = await this.supabase
          .from('users')
          .insert({
            id: this.SYSTEM_USER_ID,
            email: 'system@mixd.fm',
            name: 'System Auto-Verify',
            role: 'system'
          });

        if (insertError) {
          logger.warn('Could not create system user (will use null for verification)', insertError);
        } else {
          logger.info('Created system user for automated verification tracking');
        }
      }
    } catch (error) {
      logger.warn('Error ensuring system user exists', error as Error);
    }
  }

  /**
   * Start the continuous polling loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Job processor is already running');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Starting ingestion job processor');

    // Ensure system user exists for verification tracking
    await this.ensureSystemUser();

    // Set up graceful shutdown
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());

    // Start polling loop
    await this.pollLoop();
  }

  /**
   * Stop the polling loop
   */
  async stop(): Promise<void> {
    logger.info('🛑 Stopping ingestion job processor');
    this.isRunning = false;

    // If there's a job running, mark it as failed so it can be retried
    if (this.currentJobId) {
      await this.handleJobFailure(
        this.currentJobId,
        'Job processor shutdown during execution'
      );
    }
  }

  /**
   * Main polling loop
   */
  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Update health monitoring
        await this.updateHealthStatus();

        // Get next pending job
        const job = await this.getNextPendingJob();
        
        if (job) {
          await this.processJob(job);
        }

        // Wait before next poll
        await this.sleep(this.pollInterval);
      } catch (error) {
        logger.error('Error in polling loop', error as Error);
        await this.sleep(this.pollInterval);
      }
    }
  }

  /**
   * Get the next pending job using FOR UPDATE SKIP LOCKED
   */
  private async getNextPendingJob(): Promise<IngestionJob | null> {
    try {
      // Use raw SQL for FOR UPDATE SKIP LOCKED
      const { data, error } = await this.supabase.rpc('get_next_pending_job');
      
      if (error) {
        // Fallback to regular query if RPC doesn't exist
        const fallbackResult = await this.supabase
          .from('ingestion_jobs')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (fallbackResult.error) {
          logger.error('Error fetching next job', fallbackResult.error);
          return null;
        }
        
        return fallbackResult.data;
      }

      return data;
    } catch (error) {
      logger.error('Error in getNextPendingJob', error as Error);
      return null;
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: IngestionJob): Promise<void> {
    this.currentJobId = job.id;
    const startTime = Date.now();

    try {
      logger.info(`📋 Processing job ${job.id}: ${job.worker_type}`);

      // Mark job as running
      await this.markJobAsRunning(job.id);

      // Parse and validate job payload
      const payload = this.parseJobPayload(job.job_payload);
      
      // Log job start
      await this.logJobEvent(job.id, 'info', 'Job execution started', {
        worker_type: job.worker_type,
        payload,
        attempt: job.attempts + 1
      });

      // Execute the job
      const result = await this.executeJob(job, payload);

      // Handle job completion
      if (result.success) {
        await this.handleJobSuccess(job, result);
      } else {
        await this.handleJobFailure(job.id, 'Job execution failed', result.errors);
      }

      const duration = Date.now() - startTime;
      logger.info(`✅ Job ${job.id} completed in ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`❌ Job ${job.id} failed after ${duration}ms: ${errorMessage}`);
      
      await this.handleJobFailure(job.id, errorMessage);
    } finally {
      this.currentJobId = null;
    }
  }

  /**
   * Parse and validate job payload
   */
  private parseJobPayload(payload: any): BaseJobPayload {
    if (!payload) {
      throw new Error('Job payload is required');
    }

    const required = ['worker_type', 'source_id', 'mode', 'batch_size'];
    for (const field of required) {
      if (!payload[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!['youtube', 'soundcloud', '1001tracklists'].includes(payload.worker_type)) {
      throw new Error(`Invalid worker_type: ${payload.worker_type}`);
    }

    if (!['backfill', 'rolling'].includes(payload.mode)) {
      throw new Error(`Invalid mode: ${payload.mode}`);
    }

    if (typeof payload.batch_size !== 'number' || payload.batch_size <= 0) {
      throw new Error('batch_size must be a positive number');
    }

    return payload as BaseJobPayload;
  }

  /**
   * Execute the job using the appropriate worker
   */
  private async executeJob(job: IngestionJob, payload: BaseJobPayload): Promise<JobExecutionResult> {
    const worker = this.workers.get(payload.worker_type);
    if (!worker) {
      throw new Error(`Unknown worker type: ${payload.worker_type}`);
    }

    // Convert job payload to worker config
    const config = this.payloadToWorkerConfig(payload);
    
    // Add mode-specific settings
    config.mode = payload.mode;
    config.isVerified = payload.mode === 'rolling'; // Auto-verify for rolling, manual for backfill

    try {
      // Execute the worker
      const workerResult = await worker.run(config);

      // If successful, canonicalize new raw mixes
      let canonicalizedCount = 0;
      let canonicalizationErrors: StructuredError[] = [];

      if (workerResult.success && workerResult.mixesAdded > 0) {
        const canonicalizationOptions: CanonicalizationOptions = {
          mode: payload.mode,
          autoVerifyThreshold: payload.mode === 'rolling' ? 0.9 : 0.0,
          systemUserId: this.SYSTEM_USER_ID
        };

        // Get raw mixes that need canonicalization
        const { data: rawMixes, error: fetchError } = await this.supabase
          .from('raw_mixes')
          .select('id')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(workerResult.mixesAdded);

        if (!fetchError && rawMixes) {
          for (const rawMix of rawMixes) {
            try {
              const canonResult = await this.canonicalizer.canonicalizeMix(
                rawMix.id, 
                canonicalizationOptions
              );
              
              if (canonResult.success) {
                canonicalizedCount++;
              } else {
                canonicalizationErrors.push({
                  error_type: 'canonicalization_error',
                  message: `Failed to canonicalize ${rawMix.id}: ${canonResult.errors.join(', ')}`
                });
              }
            } catch (error) {
              canonicalizationErrors.push({
                error_type: 'canonicalization_error',
                message: `Canonicalization exception for ${rawMix.id}: ${error}`
              });
            }
          }
        }
      }

      // Convert worker result to job execution result
      const allErrors = [
        ...workerResult.errors.map(error => ({
          error_type: 'worker_error' as const,
          message: error
        })),
        ...canonicalizationErrors
      ];

      return {
        success: workerResult.success && canonicalizationErrors.length === 0,
        totalItems: workerResult.mixesFound,
        successfulItems: canonicalizedCount, // Count canonicalized mixes as successful
        failedItems: workerResult.errors.length + canonicalizationErrors.length,
        errors: allErrors,
        duration: workerResult.duration
      };
    } catch (error) {
      return {
        success: false,
        totalItems: 0,
        successfulItems: 0,
        failedItems: 1,
        errors: [{
          error_type: 'execution_error',
          message: error instanceof Error ? error.message : String(error)
        }],
        duration: 0
      };
    }
  }

  /**
   * Convert job payload to worker configuration
   */
  private payloadToWorkerConfig(payload: BaseJobPayload): SourceConfig & { mode?: string; isVerified?: boolean } {
    const config: SourceConfig & { mode?: string; isVerified?: boolean } = {
      maxResults: payload.batch_size,
    };

    // Add source-specific configuration
    switch (payload.worker_type) {
      case 'youtube':
        // source_id should be a channel ID
        config.channels = [payload.source_id];
        break;
      case 'soundcloud':
        // source_id should be a username
        config.artists = [payload.source_id];
        break;
      case '1001tracklists':
        // source_id should be a search term or URL
        if (payload.source_id.startsWith('http')) {
          config.urls = [payload.source_id];
        } else {
          config.searchTerms = [payload.source_id];
        }
        break;
    }

    // Add date range for backfill vs rolling
    if (payload.mode === 'rolling') {
      // Rolling: last 7 days
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      config.dateRange = {
        from: weekAgo,
        to: now
      };
    } else {
      // Backfill: much larger range (1 year)
      const now = new Date();
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      config.dateRange = {
        from: yearAgo,
        to: now
      };
    }

    return config;
  }

  /**
   * Mark job as running
   */
  private async markJobAsRunning(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from('ingestion_jobs')
      .update({
        status: 'running',
        last_run: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    if (error) {
      throw new Error(`Failed to mark job as running: ${error.message}`);
    }
  }

  /**
   * Handle successful job completion
   */
  private async handleJobSuccess(job: IngestionJob, result: JobExecutionResult): Promise<void> {
    // Mark job as completed
    const { error } = await this.supabase
      .from('ingestion_jobs')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id);

    if (error) {
      logger.error(`Failed to mark job as completed: ${error.message}`);
      return;
    }

    // Log completion with summary
    await this.logJobEvent(job.id, 'info', 'Job completed successfully', {
      ...result,
      final_status: 'completed'
    });
  }

  /**
   * Handle job failure with retry logic
   */
  private async handleJobFailure(
    jobId: string, 
    errorMessage: string,
    errors: StructuredError[] = []
  ): Promise<void> {
    try {
      // Get current job to check retry logic
      const { data: job, error: fetchError } = await this.supabase
        .from('ingestion_jobs')
        .select('attempts, max_attempts')
        .eq('id', jobId)
        .single();

      if (fetchError) {
        logger.error('Error fetching job for failure handling', fetchError);
        return;
      }

      const newAttempts = job.attempts + 1;
      const shouldRetry = newAttempts < job.max_attempts;

      if (shouldRetry) {
        // Reset to pending for retry
        const { error } = await this.supabase
          .from('ingestion_jobs')
          .update({
            status: 'pending',
            attempts: newAttempts,
            error_message: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId);

        if (error) {
          logger.error('Error updating job for retry', error);
          return;
        }

        await this.logJobEvent(jobId, 'warn', `Job failed (attempt ${newAttempts}/${job.max_attempts}), will retry`, {
          error_message: errorMessage,
          errors,
          attempt: newAttempts
        });
      } else {
        // Mark as permanently failed
        const { error } = await this.supabase
          .from('ingestion_jobs')
          .update({
            status: 'failed',
            attempts: newAttempts,
            error_message: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId);

        if (error) {
          logger.error('Error marking job as failed', error);
          return;
        }

        await this.logJobEvent(jobId, 'error', `Job permanently failed after ${newAttempts} attempts`, {
          error_message: errorMessage,
          errors,
          final_status: 'failed'
        });
      }
    } catch (error) {
      logger.error('Error in handleJobFailure', error as Error);
    }
  }

  /**
   * Log a job event
   */
  private async logJobEvent(
    jobId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    metadata?: any
  ): Promise<void> {
    const { error } = await this.supabase
      .from('ingestion_logs')
      .insert({
        job_id: jobId,
        worker_type: 'job_processor',
        level,
        message,
        metadata: metadata || null
      });

    if (error) {
      logger.error('Failed to write job log', error);
    }

    // Also log to console
    logger[level](message, metadata);
  }

  /**
   * Update system health status
   */
  private async updateHealthStatus(): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('system_health')
        .upsert({
          service_name: 'job_runner',
          last_polled_at: new Date().toISOString(),
          metadata: {
            status: 'running',
            current_job: this.currentJobId,
            poll_interval_ms: this.pollInterval
          },
          updated_at: new Date().toISOString()
        })
        .eq('service_name', 'job_runner');

      if (error) {
        logger.error('Failed to update health status', error);
      }
    } catch (error) {
      logger.error('Error updating health status', error as Error);
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * CLI entry point
 */
export async function runJobProcessor(): Promise<void> {
  const processor = new IngestionJobProcessor();
  
  try {
    await processor.start();
  } catch (error) {
    logger.error('Job processor failed', error as Error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runJobProcessor();
}