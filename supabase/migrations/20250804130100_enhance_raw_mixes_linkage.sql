-- Migration: Enhance raw_mixes table for artist linkage and context suggestions
-- Links raw mixes to discovered artists and stores basic context rule suggestions

-- Add artist linkage and discovery tracking to raw_mixes
ALTER TABLE raw_mixes 
ADD COLUMN IF NOT EXISTS discovered_artist_id UUID REFERENCES artist_profiles(id),
ADD COLUMN IF NOT EXISTS discovery_source TEXT DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS suggested_contexts JSONB DEFAULT '[]';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_raw_mixes_discovered_artist ON raw_mixes(discovered_artist_id);
CREATE INDEX IF NOT EXISTS idx_raw_mixes_discovery_source ON raw_mixes(discovery_source);
CREATE INDEX IF NOT EXISTS idx_raw_mixes_suggested_contexts ON raw_mixes USING GIN (suggested_contexts);

-- Add compound index for artist + status queries  
CREATE INDEX IF NOT EXISTS idx_raw_mixes_artist_status ON raw_mixes(discovered_artist_id, status);

-- Add comments for documentation
COMMENT ON COLUMN raw_mixes.discovered_artist_id IS 'Links to the artist_profiles entry that triggered this mix discovery';
COMMENT ON COLUMN raw_mixes.discovery_source IS 'Source of discovery: artist-discovery-backfill, rolling-job, manual-input';
COMMENT ON COLUMN raw_mixes.suggested_contexts IS 'Array of context suggestions from rules engine: [{rule_id, context_type, context_name, confidence, reasoning}]';

-- Create a view for easy artist-mix relationship queries
CREATE OR REPLACE VIEW artist_mix_discovery AS
SELECT 
  ap.id as artist_id,
  ap.artist_name,
  ap.approval_status,
  ap.approved_at,
  rm.id as raw_mix_id,
  rm.raw_title,
  rm.discovery_source,
  rm.status as mix_status,
  rm.suggested_contexts,
  rm.created_at as discovered_at
FROM artist_profiles ap
JOIN raw_mixes rm ON ap.id = rm.discovered_artist_id
ORDER BY ap.artist_name, rm.created_at DESC;

COMMENT ON VIEW artist_mix_discovery IS 'Convenient view for seeing which mixes were discovered from which approved artists';