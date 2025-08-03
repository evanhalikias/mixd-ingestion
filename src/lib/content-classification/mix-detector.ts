/**
 * Simplified Mix Detection System
 * Uses simple criteria: 20+ minutes and not an interview/documentary
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
 * Simplified mix detection function with smart exclusions
 */
export function detectMix(video: VideoData): MixDetectionResult {
  const reasons: string[] = [];
  const duration = video.duration;
  const title = video.title.toLowerCase();
  
  // Check if video is long enough (20+ minutes)
  const isLongEnough = duration >= 20 * 60; // 20 minutes in seconds
  if (isLongEnough) {
    reasons.push(`Long duration (${Math.round(duration / 60)} min)`);
  }
  
  // Check for exclusion patterns - ONLY in title, not description
  const exclusionPatterns = [
    'interview', 'behind the scenes', 'making of', 'documentary',
    'tutorial', 'how to', 'review', 'unboxing', 'vlog',
    'reaction', 'reaction video', 'first listen', 'breakdown',
    'analysis', 'studio tour', 'gear review', 'tips',
    'masterclass', 'lesson', 'course', 'education', 'chapter two'
  ];
  
  const hasExclusion = exclusionPatterns.some(pattern => title.includes(pattern));
  if (hasExclusion) {
    const foundPattern = exclusionPatterns.find(pattern => title.includes(pattern));
    reasons.push(`Excluded content: ${foundPattern}`);
  }
  
  // Simple logic: is mix if 20+ minutes AND no exclusions in title
  const isMix = isLongEnough && !hasExclusion;
  
  return {
    isMix,
    confidence: isMix ? 'high' : 'low',
    reasons,
    score: isMix ? 100 : 0
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