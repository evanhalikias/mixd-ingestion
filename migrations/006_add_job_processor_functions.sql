-- Migration: Add SQL functions for job processor
-- Date: 2025-08-03

-- Create function to get next pending job with FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION get_next_pending_job()
RETURNS TABLE (
    id UUID,
    worker_type TEXT,
    job_payload JSONB,
    status TEXT,
    attempts INTEGER,
    max_attempts INTEGER,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    error_message TEXT,
    requested_by UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE sql
AS $$
    SELECT 
        j.id,
        j.worker_type,
        j.job_payload,
        j.status,
        j.attempts,
        j.max_attempts,
        j.last_run,
        j.next_run,
        j.error_message,
        j.requested_by,
        j.created_at,
        j.updated_at
    FROM ingestion_jobs j
    WHERE j.status = 'pending'
    ORDER BY j.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
$$;

-- Add comment
COMMENT ON FUNCTION get_next_pending_job() IS 'Gets the next pending job with proper locking to prevent race conditions';