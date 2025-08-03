# Ingestion Worker Updates for Contexts & Venues Schema

This document outlines the plan for updating the ingestion workers to populate the new contexts and venues tables.

**Prerequisites**: ✅ Database schema deployed (2025-08-03) - ready for implementation

## Overview

The ingestion workers need to be enhanced to:
1. **Extract context information** from raw mixes (publishers, events, venues)
2. **Create or lookup venues** from location data
3. **Create or lookup contexts** with proper hierarchies
4. **Link mixes to contexts** with appropriate roles
5. **Handle dual-role entities** (venues that are also publishers)

## Implementation Plan

### Phase 1: Core Infrastructure Updates

#### 1.1 Context Recognition Service (`src/lib/context-recognition/`)

Create a new service to identify contexts from raw mix data:

```typescript
// src/lib/context-recognition/context-detector.ts
export interface ContextDetectionResult {
  venues: VenueCandidate[];
  contexts: ContextCandidate[];
  relationships: MixContextRelationship[];
}

export interface VenueCandidate {
  name: string;
  city?: string;
  country?: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'title' | 'description' | 'metadata';
}

export interface ContextCandidate {
  name: string;
  type: ContextType;
  parent?: string;
  confidence: 'high' | 'medium' | 'low';
  source: 'channel' | 'title' | 'description';
  external_ids?: ExternalIds;
}

export interface MixContextRelationship {
  context_name: string;
  role: MixContextRole;
  confidence: 'high' | 'medium' | 'low';
}
```

#### 1.2 Context Database Service (`src/lib/context-database/`)

Service for CRUD operations on contexts and venues:

```typescript
// src/lib/context-database/context-service.ts
export class ContextDatabaseService {
  // Venue operations
  async findOrCreateVenue(candidate: VenueCandidate): Promise<string>
  async linkVenueToMix(mixId: string, venueId: string): Promise<void>
  
  // Context operations  
  async findOrCreateContext(candidate: ContextCandidate): Promise<string>
  async createMixContextRelationship(mixId: string, contextId: string, role: MixContextRole): Promise<void>
  
  // Hierarchy operations
  async findParentContext(contextName: string, type: ContextType): Promise<string | null>
  async createContextHierarchy(child: string, parent: string): Promise<void>
}
```

### Phase 2: Worker-Specific Updates

#### 2.1 YouTube Worker Updates (`src/workers/youtube-worker.ts`)

**Extract Publisher Context:**
```typescript
// Enhanced mapVideoToRawMix to include context detection
private mapVideoToRawMix(video: any): RawMix {
  // ... existing code ...
  
  // New: Context detection
  const contextDetection = this.detectContexts(video);
  
  return {
    // ... existing fields ...
    raw_metadata: {
      // ... existing metadata ...
      contextDetection: {
        publishers: contextDetection.contexts.filter(c => c.type === 'publisher'),
        venues: contextDetection.venues,
        relationships: contextDetection.relationships
      }
    }
  };
}

private detectContexts(video: any): ContextDetectionResult {
  const contexts: ContextCandidate[] = [];
  const venues: VenueCandidate[] = [];
  const relationships: MixContextRelationship[] = [];
  
  // Check if channel is a known publisher
  const publisherContext = this.detectPublisherFromChannel(video.snippet.channelTitle, video.snippet.channelId);
  if (publisherContext) {
    contexts.push(publisherContext);
    relationships.push({
      context_name: publisherContext.name,
      role: 'published_by',
      confidence: 'high'
    });
  }
  
  // Extract venue from title/description
  const venueInfo = this.extractVenueFromText(video.snippet.title, video.snippet.description);
  if (venueInfo) {
    venues.push(venueInfo);
    relationships.push({
      context_name: venueInfo.name,
      role: 'performed_at', 
      confidence: venueInfo.confidence
    });
  }
  
  return { venues, contexts, relationships };
}
```

**Publisher Detection Patterns:**
```typescript
private detectPublisherFromChannel(channelTitle: string, channelId: string): ContextCandidate | null {
  const knownPublishers = [
    {
      pattern: /^Cercle$/i,
      name: 'Cercle',
      type: 'publisher' as ContextType,
      external_ids: { youtube: `yt:${channelId}` }
    },
    {
      pattern: /^Boiler Room$/i,
      name: 'Boiler Room', 
      type: 'publisher' as ContextType,
      external_ids: { youtube: `yt:${channelId}` }
    },
    {
      pattern: /^HATE$/i,
      name: 'HATE',
      type: 'publisher' as ContextType,
      external_ids: { youtube: `yt:${channelId}` }
    }
  ];
  
  for (const publisher of knownPublishers) {
    if (publisher.pattern.test(channelTitle)) {
      return {
        name: publisher.name,
        type: publisher.type,
        confidence: 'high',
        source: 'channel',
        external_ids: publisher.external_ids
      };
    }
  }
  
  return null;
}
```

#### 2.2 SoundCloud Worker Updates (`src/workers/soundcloud-worker.ts`)

**Enhanced Context Detection:**
```typescript
// Add context detection to mapAPITrackToRawMix
private mapAPITrackToRawMix(track: any): RawMix {
  // ... existing code ...
  
  const contextDetection = this.detectSoundCloudContexts(track);
  
  return {
    // ... existing fields ...
    raw_metadata: {
      // ... existing metadata ...
      contextDetection
    }
  };
}

private detectSoundCloudContexts(track: any): ContextDetectionResult {
  const contexts: ContextCandidate[] = [];
  const venues: VenueCandidate[] = [];
  const relationships: MixContextRelationship[] = [];
  
  // Check if user is a known publisher/label
  const publisherContext = this.detectSoundCloudPublisher(track.user);
  if (publisherContext) {
    contexts.push(publisherContext);
    relationships.push({
      context_name: publisherContext.name,
      role: 'published_by',
      confidence: 'high'
    });
  }
  
  // Extract venue from title/description
  const venueInfo = this.extractVenueFromSoundCloudText(track.title, track.description);
  if (venueInfo) {
    venues.push(venueInfo);
  }
  
  return { venues, contexts, relationships };
}
```

#### 2.3 1001Tracklists Worker Updates (`src/workers/1001tracklists-worker.ts`)

**Event and Venue Extraction:**
```typescript
// Enhanced parseTracklistPage to extract event context
private parseTracklistPage(html: string, url: string): RawMix | null {
  // ... existing code ...
  
  const contextDetection = this.detect1001TracksContexts($, title, description);
  
  return {
    // ... existing fields ...
    raw_metadata: {
      // ... existing metadata ...
      contextDetection
    }
  };
}

private detect1001TracksContexts($: any, title: string, description: string): ContextDetectionResult {
  const contexts: ContextCandidate[] = [];
  const venues: VenueCandidate[] = [];
  const relationships: MixContextRelationship[] = [];
  
  // Extract event/festival information
  const eventInfo = this.extractEventFromTitle(title);
  if (eventInfo) {
    contexts.push(eventInfo);
    relationships.push({
      context_name: eventInfo.name,
      role: 'performed_at',
      confidence: eventInfo.confidence
    });
  }
  
  // Extract venue information
  const venueInfo = this.extractVenueFromPage($);
  if (venueInfo) {
    venues.push(venueInfo);
  }
  
  return { venues, contexts, relationships };
}

private extractEventFromTitle(title: string): ContextCandidate | null {
  // Festival patterns
  const festivalPatterns = [
    { pattern: /Tomorrowland\s+(\d+)/i, name: 'Tomorrowland', type: 'festival' as ContextType },
    { pattern: /Ultra\s+Music\s+Festival\s+(\d+)/i, name: 'Ultra Music Festival', type: 'festival' as ContextType },
    { pattern: /EDC\s+Las\s+Vegas\s+(\d+)/i, name: 'EDC Las Vegas', type: 'festival' as ContextType }
  ];
  
  for (const pattern of festivalPatterns) {
    const match = title.match(pattern.pattern);
    if (match) {
      return {
        name: `${pattern.name} ${match[1]}`,
        type: pattern.type,
        parent: pattern.name,
        confidence: 'high',
        source: 'title'
      };
    }
  }
  
  return null;
}
```

### Phase 3: Canonicalization Updates

#### 3.1 Enhanced Mix Canonicalizer (`src/canonicalizer/canonicalize-mix.ts`)

**Process Context Information:**
```typescript
// Add to createNewMix method
private async createNewMix(
  rawMix: RawMix,
  rawTracks: RawTrack[],
  result: CanonicalizationResult
): Promise<CanonicalizationResult> {
  // ... existing mix creation ...
  
  // New: Process context information
  await this.processContextInformation(mixId, rawMix, result);
  
  // ... rest of existing code ...
}

private async processContextInformation(
  mixId: string,
  rawMix: RawMix,
  result: CanonicalizationResult
): Promise<void> {
  const contextService = new ContextDatabaseService();
  const contextDetection = rawMix.raw_metadata?.contextDetection as ContextDetectionResult;
  
  if (!contextDetection) return;
  
  // Process venues
  for (const venueCandidate of contextDetection.venues) {
    const venueId = await contextService.findOrCreateVenue(venueCandidate);
    await contextService.linkVenueToMix(mixId, venueId);
  }
  
  // Process contexts
  const contextIds: Record<string, string> = {};
  
  for (const contextCandidate of contextDetection.contexts) {
    const contextId = await contextService.findOrCreateContext(contextCandidate);
    contextIds[contextCandidate.name] = contextId;
    
    // Handle parent relationships
    if (contextCandidate.parent) {
      const parentId = contextIds[contextCandidate.parent] || 
                      await contextService.findParentContext(contextCandidate.parent, contextCandidate.type);
      if (parentId) {
        await contextService.createContextHierarchy(contextId, parentId);
      }
    }
  }
  
  // Process mix-context relationships
  for (const relationship of contextDetection.relationships) {
    const contextId = contextIds[relationship.context_name];
    if (contextId) {
      await contextService.createMixContextRelationship(mixId, contextId, relationship.role);
    }
  }
}
```

### Phase 4: Configuration and Patterns

#### 4.1 Context Recognition Patterns (`config/context-patterns.json`)

```json
{
  "publishers": {
    "youtube": {
      "Cercle": {
        "channel_id": "UCPKT_csvP72boVX0XrMtagQ",
        "external_ids": {"youtube": "yt:UCPKT_csvP72boVX0XrMtagQ"}
      },
      "Boiler Room": {
        "channel_id": "UCGBpxWJr9FNOcFYA5GkKrMg",
        "external_ids": {"youtube": "yt:UCGBpxWJr9FNOcFYA5GkKrMg"}
      }
    },
    "soundcloud": {
      "Anjunadeep": {
        "username": "anjunadeep",
        "external_ids": {"soundcloud": "sc:anjunadeep"}
      }
    }
  },
  "venues": {
    "patterns": [
      {"pattern": "Printworks London", "city": "London", "country": "UK"},
      {"pattern": "Warehouse Project", "city": "Manchester", "country": "UK"},
      {"pattern": "Château de Fontainebleau", "city": "Fontainebleau", "country": "France"}
    ]
  },
  "festivals": {
    "patterns": [
      {"pattern": "Tomorrowland (\\d+)", "name": "Tomorrowland", "type": "festival"},
      {"pattern": "Ultra Music Festival (\\d+)", "name": "Ultra Music Festival", "type": "festival"},
      {"pattern": "EDC Las Vegas (\\d+)", "name": "EDC Las Vegas", "type": "festival"}
    ]
  }
}
```

## Implementation Timeline

### Week 1: Core Infrastructure
- [ ] Create context recognition service
- [ ] Create context database service  
- [ ] Set up configuration patterns
- [ ] Write unit tests for services

### Week 2: Worker Updates
- [ ] Update YouTube worker with context detection
- [ ] Update SoundCloud worker with context detection
- [ ] Update 1001Tracklists worker with event extraction
- [ ] Test context detection accuracy

### Week 3: Canonicalization
- [ ] Update canonicalization pipeline
- [ ] Add context processing to mix creation
- [ ] Handle hierarchy creation and parent relationships
- [ ] Test end-to-end flow

### Week 4: Testing & Refinement
- [ ] Integration testing with real data
- [ ] Performance optimization
- [ ] Pattern refinement based on results
- [ ] Documentation and monitoring

## Success Metrics

- **Context Recognition Accuracy**: >85% for known publishers
- **Venue Extraction**: >70% for events with location info
- **Hierarchy Creation**: Proper parent-child relationships
- **Performance**: <500ms additional processing time per mix
- **Data Quality**: Clean, deduplicated context entries

## Monitoring & Maintenance

- **Context Detection Logs**: Track accuracy and missed patterns
- **New Pattern Discovery**: Identify unrecognized publishers/venues
- **Hierarchy Validation**: Monitor depth and relationships
- **Performance Metrics**: Processing time and success rates

## Current Status

✅ **Database Schema**: Live in production (2025-08-03)
- Migration: `supabase/migrations/20250803165900_add_contexts_and_venues.sql`
- Tables: `venues`, `contexts`, `mix_contexts` created
- Column: `mixes.venue_id` added
- All indexes and constraints active

🚧 **Next Phase**: Ready to implement worker updates
- TypeScript types are synchronized
- Documentation complete
- Implementation plan defined