import * as fuzz from 'fuzzball';
import { logger } from '../../services/logger';

/**
 * Fuzzy matching utilities with configurable similarity thresholds
 * Implements the conservative matching strategy from the project spec
 */

// Similarity thresholds as specified in Final Notes
export const SIMILARITY_THRESHOLDS = {
  TRACK_TITLE: 0.9,   // Track titles: trigram similarity ≥ 0.9 → match
  ARTIST_NAME: 0.85,  // Artist names: trigram similarity ≥ 0.85 → match
} as const;

export interface MatchResult<T = any> {
  match: T | null;
  score: number;
  isHighConfidence: boolean;
  alternatives: Array<{ item: T; score: number }>;
}

export interface MatchCandidate {
  id: string;
  text: string;
  metadata?: any;
}

/**
 * Normalize text for better matching
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Remove common DJ mix artifacts
    .replace(/\[.*?\]/g, '') // Remove [brackets]
    .replace(/\(.*?\)/g, '') // Remove (parentheses)
    .replace(/\bfeat\.?\b/gi, 'featuring') // Normalize featuring
    .replace(/\bft\.?\b/gi, 'featuring') // Normalize ft
    .replace(/\bvs\.?\b/gi, 'versus') // Normalize vs
    .replace(/\b&\b/g, 'and') // Normalize &
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the best match for a track title
 */
export function findBestTrackMatch(
  query: string,
  candidates: MatchCandidate[],
  threshold = SIMILARITY_THRESHOLDS.TRACK_TITLE
): MatchResult<MatchCandidate> {
  return findBestMatch(query, candidates, threshold, 'track');
}

/**
 * Find the best match for an artist name
 */
export function findBestArtistMatch(
  query: string,
  candidates: MatchCandidate[],
  threshold = SIMILARITY_THRESHOLDS.ARTIST_NAME
): MatchResult<MatchCandidate> {
  return findBestMatch(query, candidates, threshold, 'artist');
}

/**
 * Generic fuzzy matching function
 */
export function findBestMatch(
  query: string,
  candidates: MatchCandidate[],
  threshold: number,
  entityType: string = 'entity'
): MatchResult<MatchCandidate> {
  if (!query || candidates.length === 0) {
    return {
      match: null,
      score: 0,
      isHighConfidence: false,
      alternatives: [],
    };
  }
  
  const normalizedQuery = normalizeText(query);
  
  // Calculate similarity scores for all candidates
  const scores = candidates.map(candidate => {
    const normalizedCandidate = normalizeText(candidate.text);
    
    // Use token sort ratio which handles word order differences well
    const score = fuzz.token_sort_ratio(normalizedQuery, normalizedCandidate) / 100;
    
    return {
      candidate,
      score,
    };
  });
  
  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  
  const bestScore = scores[0]?.score || 0;
  const isHighConfidence = bestScore >= threshold;
  
  // Get top alternatives (up to 3)
  const alternatives = scores
    .slice(1, 4)
    .map(({ candidate, score }) => ({ item: candidate, score }));
  
  const result: MatchResult<MatchCandidate> = {
    match: isHighConfidence ? scores[0].candidate : null,
    score: bestScore,
    isHighConfidence,
    alternatives,
  };
  
  // Log ambiguous matches for review
  if (bestScore > 0.6 && bestScore < threshold) {
    logger.warn(
      `Ambiguous ${entityType} match: "${query}" → "${scores[0].candidate.text}" (score: ${bestScore.toFixed(3)}, threshold: ${threshold})`,
      {
        metadata: {
          query: normalizedQuery,
          bestMatch: normalizeText(scores[0].candidate.text),
          score: bestScore,
          threshold,
          alternatives: alternatives.map(alt => ({
            text: alt.item.text,
            score: alt.score,
          })),
        },
      }
    );
  }
  
  return result;
}

/**
 * Batch matching function for processing multiple queries efficiently
 */
export function batchMatch<T extends MatchCandidate>(
  queries: string[],
  candidates: T[],
  threshold: number,
  entityType: string = 'entity'
): Map<string, MatchResult<T>> {
  const results = new Map<string, MatchResult<T>>();
  
  for (const query of queries) {
    const result = findBestMatch(query, candidates, threshold, entityType);
    // Cast the result to the correct type since T extends MatchCandidate
    results.set(query, result as MatchResult<T>);
  }
  
  return results;
}

/**
 * Check if two strings are likely the same entity (using higher threshold)
 */
export function areLikelySame(
  text1: string,
  text2: string,
  entityType: 'track' | 'artist' = 'track'
): boolean {
  const threshold = entityType === 'track' 
    ? SIMILARITY_THRESHOLDS.TRACK_TITLE 
    : SIMILARITY_THRESHOLDS.ARTIST_NAME;
  
  const normalized1 = normalizeText(text1);
  const normalized2 = normalizeText(text2);
  
  const score = fuzz.token_sort_ratio(normalized1, normalized2) / 100;
  
  return score >= threshold;
}

/**
 * Extract artist variations from track text
 * Handles cases like "Artist feat. Other Artist - Title"
 */
export function extractArtistVariations(artistText: string): string[] {
  const variations = new Set<string>();
  
  // Add the original
  variations.add(artistText.trim());
  
  // Split by common separators
  const separators = [
    / feat\.? /gi,
    / ft\.? /gi,
    / featuring /gi,
    / vs\.? /gi,
    / versus /gi,
    / & /g,
    / and /gi,
    / x /gi,
    / with /gi,
  ];
  
  let current = artistText;
  
  for (const separator of separators) {
    const parts = current.split(separator);
    if (parts.length > 1) {
      // Add each part as a potential artist
      parts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed.length > 2) {
          variations.add(trimmed);
        }
      });
      
      // Use first part for next iteration
      current = parts[0].trim();
    }
  }
  
  return Array.from(variations);
}

/**
 * Generate search aliases for a track/artist name
 * Creates variations that might be used in different contexts
 */
export function generateSearchAliases(name: string): string[] {
  const aliases = new Set<string>();
  
  // Add original
  aliases.add(name);
  
  // Add normalized version
  aliases.add(normalizeText(name));
  
  // Remove articles
  const withoutArticles = name.replace(/\b(the|a|an)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (withoutArticles !== name) {
    aliases.add(withoutArticles);
  }
  
  // Remove common suffixes
  const suffixPatterns = [
    / (remix|edit|rework|remaster|remastered|version|mix)$/gi,
    / \(.*?(remix|edit|rework|remaster|version|mix).*?\)$/gi,
  ];
  
  for (const pattern of suffixPatterns) {
    const withoutSuffix = name.replace(pattern, '').trim();
    if (withoutSuffix !== name && withoutSuffix.length > 3) {
      aliases.add(withoutSuffix);
    }
  }
  
  return Array.from(aliases).filter(alias => alias.length > 0);
}

/**
 * Calculate match confidence level
 */
export function getMatchConfidenceLevel(score: number, threshold: number): 'high' | 'medium' | 'low' {
  if (score >= threshold) return 'high';
  if (score >= threshold - 0.1) return 'medium';
  return 'low';
}

/**
 * Validate that a match makes sense contextually
 */
export function validateMatch(
  query: string,
  match: MatchCandidate,
  score: number
): { isValid: boolean; reason?: string } {
  // Check for obvious mismatches
  const queryWords = normalizeText(query).split(' ');
  const matchWords = normalizeText(match.text).split(' ');
  
  // If the query is much longer/shorter than the match, be more strict
  const lengthRatio = Math.max(queryWords.length, matchWords.length) / 
                     Math.min(queryWords.length, matchWords.length);
  
  if (lengthRatio > 3 && score < 0.95) {
    return {
      isValid: false,
      reason: `Length mismatch: "${query}" vs "${match.text}" (ratio: ${lengthRatio.toFixed(2)})`,
    };
  }
  
  // Check for completely different first words (artist names)
  if (queryWords.length > 0 && matchWords.length > 0) {
    const firstWordSimilarity = fuzz.ratio(queryWords[0], matchWords[0]) / 100;
    if (firstWordSimilarity < 0.6 && score < 0.9) {
      return {
        isValid: false,
        reason: `First word mismatch: "${queryWords[0]}" vs "${matchWords[0]}"`,
      };
    }
  }
  
  return { isValid: true };
}