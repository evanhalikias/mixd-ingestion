-- Migration: Create staging tables for mixd-ingestion service
-- Description: Raw ingestion tables and job orchestration tables

-- Raw mixes from external sources
CREATE TABLE raw_mixes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('youtube', 'soundcloud', '1001tracklists')),
  source_url TEXT NOT NULL UNIQUE,
  external_id TEXT, -- provider-specific ID for deduplication
  raw_title TEXT,
  raw_description TEXT,
  raw_artist TEXT, -- unparsed artist string from source
  uploaded_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  artwork_url TEXT,
  raw_metadata JSONB, -- additional provider-specific data
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'canonicalized', 'failed')),
  canonicalized_mix_id UUID, -- FK to mixes table after processing
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Raw track data from tracklists
CREATE TABLE raw_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_mix_id UUID NOT NULL REFERENCES raw_mixes(id) ON DELETE CASCADE,
  line_text TEXT NOT NULL, -- original text line from tracklist
  position INTEGER,
  timestamp_seconds INTEGER,
  raw_artist TEXT, -- parsed artist if available
  raw_title TEXT, -- parsed title if available
  source TEXT, -- where this came from (description, comment, etc)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job orchestration for ingestion workers
CREATE TABLE ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_type TEXT NOT NULL CHECK (worker_type IN ('soundcloud', 'youtube', '1001tracklists', 'canonicalization')),
  job_payload JSONB, -- configuration for the job
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'retrying')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comprehensive logging for all ingestion activities
CREATE TABLE ingestion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES ingestion_jobs(id) ON DELETE SET NULL,
  raw_mix_id UUID REFERENCES raw_mixes(id) ON DELETE SET NULL,
  worker_type TEXT,
  message TEXT NOT NULL,
  level TEXT DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
  metadata JSONB, -- additional context data
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_raw_mixes_provider ON raw_mixes(provider);
CREATE INDEX idx_raw_mixes_status ON raw_mixes(status);
CREATE INDEX idx_raw_mixes_created_at ON raw_mixes(created_at);
CREATE INDEX idx_raw_tracks_raw_mix_id ON raw_tracks(raw_mix_id);
CREATE INDEX idx_raw_tracks_position ON raw_tracks(raw_mix_id, position);
CREATE INDEX idx_ingestion_jobs_status ON ingestion_jobs(status);
CREATE INDEX idx_ingestion_jobs_worker_type ON ingestion_jobs(worker_type);
CREATE INDEX idx_ingestion_jobs_next_run ON ingestion_jobs(next_run) WHERE status = 'queued';
CREATE INDEX idx_ingestion_logs_created_at ON ingestion_logs(created_at);
CREATE INDEX idx_ingestion_logs_level ON ingestion_logs(level);
CREATE INDEX idx_ingestion_logs_job_id ON ingestion_logs(job_id);