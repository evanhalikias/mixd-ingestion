-- Migration: Create rule_applications table for tracking context rule usage and feedback
-- Logs every rule application for learning and accuracy measurement

-- Create rule_applications table for tracking rule usage
CREATE TABLE rule_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Rule and application tracking
  rule_id UUID NOT NULL REFERENCES context_rules(id) ON DELETE CASCADE,
  raw_mix_id UUID NOT NULL REFERENCES raw_mixes(id) ON DELETE CASCADE,
  
  -- Rule application results
  suggested_context_type TEXT NOT NULL CHECK (suggested_context_type IN ('festival', 'radio_show', 'publisher', 'series', 'label', 'promoter', 'stage')),
  suggested_context_name TEXT NOT NULL,
  confidence_score DECIMAL(4,3) NOT NULL CHECK (confidence_score BETWEEN 0.0 AND 1.0),
  matched_text TEXT,
  reasoning TEXT,
  
  -- Original mix content for analysis
  mix_title TEXT NOT NULL,
  mix_description TEXT,
  artist_name TEXT,
  platform TEXT,
  channel_name TEXT,
  channel_id TEXT,
  
  -- Moderator feedback for learning
  moderator_feedback TEXT, -- 'correct', 'incorrect', 'partially_correct', 'spam'
  feedback_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  
  -- Application metadata
  rule_version INTEGER DEFAULT 1,
  applied_automatically BOOLEAN DEFAULT TRUE,
  requires_approval BOOLEAN DEFAULT TRUE,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one application per rule per mix
  UNIQUE(rule_id, raw_mix_id)
);

-- Indexes for performance and analysis
CREATE INDEX idx_rule_applications_rule_id ON rule_applications(rule_id);
CREATE INDEX idx_rule_applications_raw_mix_id ON rule_applications(raw_mix_id);
CREATE INDEX idx_rule_applications_feedback ON rule_applications(moderator_feedback) WHERE moderator_feedback IS NOT NULL;
CREATE INDEX idx_rule_applications_pending_review ON rule_applications(requires_approval, reviewed_at) WHERE requires_approval = TRUE AND reviewed_at IS NULL;
CREATE INDEX idx_rule_applications_created_at ON rule_applications(created_at);
CREATE INDEX idx_rule_applications_confidence ON rule_applications(confidence_score DESC);

-- Compound indexes for rule analysis
CREATE INDEX idx_rule_applications_rule_feedback ON rule_applications(rule_id, moderator_feedback);
CREATE INDEX idx_rule_applications_context_type ON rule_applications(suggested_context_type);

-- Function to update rule accuracy when feedback is provided
CREATE OR REPLACE FUNCTION update_rule_accuracy_on_feedback()
RETURNS TRIGGER AS $$
DECLARE
  total_apps INTEGER;
  correct_apps INTEGER;
  new_accuracy DECIMAL(4,3);
BEGIN
  -- Only update when feedback is added/changed
  IF NEW.moderator_feedback IS NOT NULL AND 
     (OLD.moderator_feedback IS NULL OR OLD.moderator_feedback != NEW.moderator_feedback) THEN
    
    -- Count total applications for this rule
    SELECT COUNT(*) INTO total_apps
    FROM rule_applications 
    WHERE rule_id = NEW.rule_id AND moderator_feedback IS NOT NULL;
    
    -- Count correct applications
    SELECT COUNT(*) INTO correct_apps
    FROM rule_applications 
    WHERE rule_id = NEW.rule_id 
      AND moderator_feedback IN ('correct', 'partially_correct');
    
    -- Calculate new accuracy
    new_accuracy := CASE 
      WHEN total_apps > 0 THEN correct_apps::DECIMAL / total_apps::DECIMAL
      ELSE NULL 
    END;
    
    -- Update the rule's accuracy score
    UPDATE context_rules 
    SET 
      accuracy_score = new_accuracy,
      correct_applications = correct_apps,
      application_count = total_apps,
      updated_at = NOW()
    WHERE id = NEW.rule_id;
    
    RAISE NOTICE 'Updated rule % accuracy: %/% = %', 
      NEW.rule_id, correct_apps, total_apps, new_accuracy;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update rule accuracy on feedback
CREATE TRIGGER rule_applications_feedback_trigger
  AFTER INSERT OR UPDATE OF moderator_feedback ON rule_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_rule_accuracy_on_feedback();

-- View for rule performance analysis
CREATE OR REPLACE VIEW rule_performance_analysis AS
SELECT 
  cr.id as rule_id,
  cr.rule_name,
  cr.rule_type,
  cr.target_context_type,
  cr.target_context_name,
  cr.confidence_weight,
  cr.accuracy_score,
  
  -- Application statistics
  COUNT(ra.id) as total_applications,
  COUNT(ra.moderator_feedback) as reviewed_applications,
  COUNT(CASE WHEN ra.moderator_feedback = 'correct' THEN 1 END) as correct_applications,
  COUNT(CASE WHEN ra.moderator_feedback = 'incorrect' THEN 1 END) as incorrect_applications,
  COUNT(CASE WHEN ra.moderator_feedback = 'partially_correct' THEN 1 END) as partially_correct_applications,
  COUNT(CASE WHEN ra.moderator_feedback = 'spam' THEN 1 END) as spam_applications,
  
  -- Confidence statistics
  ROUND(AVG(ra.confidence_score), 3) as avg_confidence,
  ROUND(MIN(ra.confidence_score), 3) as min_confidence,
  ROUND(MAX(ra.confidence_score), 3) as max_confidence,
  
  -- Time statistics
  cr.last_applied_at,
  MIN(ra.created_at) as first_application,
  MAX(ra.created_at) as latest_application
  
FROM context_rules cr
LEFT JOIN rule_applications ra ON cr.id = ra.rule_id
GROUP BY cr.id, cr.rule_name, cr.rule_type, cr.target_context_type, 
         cr.target_context_name, cr.confidence_weight, cr.accuracy_score, cr.last_applied_at
ORDER BY total_applications DESC, cr.rule_name;

-- View for pending moderator reviews
CREATE OR REPLACE VIEW pending_context_reviews AS
SELECT 
  ra.id as application_id,
  ra.rule_id,
  cr.rule_name,
  ra.raw_mix_id,
  ra.suggested_context_type,
  ra.suggested_context_name,
  ra.confidence_score,
  ra.matched_text,
  ra.reasoning,
  ra.mix_title,
  ra.mix_description,
  ra.artist_name,
  ra.platform,
  ra.created_at as suggested_at,
  cr.requires_approval
FROM rule_applications ra
JOIN context_rules cr ON ra.rule_id = cr.id
WHERE ra.requires_approval = TRUE 
  AND ra.reviewed_at IS NULL
ORDER BY ra.confidence_score DESC, ra.created_at ASC;

-- Add comments for documentation
COMMENT ON TABLE rule_applications IS 'Logs every context rule application for learning and accuracy measurement';
COMMENT ON COLUMN rule_applications.confidence_score IS 'Calculated confidence score when rule was applied (0.0-1.0)';
COMMENT ON COLUMN rule_applications.moderator_feedback IS 'Human feedback: correct, incorrect, partially_correct, spam';
COMMENT ON COLUMN rule_applications.matched_text IS 'The specific text that triggered the rule match';
COMMENT ON COLUMN rule_applications.reasoning IS 'Explanation of why the rule matched';
COMMENT ON COLUMN rule_applications.rule_version IS 'Version of the rule when it was applied (for rule evolution tracking)';

COMMENT ON VIEW rule_performance_analysis IS 'Comprehensive performance statistics for each context rule';
COMMENT ON VIEW pending_context_reviews IS 'Context suggestions awaiting moderator review';
COMMENT ON FUNCTION update_rule_accuracy_on_feedback IS 'Updates rule accuracy scores based on moderator feedback';