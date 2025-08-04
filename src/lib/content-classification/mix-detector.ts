/**
 * Permissive Mix Detection System
 * Optimized for user moderation - includes anything that might be a mix
 * Humans will make the final decision on what to keep
 */

export interface MixDetectionResult {
  isMix: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  score: number; // 0-100, higher = more likely to be a mix
}

export interface VideoData {
  title: string;
  description: string;
  duration: number; // seconds
  channelName: string;
  tags?: string[];
}

/**
 * Permissive mix detection function - optimized for user moderation
 * Includes anything that might be a mix, humans will filter later
 */
export function detectMix(video: VideoData): MixDetectionResult {
  const reasons: string[] = [];
  const duration = video.duration;
  const title = video.title.toLowerCase();
  const description = video.description.toLowerCase();
  
  let score = 0;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  
  // Duration scoring - focused on actual mixes
  if (duration >= 45 * 60) { // 45+ minutes
    score += 40;
    reasons.push(`Very long duration (${Math.round(duration / 60)} min)`);
  } else if (duration >= 20 * 60) { // 20-44 minutes  
    score += 30;
    reasons.push(`Long duration (${Math.round(duration / 60)} min)`);
  } else if (duration >= 10 * 60) { // 10-19 minutes
    score += 15;
    reasons.push(`Medium duration (${Math.round(duration / 60)} min)`);
  } else {
    // Under 10 minutes - too short for DJ mixes
    reasons.push(`Too short for mix (${Math.round(duration / 60)} min)`);
  }
  
  // Positive indicators in title/description
  const mixKeywords = [
    'mix', 'set', 'session', 'radio', 'podcast', 'show', 'live',
    'dj', 'playlist', 'compilation', 'collection', 'edition',
    'episode', 'ep.', 'vol.', 'volume', 'part', 'chapter'
  ];
  
  const foundMixKeywords = mixKeywords.filter(keyword => 
    title.includes(keyword) || description.includes(keyword)
  );
  if (foundMixKeywords.length > 0) {
    score += foundMixKeywords.length * 10;
    reasons.push(`Mix keywords: ${foundMixKeywords.slice(0, 3).join(', ')}`);
  }
  
  // Only exclude obviously non-music content
  const hardExclusions = [
    'interview', 'documentary', 'tutorial', 'how to', 'review',
    'unboxing', 'vlog', 'reaction video', 'breakdown', 'analysis',
    'studio tour', 'gear review', 'masterclass', 'lesson', 'course'
  ];
  
  const hasHardExclusion = hardExclusions.some(pattern => title.includes(pattern));
  if (hasHardExclusion) {
    const foundPattern = hardExclusions.find(pattern => title.includes(pattern));
    score -= 30;
    reasons.push(`Likely non-mix: ${foundPattern}`);
  }
  
  // Set confidence levels
  if (score >= 40) {
    confidence = 'high';
  } else if (score >= 15) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  // Focused on actual mixes - require meaningful duration + indicators
  const isMix = score >= 20 && !hasHardExclusion && duration >= 10 * 60;
  
  return {
    isMix,
    confidence,
    reasons,
    score: Math.max(0, Math.min(100, score))
  };
}

/**
 * Helper function for YouTube worker integration
 */
export function isValidMix(
  title: string,
  description: string,
  duration: number,
  channelName: string,
  tags?: string[]
): boolean {
  const result = detectMix({
    title,
    description,
    duration,
    channelName,
    tags
  });
  
  return result.isMix;
}

/**
 * Get detailed mix detection info for logging
 */
export function getMixDetectionDetails(
  title: string,
  description: string,
  duration: number,
  channelName: string,
  tags?: string[]
): MixDetectionResult {
  return detectMix({
    title,
    description,
    duration,
    channelName,
    tags
  });
}