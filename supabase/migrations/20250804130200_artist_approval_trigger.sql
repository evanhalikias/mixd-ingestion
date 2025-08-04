-- Migration: Artist approval trigger for automatic backfill job creation
-- When an artist is approved, automatically creates platform-specific ingestion jobs

-- Function to create backfill jobs when artist is approved
CREATE OR REPLACE FUNCTION trigger_artist_backfill_jobs()
RETURNS TRIGGER AS $$
DECLARE
  platform_record JSONB;
  job_ids UUID[] := ARRAY[]::UUID[];
  new_job_id UUID;
  platform_data JSONB;
BEGIN
  -- Only trigger on approval status change to 'approved'
  IF NEW.approval_status = 'approved' AND 
     (OLD.approval_status IS NULL OR OLD.approval_status != 'approved' OR OLD.backfill_jobs_created = FALSE) THEN
    
    -- Get platform data from platform_metadata
    platform_data := COALESCE(NEW.platform_metadata, '{}'::jsonb);
    
    -- Log the approval action
    RAISE NOTICE 'Creating backfill jobs for approved artist: %', NEW.artist_name;
    
    -- Extract platforms from platform_metadata->platforms array
    IF platform_data ? 'platforms' THEN
      FOR platform_record IN 
        SELECT jsonb_array_elements(platform_data->'platforms')
      LOOP
        -- Only create jobs for platforms with confidence > 0.4 and valid URLs
        IF (platform_record->>'confidence')::NUMERIC > 0.4 AND 
           platform_record->>'url' IS NOT NULL THEN
          
          -- Create platform-specific jobs based on platform type
          CASE platform_record->>'platform'
            WHEN 'youtube' THEN
              -- YouTube jobs need channel ID
              IF platform_record->>'id' IS NOT NULL THEN
                INSERT INTO ingestion_jobs (worker_type, job_payload, requested_by, status)
                VALUES (
                  'youtube',
                  jsonb_build_object(
                    'worker_type', 'youtube',
                    'source_id', platform_record->>'id',
                    'mode', 'backfill',
                    'batch_size', 50,
                    'discovered_artist_id', NEW.id::text
                  ),
                  NEW.approved_by,
                  'pending'
                )
                RETURNING id INTO new_job_id;
                
                job_ids := array_append(job_ids, new_job_id);
                RAISE NOTICE 'Created YouTube job % for channel %', new_job_id, platform_record->>'id';
              END IF;
              
            WHEN 'soundcloud' THEN
              -- SoundCloud jobs need username
              IF platform_record->>'username' IS NOT NULL THEN
                INSERT INTO ingestion_jobs (worker_type, job_payload, requested_by, status)
                VALUES (
                  'soundcloud', 
                  jsonb_build_object(
                    'worker_type', 'soundcloud',
                    'source_id', platform_record->>'username',
                    'mode', 'backfill',
                    'batch_size', 50,
                    'discovered_artist_id', NEW.id::text
                  ),
                  NEW.approved_by,
                  'pending'
                )
                RETURNING id INTO new_job_id;
                
                job_ids := array_append(job_ids, new_job_id);
                RAISE NOTICE 'Created SoundCloud job % for username %', new_job_id, platform_record->>'username';
              END IF;
              
            WHEN '1001tracklists' THEN
              -- 1001Tracklists jobs can use URL directly
              INSERT INTO ingestion_jobs (worker_type, job_payload, requested_by, status)
              VALUES (
                '1001tracklists',
                jsonb_build_object(
                  'worker_type', '1001tracklists',
                  'source_id', platform_record->>'url',
                  'mode', 'backfill',
                  'batch_size', 20,
                  'discovered_artist_id', NEW.id::text
                ),
                NEW.approved_by,
                'pending'
              )
              RETURNING id INTO new_job_id;
              
              job_ids := array_append(job_ids, new_job_id);
              RAISE NOTICE 'Created 1001Tracklists job % for URL %', new_job_id, platform_record->>'url';
              
          END CASE;
        END IF;
      END LOOP;
    END IF;
    
    -- Update the artist profile with job tracking info
    UPDATE artist_profiles 
    SET 
      backfill_jobs_created = TRUE,
      backfill_job_ids = to_jsonb(job_ids),
      updated_at = NOW()
    WHERE id = NEW.id;
    
    RAISE NOTICE 'Created % backfill jobs for artist %', array_length(job_ids, 1), NEW.artist_name;
    
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS artist_approval_trigger ON artist_profiles;
CREATE TRIGGER artist_approval_trigger
  AFTER UPDATE OF approval_status ON artist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_artist_backfill_jobs();

-- Add comment for documentation
COMMENT ON FUNCTION trigger_artist_backfill_jobs() IS 'Automatically creates platform-specific backfill jobs when an artist is approved by a moderator';
COMMENT ON TRIGGER artist_approval_trigger ON artist_profiles IS 'Triggers automatic job creation when artist approval_status changes to approved';