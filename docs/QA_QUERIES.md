# Quality Assurance Queries for Context/Venue Detection

This document contains SQL queries for validating and analyzing the context/venue detection system.

## Raw Mix Analysis

### 1. Check Pending Raw Mixes (Backfill Review)
```sql
-- View pending raw mixes that need review
SELECT 
  id,
  raw_title,
  provider,
  uploaded_at,
  status,
  (raw_metadata->>'contextVenueDetection')::jsonb->'contexts' as detected_contexts,
  (raw_metadata->>'contextVenueDetection')::jsonb->'venue' as detected_venue
FROM raw_mixes 
WHERE status = 'pending' 
ORDER BY uploaded_at DESC 
LIMIT 20;
```

### 2. Context Detection Success Rate
```sql
-- Analyze context detection success rates
SELECT 
  provider,
  COUNT(*) as total_mixes,
  COUNT(CASE WHEN jsonb_array_length((raw_metadata->>'contextVenueDetection')::jsonb->'contexts') > 0 THEN 1 END) as mixes_with_contexts,
  COUNT(CASE WHEN (raw_metadata->>'contextVenueDetection')::jsonb->'venue' IS NOT NULL THEN 1 END) as mixes_with_venues,
  ROUND(
    COUNT(CASE WHEN jsonb_array_length((raw_metadata->>'contextVenueDetection')::jsonb->'contexts') > 0 THEN 1 END) * 100.0 / COUNT(*), 
    2
  ) as context_detection_rate_percent
FROM raw_mixes 
WHERE raw_metadata->>'contextVenueDetection' IS NOT NULL
GROUP BY provider
ORDER BY total_mixes DESC;
```

### 3. Confidence Score Distribution
```sql
-- Analyze confidence score distribution for detected contexts
WITH context_confidences AS (
  SELECT 
    raw_title,
    jsonb_array_elements((raw_metadata->>'contextVenueDetection')::jsonb->'contexts') as context
  FROM raw_mixes 
  WHERE raw_metadata->>'contextVenueDetection' IS NOT NULL
)
SELECT 
  CASE 
    WHEN (context->>'confidence')::numeric >= 0.9 THEN '0.9-1.0 (High)'
    WHEN (context->>'confidence')::numeric >= 0.8 THEN '0.8-0.9 (Good)'
    WHEN (context->>'confidence')::numeric >= 0.7 THEN '0.7-0.8 (Medium)'
    ELSE '< 0.7 (Low)'
  END as confidence_range,
  COUNT(*) as detection_count,
  ROUND(AVG((context->>'confidence')::numeric), 3) as avg_confidence
FROM context_confidences
GROUP BY 
  CASE 
    WHEN (context->>'confidence')::numeric >= 0.9 THEN '0.9-1.0 (High)'
    WHEN (context->>'confidence')::numeric >= 0.8 THEN '0.8-0.9 (Good)'
    WHEN (context->>'confidence')::numeric >= 0.7 THEN '0.7-0.8 (Medium)'
    ELSE '< 0.7 (Low)'
  END
ORDER BY avg_confidence DESC;
```

### 4. Reason Code Analysis
```sql
-- Analyze detection reason codes for pattern insights
WITH context_reasons AS (
  SELECT 
    raw_title,
    context->>'name' as context_name,
    context->>'type' as context_type,
    (context->>'confidence')::numeric as confidence,
    jsonb_array_elements_text(context->'reason_codes') as reason_code
  FROM raw_mixes,
  jsonb_array_elements((raw_metadata->>'contextVenueDetection')::jsonb->'contexts') as context
  WHERE raw_metadata->>'contextVenueDetection' IS NOT NULL
)
SELECT 
  reason_code,
  context_type,
  COUNT(*) as usage_count,
  ROUND(AVG(confidence), 3) as avg_confidence,
  ROUND(MIN(confidence), 3) as min_confidence,
  ROUND(MAX(confidence), 3) as max_confidence
FROM context_reasons
GROUP BY reason_code, context_type
ORDER BY usage_count DESC, avg_confidence DESC;
```

## Context and Venue Tables

### 5. Context Statistics by Type
```sql
-- Overview of contexts by type
SELECT 
  type,
  COUNT(*) as total_contexts,
  COUNT(CASE WHEN parent_id IS NOT NULL THEN 1 END) as hierarchical_contexts,
  COUNT(CASE WHEN venue_id IS NOT NULL THEN 1 END) as dual_role_contexts,
  COUNT(CASE WHEN external_ids != '{}' THEN 1 END) as contexts_with_external_ids
FROM contexts
GROUP BY type
ORDER BY total_contexts DESC;
```

### 6. Venue Geographic Distribution
```sql
-- Venue distribution by location
SELECT 
  country,
  city,
  COUNT(*) as venue_count,
  COUNT(CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 1 END) as venues_with_coordinates
FROM venues
WHERE city IS NOT NULL
GROUP BY country, city
ORDER BY venue_count DESC
LIMIT 20;
```

### 7. Most Detected Contexts
```sql
-- Top contexts by detection frequency
WITH detected_context_names AS (
  SELECT 
    context->>'name' as context_name,
    context->>'type' as context_type,
    (context->>'confidence')::numeric as confidence
  FROM raw_mixes,
  jsonb_array_elements((raw_metadata->>'contextVenueDetection')::jsonb->'contexts') as context
  WHERE raw_metadata->>'contextVenueDetection' IS NOT NULL
)
SELECT 
  context_name,
  context_type,
  COUNT(*) as detection_count,
  ROUND(AVG(confidence), 3) as avg_confidence,
  EXISTS(SELECT 1 FROM contexts c WHERE c.name = context_name AND c.type = context_type) as exists_in_db
FROM detected_context_names
GROUP BY context_name, context_type
ORDER BY detection_count DESC
LIMIT 25;
```

## Mix-Context Relationships

### 8. Context Usage in Production
```sql
-- Mix-context relationships with confidence analysis
SELECT 
  c.name as context_name,
  c.type as context_type,
  mc.role,
  COUNT(mc.mix_id) as mix_count,
  COUNT(CASE WHEN m.is_verified = true THEN 1 END) as verified_mixes,
  COUNT(CASE WHEN m.is_verified = false THEN 1 END) as unverified_mixes
FROM contexts c
JOIN mix_contexts mc ON c.id = mc.context_id
LEFT JOIN mixes m ON mc.mix_id = m.id
GROUP BY c.name, c.type, mc.role
ORDER BY mix_count DESC
LIMIT 20;
```

### 9. Venue Usage Analysis
```sql
-- Venue usage in mixes
SELECT 
  v.name as venue_name,
  v.city,
  v.country,
  COUNT(m.id) as mix_count,
  COUNT(CASE WHEN m.is_verified = true THEN 1 END) as verified_mixes
FROM venues v
LEFT JOIN mixes m ON v.id = m.venue_id
GROUP BY v.id, v.name, v.city, v.country
HAVING COUNT(m.id) > 0
ORDER BY mix_count DESC
LIMIT 20;
```

## Detection Quality Analysis

### 10. Channel-Specific Detection Performance
```sql
-- Performance by YouTube channel
WITH channel_stats AS (
  SELECT 
    raw_metadata->>'channelId' as channel_id,
    raw_metadata->>'channelTitle' as channel_name,
    COUNT(*) as total_videos,
    COUNT(CASE WHEN jsonb_array_length((raw_metadata->>'contextVenueDetection')::jsonb->'contexts') > 0 THEN 1 END) as videos_with_contexts,
    COUNT(CASE WHEN (raw_metadata->>'contextVenueDetection')::jsonb->'venue' IS NOT NULL THEN 1 END) as videos_with_venues
  FROM raw_mixes 
  WHERE provider = 'youtube' 
    AND raw_metadata->>'contextVenueDetection' IS NOT NULL
  GROUP BY raw_metadata->>'channelId', raw_metadata->>'channelTitle'
)
SELECT 
  channel_name,
  channel_id,
  total_videos,
  videos_with_contexts,
  videos_with_venues,
  ROUND(videos_with_contexts * 100.0 / total_videos, 1) as context_detection_rate,
  ROUND(videos_with_venues * 100.0 / total_videos, 1) as venue_detection_rate
FROM channel_stats
WHERE total_videos >= 5
ORDER BY total_videos DESC;
```

### 11. High Confidence Detections Ready for Auto-Verification
```sql
-- Contexts with high confidence that could be auto-verified
WITH high_confidence_contexts AS (
  SELECT 
    rm.id as raw_mix_id,
    rm.raw_title,
    context->>'name' as context_name,
    context->>'type' as context_type,
    context->>'role' as context_role,
    (context->>'confidence')::numeric as confidence,
    context->'reason_codes' as reason_codes
  FROM raw_mixes rm,
  jsonb_array_elements((raw_metadata->>'contextVenueDetection')::jsonb->'contexts') as context
  WHERE rm.status = 'pending'
    AND (context->>'confidence')::numeric >= 0.9
)
SELECT 
  context_name,
  context_type,
  context_role,
  COUNT(*) as detection_count,
  ROUND(AVG(confidence), 3) as avg_confidence,
  array_agg(DISTINCT reason_codes) as common_reason_codes,
  array_agg(raw_title ORDER BY confidence DESC) FILTER (WHERE confidence >= 0.95) as sample_titles
FROM high_confidence_contexts
GROUP BY context_name, context_type, context_role
HAVING COUNT(*) >= 3
ORDER BY detection_count DESC, avg_confidence DESC;
```

### 12. Potential Duplicates in Context Detection
```sql
-- Find potential duplicate contexts that might need deduplication
WITH normalized_contexts AS (
  SELECT 
    id,
    name,
    type,
    LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9\s]', '', 'g')) as normalized_name
  FROM contexts
)
SELECT 
  type,
  normalized_name,
  array_agg(name) as variant_names,
  array_agg(id) as context_ids,
  COUNT(*) as duplicate_count
FROM normalized_contexts
GROUP BY type, normalized_name
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, type;
```

## Ingestion Logs Analysis

### 13. Context/Venue Detection Logging
```sql
-- Analysis of context/venue detection logs
SELECT 
  DATE(created_at) as detection_date,
  COUNT(*) as total_detections,
  COUNT(CASE WHEN metadata->'contexts_detected' != '[]' THEN 1 END) as successful_context_detections,
  COUNT(CASE WHEN metadata->'venue_detected' IS NOT NULL THEN 1 END) as successful_venue_detections,
  COUNT(CASE WHEN metadata->'processing_results'->>'contexts_created' != '0' THEN 1 END) as new_contexts_created,
  COUNT(CASE WHEN metadata->'processing_results'->>'venue_created' = 'true' THEN 1 END) as new_venues_created
FROM ingestion_logs
WHERE worker_type = 'youtube_backfill'
  AND message = 'Context/venue detection results'
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY detection_date DESC;
```

### 14. Error Analysis
```sql
-- Context/venue processing errors
SELECT 
  DATE(created_at) as error_date,
  message,
  COUNT(*) as error_count,
  array_agg(DISTINCT metadata->>'rawMixId') FILTER (WHERE metadata->>'rawMixId' IS NOT NULL) as affected_raw_mix_ids
FROM ingestion_logs
WHERE level = 'error'
  AND (message ILIKE '%context%' OR message ILIKE '%venue%')
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at), message
ORDER BY error_date DESC, error_count DESC;
```

## Performance Monitoring

### 15. Context/Venue Creation Rate
```sql
-- Monitor context and venue creation over time
SELECT 
  DATE(created_at) as creation_date,
  'contexts' as entity_type,
  COUNT(*) as created_count
FROM contexts
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)

UNION ALL

SELECT 
  DATE(created_at) as creation_date,
  'venues' as entity_type,
  COUNT(*) as created_count
FROM venues
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)

ORDER BY creation_date DESC, entity_type;
```

### 16. System Health Check
```sql
-- Overall system health for context/venue detection
SELECT 
  'Total Contexts' as metric,
  COUNT(*)::text as value
FROM contexts

UNION ALL

SELECT 
  'Total Venues' as metric,
  COUNT(*)::text as value
FROM venues

UNION ALL

SELECT 
  'Total Mix-Context Relationships' as metric,
  COUNT(*)::text as value
FROM mix_contexts

UNION ALL

SELECT 
  'Raw Mixes with Context Detection' as metric,
  COUNT(*)::text as value
FROM raw_mixes
WHERE raw_metadata->>'contextVenueDetection' IS NOT NULL

UNION ALL

SELECT 
  'Pending Raw Mixes' as metric,
  COUNT(*)::text as value
FROM raw_mixes
WHERE status = 'pending'

UNION ALL

SELECT 
  'High Confidence Detections (≥0.9)' as metric,
  COUNT(*)::text as value
FROM raw_mixes rm,
jsonb_array_elements((raw_metadata->>'contextVenueDetection')::jsonb->'contexts') as context
WHERE (context->>'confidence')::numeric >= 0.9;
```

## Verification Queries ✅ NEW

### 17. Unverified Records Needing Review
```sql
-- Find unverified mixes, contexts, and venues that need human review
SELECT 'mixes' as table_name, COUNT(*) as unverified_count
FROM mixes WHERE is_verified = false

UNION ALL

SELECT 'contexts' as table_name, COUNT(*) as unverified_count  
FROM contexts WHERE is_verified = false

UNION ALL

SELECT 'venues' as table_name, COUNT(*) as unverified_count
FROM venues WHERE is_verified = false

ORDER BY unverified_count DESC;
```

### 18. Recently Verified Records
```sql
-- Show recently verified records with verifier info
SELECT 
  'mix' as record_type,
  title as name,
  is_verified,
  verified_by,
  verified_at
FROM mixes 
WHERE verified_at IS NOT NULL 
  AND verified_at >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

SELECT 
  'context' as record_type,
  name,
  is_verified,
  verified_by,
  verified_at
FROM contexts 
WHERE verified_at IS NOT NULL 
  AND verified_at >= CURRENT_DATE - INTERVAL '7 days'

UNION ALL

SELECT 
  'venue' as record_type,
  name,
  is_verified,
  verified_by,
  verified_at  
FROM venues 
WHERE verified_at IS NOT NULL 
  AND verified_at >= CURRENT_DATE - INTERVAL '7 days'

ORDER BY verified_at DESC;
```

### 19. Verification Progress by Table
```sql
-- Track verification progress across all tables
WITH verification_stats AS (
  SELECT 
    'mixes' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_records,
    COUNT(CASE WHEN is_verified = false THEN 1 END) as unverified_records
  FROM mixes
  
  UNION ALL
  
  SELECT 
    'contexts' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_records,
    COUNT(CASE WHEN is_verified = false THEN 1 END) as unverified_records
  FROM contexts
  
  UNION ALL
  
  SELECT 
    'venues' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_records,
    COUNT(CASE WHEN is_verified = false THEN 1 END) as unverified_records
  FROM venues
)
SELECT 
  table_name,
  total_records,
  verified_records,
  unverified_records,
  ROUND(verified_records * 100.0 / total_records, 1) as verification_percentage
FROM verification_stats
ORDER BY total_records DESC;
```

## Usage Instructions

1. **Daily Monitoring**: Run queries 1, 8, 13, and 16 for daily health checks
2. **Quality Analysis**: Use queries 2, 3, 4, and 10 to analyze detection quality
3. **Backfill Review**: Run query 11 to identify high-confidence detections ready for auto-verification
4. **Verification Workflow**: Use queries 17-19 to manage human verification process
5. **Deduplication**: Use query 12 to find and clean up duplicate contexts
6. **Performance Tuning**: Analyze queries 4 and 10 to adjust confidence thresholds and improve detection patterns

## Expected Results for Initial Testing

- **Context Detection Rate**: Should be >70% for known channels (Cercle, Tomorrowland)
- **High Confidence Detections**: >50% of detections should have confidence ≥0.8
- **Channel Mapping**: 95%+ accuracy for known channel publisher mappings
- **Festival Detection**: >90% accuracy for major festivals in video titles
- **Venue Detection**: 30-50% success rate (lower expected due to limited description parsing)