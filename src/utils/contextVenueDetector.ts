import { logger } from '../services/logger';
import type { ExternalIds } from '../lib/supabase/types';

export interface DetectedContext {
  name: string;
  type: 'festival' | 'radio_show' | 'publisher' | 'series' | 'promoter' | 'label' | 'stage';
  role: 'performed_at' | 'broadcasted_on' | 'published_by';
  confidence: number; // 0-1 scale
  reason_codes: string[]; // ['exact_match', 'channel_mapping', 'title_pattern']
  external_ids?: ExternalIds;
}

export interface DetectedVenue {
  name: string;
  city?: string;
  country?: string;
  lat?: number;
  lng?: number;
  confidence: number; // 0-1 scale
  reason_codes: string[]; // ['description_location', 'title_extraction']
  external_ids?: ExternalIds;
}

export interface DetectionResult {
  contexts: DetectedContext[];
  venue?: DetectedVenue;
}

// Known channel mappings for publisher detection
const CHANNEL_PUBLISHER_MAPPINGS: Record<string, {
  name: string;
  type: DetectedContext['type'];
  external_ids?: ExternalIds;
}> = {
  'UCPKT_csvP72boVX0XrMtagQ': {
    name: 'Cercle',
    type: 'publisher',
    external_ids: { youtube: 'yt:UCPKT_csvP72boVX0XrMtagQ', soundcloud: 'sc:cerclemusic' }
  },
  'UCGBAsFXa8TP60B4d2CGet0w': {
    name: 'Lane 8',
    type: 'publisher',
    external_ids: { youtube: 'yt:UCGBAsFXa8TP60B4d2CGet0w', soundcloud: 'sc:lane8music' }
  },
  'UC_CiDDWOQNqhzD-h_8kOXBg': {
    name: 'Tomorrowland',
    type: 'publisher',
    external_ids: { youtube: 'yt:UC_CiDDWOQNqhzD-h_8kOXBg' }
  },
  'UCtUJOcJ7PjeB-QS8jeWm0VA': {
    name: 'Boiler Room',
    type: 'publisher',
    external_ids: { youtube: 'yt:UCtUJOcJ7PjeB-QS8jeWm0VA' }
  }
};

// Festival patterns for exact matching
const FESTIVAL_PATTERNS: Array<{
  pattern: RegExp;
  name: string;
  confidence: number;
}> = [
  { pattern: /tomorrowland\s*(\d{4})?/i, name: 'Tomorrowland', confidence: 0.9 },
  { pattern: /ultra\s*music\s*festival/i, name: 'Ultra Music Festival', confidence: 0.9 },
  { pattern: /edc\s*(las\s*vegas|orlando|uk)?/i, name: 'Electric Daisy Carnival', confidence: 0.9 },
  { pattern: /coachella/i, name: 'Coachella', confidence: 0.9 },
  { pattern: /burning\s*man/i, name: 'Burning Man', confidence: 0.9 },
  { pattern: /defqon\s*1/i, name: 'Defqon.1', confidence: 0.85 },
  { pattern: /awakenings/i, name: 'Awakenings', confidence: 0.85 },
  { pattern: /time\s*warp/i, name: 'Time Warp', confidence: 0.85 }
];

// Radio show patterns
const RADIO_SHOW_PATTERNS: Array<{
  pattern: RegExp;
  name: string;
  parent?: string;
  confidence: number;
}> = [
  { pattern: /essential\s*mix/i, name: 'Essential Mix', parent: 'BBC Radio 1', confidence: 0.95 },
  { pattern: /group\s*therapy/i, name: 'Group Therapy', parent: 'Anjunabeats', confidence: 0.95 },
  { pattern: /diplo\s*&\s*friends/i, name: 'Diplo & Friends', parent: 'BBC Radio 1', confidence: 0.95 },
  { pattern: /odd\s*one\s*out\s*radio/i, name: 'Odd One Out Radio', parent: 'YOTTO', confidence: 0.95 },
  { pattern: /deep\s*house\s*lounge/i, name: 'Deep House Lounge', confidence: 0.8 },
  { pattern: /future\s*sounds/i, name: 'Future Sounds', parent: 'BBC Radio 1', confidence: 0.9 },
  { pattern: /in\s*new\s*music\s*we\s*trust/i, name: 'In New Music We Trust', parent: 'BBC Radio 1', confidence: 0.9 },
  { pattern: /mixmag\s*lab/i, name: 'Mixmag Lab', parent: 'Mixmag', confidence: 0.9 },
  { pattern: /anjunadeep\s*open\s*air/i, name: 'Anjunadeep Open Air', parent: 'Anjunadeep', confidence: 0.9 }
];

// Venue location patterns
const VENUE_LOCATION_PATTERNS: Array<{
  pattern: RegExp;
  name: string;
  city?: string;
  country?: string;
  confidence: number;
}> = [
  { pattern: /printworks\s*(?:london)?/i, name: 'Printworks London', city: 'London', country: 'UK', confidence: 0.9 },
  { pattern: /fabric\s*(?:london)?/i, name: 'Fabric', city: 'London', country: 'UK', confidence: 0.9 },
  { pattern: /pacha\s*(?:ibiza)?/i, name: 'Pacha Ibiza', city: 'Ibiza', country: 'Spain', confidence: 0.9 },
  { pattern: /s[óo]\s*track\s*boa/i, name: 'SÓ TRACK BOA', city: 'São Paulo', country: 'Brazil', confidence: 0.9 },
  { pattern: /electric\s*brixton/i, name: 'Electric Brixton', city: 'London', country: 'UK', confidence: 0.9 },
  { pattern: /berghain/i, name: 'Berghain', city: 'Berlin', country: 'Germany', confidence: 0.9 },
  { pattern: /watergate\s*(?:berlin)?/i, name: 'Watergate', city: 'Berlin', country: 'Germany', confidence: 0.9 },
  { pattern: /output\s*(?:brooklyn)?/i, name: 'Output', city: 'Brooklyn', country: 'USA', confidence: 0.85 },
  { pattern: /ministry\s*of\s*sound/i, name: 'Ministry of Sound', city: 'London', country: 'UK', confidence: 0.9 },
  { pattern: /biosphere\s*(?:museum)?/i, name: 'Biosphere Museum', city: 'Montreal', country: 'Canada', confidence: 0.85 },
  { pattern: /l[öo]yly/i, name: 'Löyly', city: 'Helsinki', country: 'Finland', confidence: 0.9 }
];

/**
 * Normalize text for consistent matching
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract year from text if present
 */
function extractYear(text: string): number | undefined {
  const yearMatch = text.match(/\b(20\d{2})\b/);
  return yearMatch ? parseInt(yearMatch[1]) : undefined;
}

/**
 * Detect contexts (festivals, radio shows, publishers) from video metadata
 */
function detectContexts(
  title: string,
  description: string,
  channelName: string,
  channelId?: string
): DetectedContext[] {
  const contexts: DetectedContext[] = [];
  const combinedText = `${title} ${description} ${channelName}`;
  const normalizedText = normalizeText(combinedText);

  // 1. Channel-based publisher detection (highest confidence)
  if (channelId && CHANNEL_PUBLISHER_MAPPINGS[channelId]) {
    const mapping = CHANNEL_PUBLISHER_MAPPINGS[channelId];
    contexts.push({
      name: mapping.name,
      type: mapping.type,
      role: 'published_by',
      confidence: 0.95,
      reason_codes: ['channel_mapping', 'exact_match'],
      external_ids: mapping.external_ids
    });
  }

  // 2. Festival detection
  for (const festival of FESTIVAL_PATTERNS) {
    if (festival.pattern.test(combinedText)) {
      let contextName = festival.name;
      const year = extractYear(combinedText);
      if (year) {
        contextName = `${festival.name} ${year}`;
      }

      contexts.push({
        name: contextName,
        type: 'festival',
        role: 'performed_at',
        confidence: festival.confidence,
        reason_codes: ['title_pattern', 'exact_match'],
        external_ids: {}
      });
      break; // Only match one festival per video
    }
  }

  // 3. Radio show detection
  for (const radioShow of RADIO_SHOW_PATTERNS) {
    if (radioShow.pattern.test(combinedText)) {
      contexts.push({
        name: radioShow.name,
        type: 'radio_show',
        role: 'broadcasted_on',
        confidence: radioShow.confidence,
        reason_codes: ['title_pattern', 'exact_match'],
        external_ids: {}
      });
      
      // Also add parent publisher if specified
      if (radioShow.parent) {
        contexts.push({
          name: radioShow.parent,
          type: 'publisher',
          role: 'published_by',
          confidence: radioShow.confidence - 0.1,
          reason_codes: ['parent_relationship', 'radio_show_mapping'],
          external_ids: {}
        });
      }
      break; // Only match one radio show per video
    }
  }

  // 4. Generic publisher detection based on channel name
  if (!channelId || !CHANNEL_PUBLISHER_MAPPINGS[channelId]) {
    // If no specific mapping, create generic publisher from channel name
    const normalizedChannelName = channelName.trim();
    if (normalizedChannelName && normalizedChannelName.length > 0) {
      // For artist channels (like "YOTTO"), use the artist name as publisher
      const isArtistChannel = !normalizedChannelName.toLowerCase().includes('music') && 
                             !normalizedChannelName.toLowerCase().includes('records') &&
                             !normalizedChannelName.toLowerCase().includes('official');
      
      contexts.push({
        name: normalizedChannelName,
        type: 'publisher',
        role: 'published_by',
        confidence: isArtistChannel ? 0.8 : 0.7,
        reason_codes: ['channel_name', isArtistChannel ? 'artist_channel' : 'generic_mapping'],
        external_ids: channelId ? { youtube: `yt:${channelId}` } : {}
      });
    }
  }

  return contexts;
}

/**
 * Detect venue from video metadata
 */
function detectVenue(
  title: string,
  description: string,
  channelName: string
): DetectedVenue | undefined {
  const combinedText = `${title} ${description}`;

  // Check for known venue patterns
  for (const venue of VENUE_LOCATION_PATTERNS) {
    if (venue.pattern.test(combinedText)) {
      return {
        name: venue.name,
        city: venue.city,
        country: venue.country,
        confidence: venue.confidence,
        reason_codes: ['venue_pattern', 'exact_match'],
        external_ids: {}
      };
    }
  }

  // Try to extract location from description using common patterns
  const locationPatterns = [
    /(?:live\s+(?:from|at)|recorded\s+(?:at|in))\s+([^,\n\d:]+)/i,
    /(?:@|at)\s+([A-Z][a-zA-Z\s&]+(?:,\s*[A-Z][a-zA-Z\s]+)*)/,
    /location:\s*([^,\n\d:]+)/i
  ];

  for (const pattern of locationPatterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      let locationText = match[1].trim();
      
      // Clean up common noise patterns
      locationText = locationText
        .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, '') // Remove timestamps
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
      
      // Skip if it's too short or contains mostly numbers
      if (locationText.length < 3 || /^\d+/.test(locationText)) {
        continue;
      }
      
      const parts = locationText.split(',').map(p => p.trim());
      
      if (parts.length >= 1 && parts[0].length > 2) {
        return {
          name: parts[0],
          city: parts[1] || undefined,
          country: parts[2] || undefined,
          confidence: 0.6,
          reason_codes: ['description_extraction', 'location_pattern'],
          external_ids: {}
        };
      }
    }
  }

  return undefined;
}

/**
 * Main detection function that analyzes video metadata and returns detected contexts and venues
 */
export async function detectContextsAndVenues(
  title: string,
  description: string,
  channelName: string,
  channelId?: string
): Promise<DetectionResult> {
  try {
    logger.debug('Starting context/venue detection', {
      metadata: {
        title: title.substring(0, 100),
        channelName,
        channelId,
        descriptionLength: description.length
      }
    });

    // Detect contexts
    const contexts = detectContexts(title, description, channelName, channelId);
    
    // Detect venue
    const venue = detectVenue(title, description, channelName);

    // Sort contexts by confidence (highest first)
    contexts.sort((a, b) => b.confidence - a.confidence);

    const result: DetectionResult = {
      contexts,
      venue
    };

    // Log detection results
    logger.info('Context/venue detection completed', {
      metadata: {
        title: title.substring(0, 100),
        contextsFound: contexts.length,
        venueFound: !!venue,
        topContext: contexts[0]?.name,
        topContextConfidence: contexts[0]?.confidence,
        venueConfidence: venue?.confidence
      }
    });

    // Log detailed results for each detection
    contexts.forEach((context, index) => {
      logger.debug(`Context ${index + 1}: ${context.name} (${context.type}, ${context.confidence}, ${context.reason_codes.join(', ')})`);
    });

    if (venue) {
      logger.debug(`Venue: ${venue.name} (${venue.confidence}, ${venue.reason_codes.join(', ')})`);
    }

    return result;

  } catch (error) {
    logger.error('Context/venue detection failed', error as Error, {
      metadata: { title: title.substring(0, 100), channelName, channelId }
    });
    
    // Return empty result on error
    return { contexts: [] };
  }
}

/**
 * Normalize context name for consistent database matching
 */
export function normalizeContextName(name: string): string {
  return normalizeText(name);
}

/**
 * Normalize venue name for consistent database matching
 */
export function normalizeVenueName(name: string): string {
  return normalizeText(name);
}