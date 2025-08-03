-- Migration: Add ingestion-related columns to existing production tables
-- Description: Adds is_verified flag and ingestion metadata to existing mixes table

-- Add columns to existing mixes table for admin review workflow
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS ingestion_source TEXT CHECK (ingestion_source IN ('youtube', 'soundcloud', '1001tracklists', 'manual'));
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS ingestion_notes TEXT;
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS raw_mix_id UUID; -- Link back to raw staging data

-- Add indexes for admin review queries
CREATE INDEX IF NOT EXISTS idx_mixes_is_verified ON mixes(is_verified);
CREATE INDEX IF NOT EXISTS idx_mixes_ingestion_source ON mixes(ingestion_source);

-- Add similar verification columns to tracks and artists for new entities
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS ingestion_source TEXT CHECK (ingestion_source IN ('youtube', 'soundcloud', '1001tracklists', 'manual'));

ALTER TABLE artists ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS ingestion_source TEXT CHECK (ingestion_source IN ('youtube', 'soundcloud', '1001tracklists', 'manual'));

-- Indexes for verification workflow
CREATE INDEX IF NOT EXISTS idx_tracks_is_verified ON tracks(is_verified);
CREATE INDEX IF NOT EXISTS idx_artists_is_verified ON artists(is_verified);