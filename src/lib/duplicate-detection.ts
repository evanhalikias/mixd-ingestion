import type { ExternalIds } from './supabase/types';
import { getServiceClient } from './supabase/service';
import { hasMatchingExternalIds, getAllExternalIds } from './external-ids';

/**
 * Duplicate detection utilities for mixes across platforms
 */

interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingMixId?: string;
  matchedOn?: string; // which external ID matched
}

/**
 * Check if a mix with the given external IDs already exists in the database
 */
export async function checkForDuplicateMix(
  externalIds: ExternalIds
): Promise<DuplicateCheckResult> {
  const supabase = getServiceClient();
  
  // Get all external ID values to search for
  const searchIds = getAllExternalIds(externalIds);
  
  if (searchIds.length === 0) {
    return { isDuplicate: false };
  }
  
  try {
    // Query for mixes that have any matching external IDs
    // We need to check if any of the external ID values exist in the external_ids JSON
    const { data: existingMixes, error } = await supabase
      .from('mixes')
      .select('id, external_ids')
      .not('external_ids', 'is', null);
    
    if (error) {
      console.error('Error checking for duplicate mixes:', error);
      return { isDuplicate: false };
    }
    
    // Check each existing mix for matching external IDs
    for (const mix of existingMixes) {
      if (hasMatchingExternalIds(externalIds, mix.external_ids as ExternalIds)) {
        // Find which external ID matched
        const matchedId = findMatchingExternalId(externalIds, mix.external_ids as ExternalIds);
        
        return {
          isDuplicate: true,
          existingMixId: mix.id,
          matchedOn: matchedId,
        };
      }
    }
    
    return { isDuplicate: false };
  } catch (err) {
    console.error('Error in duplicate detection:', err);
    return { isDuplicate: false };
  }
}

/**
 * Find which specific external ID matched between two external_ids objects
 */
function findMatchingExternalId(ids1: ExternalIds, ids2: ExternalIds): string | undefined {
  const providers: (keyof ExternalIds)[] = ['youtube', 'soundcloud', '1001'];
  
  for (const provider of providers) {
    if (ids1[provider] && ids2[provider] && ids1[provider] === ids2[provider]) {
      return ids1[provider];
    }
  }
  
  return undefined;
}

/**
 * Check for duplicate raw_mixes in staging based on source_url and external_id
 */
export async function checkForDuplicateRawMix(
  sourceUrl: string,
  externalId?: string
): Promise<boolean> {
  const supabase = getServiceClient();
  
  try {
    // First check by source_url (unique constraint)
    const { data: urlMatch, error: urlError } = await supabase
      .from('raw_mixes')
      .select('id')
      .eq('source_url', sourceUrl)
      .maybeSingle();
    
    if (urlError) {
      console.error('Error checking for duplicate raw mix by URL:', urlError);
      return false;
    }
    
    if (urlMatch) {
      return true;
    }
    
    // If we have an external_id, also check for that
    if (externalId) {
      const { data: idMatch, error: idError } = await supabase
        .from('raw_mixes')
        .select('id')
        .eq('external_id', externalId)
        .maybeSingle();
      
      if (idError) {
        console.error('Error checking for duplicate raw mix by external ID:', idError);
        return false;
      }
      
      if (idMatch) {
        return true;
      }
    }
    
    return false;
  } catch (err) {
    console.error('Error in raw mix duplicate detection:', err);
    return false;
  }
}

/**
 * Priority order for sources when merging duplicate data
 * Higher number = higher priority
 */
const SOURCE_PRIORITY = {
  '1001tracklists': 3, // Highest priority for tracklist data
  'soundcloud': 2,     // Medium priority
  'youtube': 1,        // Lowest priority
} as const;

/**
 * Determine which source should take priority when merging duplicate mixes
 */
export function getHigherPrioritySource(
  source1: keyof typeof SOURCE_PRIORITY,
  source2: keyof typeof SOURCE_PRIORITY
): keyof typeof SOURCE_PRIORITY {
  return SOURCE_PRIORITY[source1] >= SOURCE_PRIORITY[source2] ? source1 : source2;
}

/**
 * Merge data from two raw mixes, prioritizing based on source priority
 */
export function mergeRawMixData(
  primary: any,
  secondary: any,
  primarySource: keyof typeof SOURCE_PRIORITY,
  secondarySource: keyof typeof SOURCE_PRIORITY
) {
  const higherPrioritySource = getHigherPrioritySource(primarySource, secondarySource);
  const [higher, lower] = higherPrioritySource === primarySource 
    ? [primary, secondary] 
    : [secondary, primary];
  
  return {
    // Use higher priority source for most fields
    raw_title: higher.raw_title || lower.raw_title,
    raw_description: higher.raw_description || lower.raw_description,
    raw_artist: higher.raw_artist || lower.raw_artist,
    uploaded_at: higher.uploaded_at || lower.uploaded_at,
    duration_seconds: higher.duration_seconds || lower.duration_seconds,
    artwork_url: higher.artwork_url || lower.artwork_url,
    
    // Merge metadata
    raw_metadata: {
      ...lower.raw_metadata,
      ...higher.raw_metadata,
    },
  };
}

/**
 * Merge external IDs from multiple sources, preserving all unique IDs
 */
export function mergeExternalIds(ids1: ExternalIds | null, ids2: ExternalIds | null): ExternalIds {
  return {
    ...ids1,
    ...ids2,
  };
}