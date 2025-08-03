import type { ExternalIds } from './supabase/types';

export type { ExternalIds };

/**
 * Utilities for managing external IDs across platforms
 * Format: {"youtube": "yt:video_id", "soundcloud": "sc:track_id", "1001": "1001:mix_id"}
 */

export type Provider = 'youtube' | 'soundcloud' | '1001tracklists';

/**
 * Create a namespaced external ID for a provider
 */
export function createExternalId(provider: Provider, id: string): string {
  const prefix = getProviderPrefix(provider);
  return `${prefix}:${id}`;
}

/**
 * Parse an external ID to get provider and ID
 */
export function parseExternalId(externalId: string): { provider: Provider; id: string } | null {
  const parts = externalId.split(':');
  if (parts.length !== 2) return null;
  
  const [prefix, id] = parts;
  const provider = getPrefixProvider(prefix);
  
  if (!provider) return null;
  
  return { provider, id };
}

/**
 * Get the prefix for a provider
 */
function getProviderPrefix(provider: Provider): string {
  switch (provider) {
    case 'youtube':
      return 'yt';
    case 'soundcloud':
      return 'sc';
    case '1001tracklists':
      return '1001';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Get the provider from a prefix
 */
function getPrefixProvider(prefix: string): Provider | null {
  switch (prefix) {
    case 'yt':
      return 'youtube';
    case 'sc':
      return 'soundcloud';
    case '1001':
      return '1001tracklists';
    default:
      return null;
  }
}

/**
 * Add an external ID to existing external_ids JSON
 */
export function addExternalId(
  existingIds: ExternalIds | null,
  provider: Provider,
  id: string
): ExternalIds {
  const current = existingIds || {};
  const key = provider === '1001tracklists' ? '1001' : provider;
  const externalId = createExternalId(provider, id);
  
  return {
    ...current,
    [key]: externalId,
  };
}

/**
 * Get external ID for a specific provider
 */
export function getExternalId(externalIds: ExternalIds | null, provider: Provider): string | null {
  if (!externalIds) return null;
  
  const key = provider === '1001tracklists' ? '1001' : provider;
  return externalIds[key] || null;
}

/**
 * Check if two external_ids objects have any matching IDs (indicates duplicate)
 */
export function hasMatchingExternalIds(ids1: ExternalIds | null, ids2: ExternalIds | null): boolean {
  if (!ids1 || !ids2) return false;
  
  const providers: (keyof ExternalIds)[] = ['youtube', 'soundcloud', '1001'];
  
  for (const provider of providers) {
    if (ids1[provider] && ids2[provider] && ids1[provider] === ids2[provider]) {
      return true;
    }
  }
  
  return false;
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

/**
 * Extract all external IDs from an external_ids object as an array
 */
export function getAllExternalIds(externalIds: ExternalIds | null): string[] {
  if (!externalIds) return [];
  
  return Object.values(externalIds).filter(Boolean);
}

/**
 * Create a query condition for finding duplicates by external IDs
 * Returns an array of external ID values to query against
 */
export function getExternalIdsForQuery(provider: Provider, id: string): string[] {
  return [createExternalId(provider, id)];
}