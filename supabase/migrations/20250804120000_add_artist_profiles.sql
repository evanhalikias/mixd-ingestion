-- Add artist profiles table for centralized artist platform discovery

CREATE TABLE artist_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL, -- Lowercase, no special chars for matching
  
  -- Platform URLs and identifiers
  soundcloud_url TEXT,
  soundcloud_username TEXT,
  youtube_channel_url TEXT,
  youtube_channel_id TEXT,
  spotify_artist_id TEXT,
  spotify_url TEXT,
  tracklists_1001_url TEXT,
  
  -- Confidence scores for each discovered platform (0.0 to 1.0)
  confidence_scores JSONB DEFAULT '{}',
  
  -- Additional metadata from each platform
  platform_metadata JSONB DEFAULT '{}',
  
  -- Verification and status tracking
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected', 'manual_review')),
  discovery_method TEXT DEFAULT 'automatic' CHECK (discovery_method IN ('automatic', 'manual', 'hybrid')),
  
  -- Discovery notes and manual overrides
  notes TEXT,
  manual_overrides JSONB DEFAULT '{}',
  
  -- Timestamps
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(normalized_name)
);

-- Performance indexes
CREATE INDEX idx_artist_profiles_artist_name ON artist_profiles(artist_name);
CREATE INDEX idx_artist_profiles_normalized_name ON artist_profiles(normalized_name);
CREATE INDEX idx_artist_profiles_verification_status ON artist_profiles(verification_status);
CREATE INDEX idx_artist_profiles_discovery_method ON artist_profiles(discovery_method);
CREATE INDEX idx_artist_profiles_soundcloud_username ON artist_profiles(soundcloud_username) WHERE soundcloud_username IS NOT NULL;
CREATE INDEX idx_artist_profiles_youtube_channel_id ON artist_profiles(youtube_channel_id) WHERE youtube_channel_id IS NOT NULL;
CREATE INDEX idx_artist_profiles_spotify_artist_id ON artist_profiles(spotify_artist_id) WHERE spotify_artist_id IS NOT NULL;

-- Gin indexes for JSON fields
CREATE INDEX idx_artist_profiles_confidence_scores ON artist_profiles USING GIN (confidence_scores);
CREATE INDEX idx_artist_profiles_platform_metadata ON artist_profiles USING GIN (platform_metadata);
CREATE INDEX idx_artist_profiles_manual_overrides ON artist_profiles USING GIN (manual_overrides);

-- Function to normalize artist names for consistent matching
CREATE OR REPLACE FUNCTION normalize_artist_name(input_name TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(input_name, '[^a-zA-Z0-9\s]', '', 'g'), -- Remove special chars
      '\s+', ' ', 'g' -- Normalize whitespace
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to automatically set normalized_name
CREATE OR REPLACE FUNCTION set_normalized_artist_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_name := normalize_artist_name(NEW.artist_name);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_normalized_artist_name
  BEFORE INSERT OR UPDATE ON artist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_normalized_artist_name();

-- Helper function to get artist profile by name (fuzzy matching)
CREATE OR REPLACE FUNCTION get_artist_profile_by_name(search_name TEXT)
RETURNS TABLE (
  id UUID,
  artist_name TEXT,
  confidence_match NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ap.id,
    ap.artist_name,
    CASE 
      WHEN ap.normalized_name = normalize_artist_name(search_name) THEN 1.0
      WHEN ap.normalized_name LIKE '%' || normalize_artist_name(search_name) || '%' THEN 0.8
      WHEN similarity(ap.normalized_name, normalize_artist_name(search_name)) > 0.6 THEN similarity(ap.normalized_name, normalize_artist_name(search_name))
      ELSE 0.0
    END AS confidence_match
  FROM artist_profiles ap
  WHERE 
    ap.normalized_name = normalize_artist_name(search_name) OR
    ap.normalized_name LIKE '%' || normalize_artist_name(search_name) || '%' OR
    similarity(ap.normalized_name, normalize_artist_name(search_name)) > 0.6
  ORDER BY confidence_match DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;