-- Migration: Update ingestion_jobs schema for job runner
-- Date: 2025-08-03

-- 1. Update status constraint to use standardized values
ALTER TABLE ingestion_jobs 
DROP CONSTRAINT IF EXISTS ingestion_jobs_status_check;

ALTER TABLE ingestion_jobs 
ADD CONSTRAINT ingestion_jobs_status_check 
CHECK (status IN ('pending', 'running', 'completed', 'failed'));

-- 2. Add audit trail column
ALTER TABLE ingestion_jobs 
ADD COLUMN requested_by UUID REFERENCES users(id);

-- 3. Add retry logic columns (if they don't exist)
ALTER TABLE ingestion_jobs 
ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;

ALTER TABLE ingestion_jobs 
ADD COLUMN IF NOT EXISTS max_attempts INTEGER DEFAULT 3;

-- 4. Add performance index for job polling
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status_created_at 
ON ingestion_jobs (status, created_at);

-- 5. Add safety constraint to prevent duplicate jobs (simplified to avoid function immutability issues)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_jobs_unique_active 
ON ingestion_jobs (worker_type, (job_payload->>'source_id'), (job_payload->>'mode'))
WHERE status IN ('pending', 'running');

-- 6. Create system_health table for monitoring
CREATE TABLE IF NOT EXISTS system_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name TEXT NOT NULL,
    last_polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique constraint to ensure one record per service
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_health_service_name 
ON system_health (service_name);

-- Insert initial record for job runner
INSERT INTO system_health (service_name, metadata) 
VALUES ('job_runner', '{"status": "initialized", "version": "1.0.0"}')
ON CONFLICT (service_name) DO NOTHING;

-- 7. Update existing jobs to use new status values
UPDATE ingestion_jobs 
SET status = 'pending' 
WHERE status = 'queued';

UPDATE ingestion_jobs 
SET status = 'pending' 
WHERE status = 'retrying';

-- 8. Add comment for documentation
COMMENT ON TABLE ingestion_jobs IS 'Jobs created by MixNext admin tool for processing by ingestion workers';
COMMENT ON COLUMN ingestion_jobs.requested_by IS 'User who requested this job via admin interface';
COMMENT ON COLUMN ingestion_jobs.attempts IS 'Number of execution attempts for retry logic';
COMMENT ON COLUMN ingestion_jobs.max_attempts IS 'Maximum retries before marking as failed';
COMMENT ON TABLE system_health IS 'Health monitoring for background services';