-- Migration: Enhance artist_profiles table for staging workflow
-- Adds approval workflow fields while keeping existing discovery functionality

-- Add staging workflow fields to existing artist_profiles table
ALTER TABLE artist_profiles 
ADD COLUMN IF NOT EXISTS proposed_by TEXT DEFAULT 'artist-discovery-worker',
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS backfill_jobs_created BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS backfill_job_ids JSONB DEFAULT '[]';

-- Add indexes for approval workflow performance
CREATE INDEX IF NOT EXISTS idx_artist_profiles_approval_status ON artist_profiles(approval_status);
CREATE INDEX IF NOT EXISTS idx_artist_profiles_approved_at ON artist_profiles(approved_at) WHERE approval_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_artist_profiles_proposed_by ON artist_profiles(proposed_by);

-- Update existing records to have proper approval status based on verification_status
UPDATE artist_profiles 
SET approval_status = CASE 
  WHEN verification_status = 'verified' THEN 'approved'
  WHEN verification_status = 'rejected' THEN 'rejected'
  ELSE 'pending'
END
WHERE approval_status = 'pending'; -- Only update records that haven't been manually set

-- Set approved_at for existing verified profiles
UPDATE artist_profiles 
SET approved_at = verified_at
WHERE approval_status = 'approved' AND verified_at IS NOT NULL AND approved_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN artist_profiles.approval_status IS 'Staging workflow status - pending profiles need moderator approval before job creation';
COMMENT ON COLUMN artist_profiles.proposed_by IS 'Source of the discovery - artist-discovery-worker, user:uuid, or system';
COMMENT ON COLUMN artist_profiles.backfill_jobs_created IS 'Tracks whether backfill jobs have been automatically created for this approved artist';
COMMENT ON COLUMN artist_profiles.backfill_job_ids IS 'Array of job IDs that were created when this artist was approved';