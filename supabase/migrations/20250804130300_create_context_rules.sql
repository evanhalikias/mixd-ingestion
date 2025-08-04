-- Migration: Create context_rules table for Phase 2 context detection
-- Rules engine for identifying festivals, radio shows, publishers, and other contexts in mix titles/descriptions

-- Create context_rules table with future-ready schema
CREATE TABLE context_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Rule identification
  rule_name TEXT NOT NULL,
  description TEXT,
  
  -- Rule type and scoping
  rule_type TEXT NOT NULL CHECK (rule_type IN ('pattern', 'keyword', 'channel_mapping', 'title_pattern', 'description_pattern')),
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'artist', 'platform')),
  scope_value TEXT, -- artist_id, platform name, etc. when scope != 'global'
  
  -- Context detection configuration
  target_context_type TEXT NOT NULL CHECK (target_context_type IN ('festival', 'radio_show', 'publisher', 'series', 'label', 'promoter', 'stage')),
  target_context_name TEXT NOT NULL,
  confidence_weight DECIMAL(3,2) DEFAULT 0.75 CHECK (confidence_weight BETWEEN 0.0 AND 1.0),
  
  -- Rule definition
  pattern_config JSONB NOT NULL, -- Flexible config for different rule types
  /*
    Examples:
    - pattern: {"regex": "Ultra Music Festival", "flags": "i"}
    - keyword: {"keywords": ["Ultra", "UMF"], "require_all": false}
    - channel_mapping: {"youtube_channel_ids": ["UC123"], "soundcloud_usernames": ["ultra"]}
    - title_pattern: {"contains": ["live at"], "followed_by": ["Ultra"]}
  */
  
  -- Rule metadata and management
  created_by UUID REFERENCES auth.users(id),
  requires_approval BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 100, -- Lower numbers = higher priority
  
  -- Learning and improvement
  accuracy_score DECIMAL(4,3), -- Calculated from moderator feedback
  application_count INTEGER DEFAULT 0,
  correct_applications INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_applied_at TIMESTAMPTZ,
  
  -- Versioning for rule evolution
  version INTEGER DEFAULT 1,
  parent_rule_id UUID REFERENCES context_rules(id), -- For rule iterations
  
  UNIQUE(rule_name, version)
);

-- Indexes for performance
CREATE INDEX idx_context_rules_active ON context_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_context_rules_type_scope ON context_rules(rule_type, scope);
CREATE INDEX idx_context_rules_context_type ON context_rules(target_context_type);
CREATE INDEX idx_context_rules_priority ON context_rules(priority) WHERE is_active = TRUE;
CREATE INDEX idx_context_rules_scope_value ON context_rules(scope_value) WHERE scope != 'global';
CREATE INDEX idx_context_rules_accuracy ON context_rules(accuracy_score DESC) WHERE accuracy_score IS NOT NULL;

-- GIN index for pattern_config queries
CREATE INDEX idx_context_rules_pattern_config ON context_rules USING GIN (pattern_config);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_context_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER context_rules_updated_at_trigger
  BEFORE UPDATE ON context_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_context_rules_updated_at();

-- Add comments for documentation
COMMENT ON TABLE context_rules IS 'Rules engine for automatic context detection in mix titles and descriptions';
COMMENT ON COLUMN context_rules.rule_type IS 'Type of detection rule: pattern, keyword, channel_mapping, title_pattern, description_pattern';
COMMENT ON COLUMN context_rules.scope IS 'Rule application scope: global (all mixes), artist (specific artist), platform (specific platform)';
COMMENT ON COLUMN context_rules.scope_value IS 'When scope is not global, this contains the artist_id or platform identifier';
COMMENT ON COLUMN context_rules.target_context_type IS 'Type of context this rule detects (festival, radio_show, publisher, etc)';
COMMENT ON COLUMN context_rules.target_context_name IS 'Name of the specific context entity (e.g., "Ultra Music Festival")';
COMMENT ON COLUMN context_rules.pattern_config IS 'JSON configuration for rule matching logic - structure varies by rule_type';
COMMENT ON COLUMN context_rules.confidence_weight IS 'Base confidence score (0.0-1.0) when this rule matches';
COMMENT ON COLUMN context_rules.requires_approval IS 'Whether matches from this rule require moderator approval before applying';
COMMENT ON COLUMN context_rules.accuracy_score IS 'Calculated accuracy based on moderator feedback (correct_applications/application_count)';
COMMENT ON COLUMN context_rules.parent_rule_id IS 'Links to previous version of rule for evolution tracking';

-- Insert some basic rules to get started
INSERT INTO context_rules (rule_name, description, rule_type, target_context_type, target_context_name, pattern_config, confidence_weight, requires_approval) VALUES
-- Festival rules
('Ultra Music Festival Pattern', 'Detects Ultra Music Festival mentions', 'pattern', 'festival', 'Ultra Music Festival', 
 '{"regex": "ultra\\s+(music\\s+)?festival|umf\\s+\\d{4}|\\bulf\\b", "flags": "i"}', 0.90, false),

('Tomorrowland Pattern', 'Detects Tomorrowland festival mentions', 'pattern', 'festival', 'Tomorrowland', 
 '{"regex": "tomorrowland|tml\\s+\\d{4}", "flags": "i"}', 0.95, false),

('EDC Pattern', 'Detects Electric Daisy Carnival mentions', 'pattern', 'festival', 'Electric Daisy Carnival', 
 '{"regex": "electric\\s+daisy\\s+carnival|\\bedc\\b", "flags": "i"}', 0.85, false),

-- Radio show rules  
('BBC Radio 1 Pattern', 'Detects BBC Radio 1 shows', 'pattern', 'radio_show', 'BBC Radio 1', 
 '{"regex": "bbc\\s+radio\\s+1|radio\\s*1\\s+essential", "flags": "i"}', 0.90, false),

('Sirius XM Pattern', 'Detects Sirius XM radio shows', 'pattern', 'radio_show', 'Sirius XM', 
 '{"regex": "sirius\\s*xm|siriusxm", "flags": "i"}', 0.85, false),

-- Publisher rules
('Monstercat Pattern', 'Detects Monstercat label releases', 'pattern', 'publisher', 'Monstercat', 
 '{"regex": "monstercat|monsterkittens", "flags": "i"}', 0.95, false),

('Spinnin Records Pattern', 'Detects Spinnin Records releases', 'pattern', 'publisher', 'Spinnin Records', 
 '{"regex": "spinnin\\s+records|spinnin''", "flags": "i"}', 0.90, false),

-- Generic live set patterns
('Live At Pattern', 'Detects live performance contexts', 'title_pattern', 'festival', 'Unknown Festival', 
 '{"contains": ["live at", "recorded at", "@ "], "extract_venue": true}', 0.60, true);

-- Create a function to get active rules for a given scope
CREATE OR REPLACE FUNCTION get_active_context_rules(
  p_scope TEXT DEFAULT 'global',
  p_scope_value TEXT DEFAULT NULL,
  p_context_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  rule_name TEXT,
  rule_type TEXT,
  target_context_type TEXT,
  target_context_name TEXT,
  pattern_config JSONB,
  confidence_weight DECIMAL,
  requires_approval BOOLEAN,
  priority INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cr.id,
    cr.rule_name,
    cr.rule_type,
    cr.target_context_type,
    cr.target_context_name,
    cr.pattern_config,
    cr.confidence_weight,
    cr.requires_approval,
    cr.priority
  FROM context_rules cr
  WHERE cr.is_active = TRUE
    AND (cr.scope = 'global' OR (cr.scope = p_scope AND cr.scope_value = p_scope_value))
    AND (p_context_type IS NULL OR cr.target_context_type = p_context_type)
  ORDER BY cr.priority ASC, cr.confidence_weight DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_context_rules IS 'Retrieves active context rules for a given scope, ordered by priority and confidence';