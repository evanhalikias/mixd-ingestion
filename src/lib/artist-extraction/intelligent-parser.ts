/**
 * Intelligent artist extraction for YouTube content
 * Handles channel-hosted content (Cercle, Boiler Room, etc.) vs artist channels
 */

export interface ArtistExtractionResult {
  performingArtists: string[];
  hostChannel?: string;
  confidence: 'high' | 'medium' | 'low';
  extractionMethod: string;
}

export interface ChannelMapping {
  channelName: string;
  channelId?: string;
  type: 'host' | 'artist' | 'label';
  extractionRules: {
    titlePatterns: RegExp[];
    descriptionPatterns: RegExp[];
    useChannelAsArtist: boolean;
  };
}

// Known hosting channels that feature other artists
const HOST_CHANNELS: ChannelMapping[] = [
  {
    channelName: 'Cercle',
    type: 'host',
    extractionRules: {
      titlePatterns: [
        /^([^@]+?)\s+(?:live|performance)\s+at\s+Cercle/i,
        /^([^-]+?)\s*-?\s*Cercle/i,
        /Cercle:\s*([^-]+)/i
      ],
      descriptionPatterns: [
        /^([^@\n]+?)\s+performing\s+at\s+Cercle/i,
        /^([^@\n]+?)\s+live\s+at\s+Cercle/i
      ],
      useChannelAsArtist: false
    }
  },
  {
    channelName: 'Boiler Room',
    type: 'host',
    extractionRules: {
      titlePatterns: [
        /^([^|]+?)\s*\|\s*Boiler\s+Room/i,
        /^([^@]+?)\s+Boiler\s+Room/i
      ],
      descriptionPatterns: [
        /^([^@\n]+?)\s+in\s+the\s+Boiler\s+Room/i
      ],
      useChannelAsArtist: false
    }
  },
  {
    channelName: 'HATE',
    type: 'host',
    extractionRules: {
      titlePatterns: [
        /^([^@]+?)\s+@\s+HATE/i,
        /HATE:\s*([^-]+)/i
      ],
      descriptionPatterns: [],
      useChannelAsArtist: false
    }
  },
  {
    channelName: 'Mixmag',
    type: 'host',
    extractionRules: {
      titlePatterns: [
        /^([^-]+?)\s*-?\s*.*?Mixmag/i,
        /Mixmag:\s*([^-]+)/i
      ],
      descriptionPatterns: [],
      useChannelAsArtist: false
    }
  }
];

// Known artist channels (use channel name as artist)
const ARTIST_CHANNELS: ChannelMapping[] = [
  {
    channelName: 'Lane 8',
    type: 'artist',
    extractionRules: {
      titlePatterns: [],
      descriptionPatterns: [],
      useChannelAsArtist: true
    }
  },
  {
    channelName: 'Anjunadeep',
    type: 'label',
    extractionRules: {
      titlePatterns: [
        /^([^-]+?)\s*-/i
      ],
      descriptionPatterns: [],
      useChannelAsArtist: false
    }
  }
];

/**
 * Main artist extraction function
 */
export function extractArtistsFromVideo(
  title: string,
  channelName: string,
  description: string = '',
  channelId?: string
): ArtistExtractionResult {
  // Check if this is a known host channel
  const hostChannel = HOST_CHANNELS.find(
    mapping => isChannelMatch(mapping, channelName, channelId)
  );
  
  if (hostChannel) {
    return extractFromHostChannel(title, description, hostChannel);
  }
  
  // Check if this is a known artist channel
  const artistChannel = ARTIST_CHANNELS.find(
    mapping => isChannelMatch(mapping, channelName, channelId)
  );
  
  if (artistChannel) {
    return extractFromArtistChannel(title, description, artistChannel);
  }
  
  // Unknown channel - use heuristics
  return extractWithHeuristics(title, channelName, description);
}

/**
 * Extract artist from host channel content
 */
function extractFromHostChannel(
  title: string,
  description: string,
  hostChannel: ChannelMapping
): ArtistExtractionResult {
  // Try title patterns first
  for (const pattern of hostChannel.extractionRules.titlePatterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const artist = cleanArtistName(match[1]);
      if (artist) {
        return {
          performingArtists: [artist],
          hostChannel: hostChannel.channelName,
          confidence: 'high',
          extractionMethod: `title_pattern: ${pattern.toString()}`
        };
      }
    }
  }
  
  // Try description patterns
  for (const pattern of hostChannel.extractionRules.descriptionPatterns) {
    const match = description.match(pattern);
    if (match && match[1]) {
      const artist = cleanArtistName(match[1]);
      if (artist) {
        return {
          performingArtists: [artist],
          hostChannel: hostChannel.channelName,
          confidence: 'medium',
          extractionMethod: `description_pattern: ${pattern.toString()}`
        };
      }
    }
  }
  
  // Fallback: try to extract from title using generic patterns
  const fallbackArtist = extractWithGenericPatterns(title);
  if (fallbackArtist) {
    return {
      performingArtists: [fallbackArtist],
      hostChannel: hostChannel.channelName,
      confidence: 'low',
      extractionMethod: 'generic_title_parsing'
    };
  }
  
  return {
    performingArtists: [],
    hostChannel: hostChannel.channelName,
    confidence: 'low',
    extractionMethod: 'host_channel_fallback'
  };
}

/**
 * Extract artist from artist/label channel content
 */
function extractFromArtistChannel(
  title: string,
  description: string,
  artistChannel: ChannelMapping
): ArtistExtractionResult {
  if (artistChannel.extractionRules.useChannelAsArtist) {
    return {
      performingArtists: [artistChannel.channelName],
      confidence: 'high',
      extractionMethod: 'channel_is_artist'
    };
  }
  
  // Try to extract from title for label channels
  for (const pattern of artistChannel.extractionRules.titlePatterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const artist = cleanArtistName(match[1]);
      if (artist) {
        return {
          performingArtists: [artist],
          confidence: 'high',
          extractionMethod: `label_title_pattern: ${pattern.toString()}`
        };
      }
    }
  }
  
  return {
    performingArtists: [artistChannel.channelName],
    confidence: 'medium',
    extractionMethod: 'channel_fallback'
  };
}

/**
 * Extract using heuristics for unknown channels
 */
function extractWithHeuristics(
  title: string,
  channelName: string,
  description: string
): ArtistExtractionResult {
  // Check if title contains common hosting keywords
  const hostingKeywords = ['live at', 'boiler room', 'cercle', '@', 'presents', 'in the mix'];
  const hasHostingKeywords = hostingKeywords.some(keyword => 
    title.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (hasHostingKeywords) {
    // Try to extract artist from title
    const artist = extractWithGenericPatterns(title);
    if (artist && artist !== channelName) {
      return {
        performingArtists: [artist],
        hostChannel: channelName,
        confidence: 'medium',
        extractionMethod: 'heuristic_hosting_detected'
      };
    }
  }
  
  // Default: assume channel is the artist
  return {
    performingArtists: [channelName],
    confidence: 'low',
    extractionMethod: 'channel_default'
  };
}

/**
 * Generic patterns for extracting artist names from titles
 */
function extractWithGenericPatterns(title: string): string | null {
  const patterns = [
    // "Artist live at Venue"
    /^([^@]+?)\s+live\s+at\s+/i,
    // "Artist @ Venue"
    /^([^@]+?)\s+@\s+/i,
    // "Artist - Title"
    /^([^-]+?)\s*-\s*[^-]+$/i,
    // "Artist | Venue"
    /^([^|]+?)\s*\|\s*/i,
    // "Artist presents"
    /^([^:]+?)\s+presents/i,
    // "Artist:"
    /^([^:]+?):\s*/i
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const artist = cleanArtistName(match[1]);
      if (artist && artist.length > 2) {
        return artist;
      }
    }
  }
  
  return null;
}

/**
 * Clean and normalize artist names
 */
function cleanArtistName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    // Remove common prefixes/suffixes
    .replace(/^(dj|artist)\s+/i, '')
    .replace(/\s+(live|dj|set)$/i, '')
    // Remove extra punctuation
    .replace(/['"()]/g, '')
    .trim();
}

/**
 * Check if a channel matches a mapping
 */
function isChannelMatch(
  mapping: ChannelMapping,
  channelName: string,
  channelId?: string
): boolean {
  if (mapping.channelId && channelId && mapping.channelId === channelId) {
    return true;
  }
  
  return mapping.channelName.toLowerCase() === channelName.toLowerCase();
}

/**
 * Extract multiple artists from a string (handles "feat.", "&", etc.)
 */
export function extractMultipleArtists(artistString: string): string[] {
  const separators = [
    / feat\.?\s+/gi,
    / ft\.?\s+/gi,
    / featuring\s+/gi,
    / x\s+/gi,
    / &\s+/gi,
    / and\s+/gi,
    / vs\.?\s+/gi,
    / versus\s+/gi,
    /,\s+/g
  ];
  
  let artists = [artistString];
  
  for (const separator of separators) {
    artists = artists.flatMap(artist => artist.split(separator));
  }
  
  return artists
    .map(artist => cleanArtistName(artist))
    .filter(artist => artist.length > 1)
    .slice(0, 5); // Limit to 5 artists max
}