-- Add contexts and venues schema for rich mix context modeling

-- Venues table for physical locations and stages
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  country TEXT,
  lat NUMERIC,
  lng NUMERIC,
  capacity INTEGER,
  website TEXT,
  external_ids JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contexts table for festivals, radio shows, publishers, labels, etc.
CREATE TABLE contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('festival', 'radio_show', 'publisher', 'series', 'label', 'promoter', 'stage')),
  parent_id UUID REFERENCES contexts(id) ON DELETE SET NULL,
  website TEXT,
  external_ids JSONB DEFAULT '{}',
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Join table linking mixes to their contexts with roles
CREATE TABLE mix_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_id UUID NOT NULL REFERENCES mixes(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('performed_at', 'broadcasted_on', 'published_by')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(mix_id, context_id, role)
);

-- Add venue_id to existing mixes table
ALTER TABLE mixes ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;

-- Performance indexes
CREATE INDEX idx_contexts_type ON contexts(type);
CREATE INDEX idx_contexts_parent_id ON contexts(parent_id);
CREATE INDEX idx_contexts_venue_id ON contexts(venue_id);
CREATE INDEX idx_mix_contexts_mix_id ON mix_contexts(mix_id);
CREATE INDEX idx_mix_contexts_context_id ON mix_contexts(context_id);
CREATE INDEX idx_mix_contexts_role ON mix_contexts(role);
CREATE INDEX idx_venues_city ON venues(city);
CREATE INDEX idx_venues_country ON venues(country);
CREATE INDEX idx_venues_city_country ON venues(city, country);
CREATE INDEX idx_mixes_venue_id ON mixes(venue_id);

-- Hierarchical depth check function
CREATE OR REPLACE FUNCTION check_context_hierarchy_depth()
RETURNS TRIGGER AS $$
DECLARE
  depth INTEGER := 0;
  current_id UUID := NEW.parent_id;
BEGIN
  WHILE current_id IS NOT NULL LOOP
    depth := depth + 1;
    IF depth > 4 THEN
      RAISE WARNING 'Context hierarchy depth > 4 levels detected for context: % (parent: %)', NEW.name, NEW.parent_id;
      EXIT;
    END IF;
    
    SELECT parent_id INTO current_id FROM contexts WHERE id = current_id;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check hierarchy depth on insert/update
CREATE TRIGGER trigger_check_context_depth
  BEFORE INSERT OR UPDATE ON contexts
  FOR EACH ROW
  EXECUTE FUNCTION check_context_hierarchy_depth();