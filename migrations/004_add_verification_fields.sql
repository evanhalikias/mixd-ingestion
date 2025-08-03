-- Add verification fields to production tables for human-in-the-loop verification
-- Migration: 004_add_verification_fields.sql

-- Add verification fields to mixes table
ALTER TABLE mixes 
ADD COLUMN is_verified boolean DEFAULT false NOT NULL,
ADD COLUMN verified_by uuid REFERENCES auth.users(id),
ADD COLUMN verified_at timestamptz;

-- Add verification fields to contexts table
ALTER TABLE contexts 
ADD COLUMN is_verified boolean DEFAULT false NOT NULL,
ADD COLUMN verified_by uuid REFERENCES auth.users(id),
ADD COLUMN verified_at timestamptz;

-- Add verification fields to venues table
ALTER TABLE venues 
ADD COLUMN is_verified boolean DEFAULT false NOT NULL,
ADD COLUMN verified_by uuid REFERENCES auth.users(id),
ADD COLUMN verified_at timestamptz;

-- Create indexes for efficient queries on verification status
CREATE INDEX idx_mixes_verification ON mixes(is_verified, verified_at);
CREATE INDEX idx_contexts_verification ON contexts(is_verified, verified_at);
CREATE INDEX idx_venues_verification ON venues(is_verified, verified_at);

-- Create additional indexes for unverified records (common query pattern)
CREATE INDEX idx_mixes_unverified ON mixes(is_verified) WHERE is_verified = false;
CREATE INDEX idx_contexts_unverified ON contexts(is_verified) WHERE is_verified = false;
CREATE INDEX idx_venues_unverified ON venues(is_verified) WHERE is_verified = false;

-- Note: All existing rows will default to is_verified=false as required
-- No explicit backfill needed since DEFAULT false handles this