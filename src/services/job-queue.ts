import type { IngestionJob, IngestionLog } from '../lib/supabase/types';
import { getServiceClient } from '../lib/supabase/service';

/**
 * Job queue system for managing ingestion tasks
 */

export interface JobPayload {
  workerType: 'soundcloud' | 'youtube' | '1001tracklists' | 'canonicalization';
  config?: any; // Source-specific configuration
  [key: string]: any;
}

export interface CreateJobOptions {
  workerType: JobPayload['workerType'];
  payload?: any;
  maxAttempts?: number;
  runAt?: Date; // Schedule for later
}

/**
 * Job queue manager
 */
export class JobQueue {
  private supabase = getServiceClient();
  
  /**
   * Create a new job
   */
  async createJob(options: CreateJobOptions): Promise<string> {
    const { workerType, payload = {}, maxAttempts = 3, runAt } = options;
    
    const jobData: Partial<IngestionJob> = {
      worker_type: workerType,
      job_payload: payload,
      max_attempts: maxAttempts,
      next_run: runAt?.toISOString() || new Date().toISOString(),
      status: 'pending',
    };
    
    const { data, error } = await this.supabase
      .from('ingestion_jobs')
      .insert(jobData)
      .select('id')
      .single();
    
    if (error) {
      throw new Error(`Failed to create job: ${error.message}`);
    }
    
    await this.log(data.id, `Job created for ${workerType}`, 'info');
    return data.id;
  }
  
  /**
   * Get the next job to run
   */
  async getNextJob(): Promise<IngestionJob | null> {
    const { data, error } = await this.supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('status', 'pending')
      .lte('next_run', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.error('Error fetching next job:', error);
      return null;
    }
    
    return data;
  }
  
  /**
   * Mark a job as running
   */
  async startJob(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from('ingestion_jobs')
      .update({
        status: 'running',
        last_run: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    if (error) {
      throw new Error(`Failed to start job: ${error.message}`);
    }
    
    await this.log(jobId, 'Job started', 'info');
  }
  
  /**
   * Mark a job as completed
   */
  async completeJob(jobId: string, result?: any): Promise<void> {
    const { error } = await this.supabase
      .from('ingestion_jobs')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    if (error) {
      throw new Error(`Failed to complete job: ${error.message}`);
    }
    
    const message = result 
      ? `Job completed successfully: ${JSON.stringify(result)}`
      : 'Job completed successfully';
    
    await this.log(jobId, message, 'info');
  }
  
  /**
   * Mark a job as failed and handle retries
   */
  async failJob(jobId: string, errorMessage: string): Promise<void> {
    // First, get the current job to check attempts
    const { data: job, error: fetchError } = await this.supabase
      .from('ingestion_jobs')
      .select('attempts, max_attempts')
      .eq('id', jobId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching job for failure:', fetchError);
      return;
    }
    
    const newAttempts = job.attempts + 1;
    const shouldRetry = newAttempts < job.max_attempts;
    
    if (shouldRetry) {
      // Schedule retry with exponential backoff
      const backoffMinutes = Math.pow(2, newAttempts) * 5; // 5, 10, 20 minutes
      const nextRun = new Date(Date.now() + backoffMinutes * 60 * 1000);
      
      const { error } = await this.supabase
        .from('ingestion_jobs')
        .update({
          status: 'pending',
          attempts: newAttempts,
          error_message: errorMessage,
          next_run: nextRun.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      
      if (error) {
        console.error('Error scheduling retry:', error);
        return;
      }
      
      await this.log(
        jobId, 
        `Job failed (attempt ${newAttempts}/${job.max_attempts}), retrying in ${backoffMinutes} minutes: ${errorMessage}`, 
        'warn'
      );
    } else {
      // Mark as permanently failed
      const { error } = await this.supabase
        .from('ingestion_jobs')
        .update({
          status: 'failed',
          attempts: newAttempts,
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
      
      if (error) {
        console.error('Error marking job as failed:', error);
        return;
      }
      
      await this.log(
        jobId, 
        `Job permanently failed after ${newAttempts} attempts: ${errorMessage}`, 
        'error'
      );
    }
  }
  
  /**
   * Reset a job back to pending status (for manual retry)
   */
  async resetJob(jobId: string): Promise<void> {
    const { error } = await this.supabase
      .from('ingestion_jobs')
      .update({
        status: 'pending',
        error_message: null,
        next_run: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    if (error) {
      throw new Error(`Failed to reset job: ${error.message}`);
    }
    
    await this.log(jobId, 'Job manually reset to pending', 'info');
  }
  
  /**
   * Log a message for a job
   */
  async log(
    jobId: string | null, 
    message: string, 
    level: 'debug' | 'info' | 'warn' | 'error' = 'info',
    metadata?: any
  ): Promise<void> {
    const logData: Partial<IngestionLog> = {
      job_id: jobId,
      message,
      level,
      metadata: metadata || null,
    };
    
    const { error } = await this.supabase
      .from('ingestion_logs')
      .insert(logData);
    
    if (error) {
      console.error('Failed to write log:', error);
    }
    
    // Also log to console
    const timestamp = new Date().toISOString();
    const logLevel = level.toUpperCase().padEnd(5);
    console.log(`[${timestamp}] ${logLevel} ${message}`);
  }
  
  /**
   * Get recent logs for a job
   */
  async getJobLogs(jobId: string, limit = 50): Promise<IngestionLog[]> {
    const { data, error } = await this.supabase
      .from('ingestion_logs')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Error fetching job logs:', error);
      return [];
    }
    
    return data;
  }
  
  /**
   * Clean up old completed/failed jobs
   */
  async cleanupOldJobs(olderThanDays = 30): Promise<void> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    const { error } = await this.supabase
      .from('ingestion_jobs')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('updated_at', cutoffDate.toISOString());
    
    if (error) {
      console.error('Error cleaning up old jobs:', error);
    } else {
      await this.log(null, `Cleaned up jobs older than ${olderThanDays} days`, 'info');
    }
  }
}