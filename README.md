# 🎵 mixd-ingestion

Scalable ingestion service for Mixd.fm that automatically fetches DJ mixes from multiple sources, stores them in a staging area, and canonicalizes them into the production database schema.

## Overview

The ingestion service is designed for rapid expansion from dozens to thousands of mixes, covering a majority of the internet's DJ mixes. It features:

- **Automated ingestion** from SoundCloud, YouTube, and 1001Tracklists
- **Separation of concerns** with raw ingestion and canonicalization as separate jobs
- **Conservative fuzzy matching** with configurable similarity thresholds  
- **Duplicate detection** across platforms using external IDs
- **Admin review workflow** via `is_verified` flags
- **Headless browser fallback** for scraping protection bypass

## Architecture

```
Sources (YouTube/SoundCloud/1001TL) → 
Raw Staging (raw_mixes/raw_tracks) → 
Canonicalizer (AI helpers, fuzzy matching) → 
Production (mixes/tracks/mix_tracks)
```

### Data Flow Lifecycle

1. **Ingestion Jobs** → Workers fetch from sources → `raw_mixes`/`raw_tracks`
2. **Duplicate Check** via `external_ids` → Merge or create new
3. **Canonicalization** → Fuzzy match artists/tracks → Production tables
4. **Admin Review** → `is_verified=false` flags for manual review

## Quick Start

### Prerequisites

- Node.js 18+
- TypeScript
- Supabase project with service role access
- API keys for external services

### Installation

```bash
git clone https://github.com/yourusername/mixd-ingestion.git
cd mixd-ingestion
npm install
```

### Environment Setup

1. Copy environment template:
```bash
cp .env.example .env
```

2. Configure required variables:
```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_PROJECT_ID=your-project-id

# External API Keys
YOUTUBE_API_KEY=your-youtube-api-key
SOUNDCLOUD_CLIENT_ID=your-soundcloud-client-id

# Optional Configuration
NODE_ENV=development
LOG_LEVEL=info
```

### Database Setup

1. Run migrations to create all tables:
```bash
supabase db push
```

2. Generate TypeScript types:
```bash
npm run db:types
```

**Note**: Database schema includes contexts & venues tables (deployed 2025-08-03)

### Configuration

Edit `config/sources.json` to configure ingestion sources:

```json
{
  "soundcloud": {
    "enabled": true,
    "artists": ["lane8music", "anjunadeep"],
    "labels": ["enhanced", "armada"],
    "maxResults": 50
  },
  "youtube": {
    "enabled": true,
    "channels": ["UCGBAsFXa8TP60B4d2CGet0w"],
    "maxResults": 50
  },
  "1001tracklists": {
    "enabled": true,
    "searchTerms": ["essential mix", "group therapy"],
    "urls": ["https://www.1001tracklists.com/tracklist/example"],
    "maxResults": 25
  },
  "dateRange": {
    "daysBack": 7
  }
}
```

## Usage

### CLI Commands

**Daily Ingestion:**
```bash
npm run ingest
```

**Canonicalization:**
```bash
npm run canonicalize          # Process pending raw mixes
npm run canonicalize:retry    # Retry failed canonicalizations
npm run canonicalize:stats    # Show statistics
```

**Service Status:**
```bash
npm start status              # Show service status and stats
```

### Programmatic Usage

```typescript
import { SoundCloudWorker } from './src/workers/soundcloud-worker';
import { MixCanonicalizer } from './src/canonicalizer/canonicalize-mix';

// Run SoundCloud ingestion
const worker = new SoundCloudWorker();
const result = await worker.run({
  artists: ['lane8music'],
  maxResults: 10
});

// Canonicalize a raw mix
const canonicalizer = new MixCanonicalizer();
const canonResult = await canonicalizer.canonicalizeMix(rawMixId);
```

## Architecture Details

### Workers

Each worker implements the `IngestionWorker` interface:

- **SoundCloudWorker**: Fetches from artist/label channels, parses descriptions
- **YouTubeWorker**: Uses YouTube Data API, parses comments/descriptions  
- **OneTracklistWorker**: Web scraping with Playwright headless browser fallback

### Fuzzy Matching

Conservative matching thresholds:
- **Track titles**: 90% similarity required
- **Artist names**: 85% similarity required
- Below threshold: create new with `is_verified=false`

### External ID Strategy

Namespaced format for duplicate detection:
```json
{
  "youtube": "yt:video_id",
  "soundcloud": "sc:track_id", 
  "1001": "1001:mix_id"
}
```

### Source Priority

When merging duplicates:
1. **1001Tracklists** (highest priority for tracklist data)
2. **SoundCloud** (medium priority)
3. **YouTube** (lowest priority)

## Database Schema

### Staging Tables

**raw_mixes**: Raw mix data from sources
**raw_tracks**: Raw tracklist data  
**ingestion_jobs**: Job orchestration
**ingestion_logs**: Comprehensive logging

### Production Tables

**mixes**: Canonicalized mix records (includes `venue_id` ✅)
**tracks**: Individual track records
**artists**: Artist profiles
**mix_tracks**: Mix-track relationships with timestamps
**track_aliases**: Track name variations for fuzzy matching

### Context & Venue Tables ✅ NEW

**venues**: Physical locations, stages, and event spaces
**contexts**: Cultural contexts (festivals, radio shows, publishers) with hierarchical support
**mix_contexts**: Many-to-many relationships between mixes and contexts with roles

See `docs/CONTEXTS_VENUES_SCHEMA.md` for detailed documentation.

## Deployment

The service is designed for deployment on platforms supporting long-running workers:

- **Railway** (recommended)
- **Fly.io** 
- **Supabase Functions**
- **NOT Vercel** (timeout limitations)

### Scheduling

- **Ingestion**: Daily via cron job
- **Canonicalization**: Hourly via cron job
- **Error handling**: Exponential backoff with retry logic

## Monitoring

### Logging

All operations logged to:
- **Console**: Structured logging with timestamps
- **Supabase**: `ingestion_logs` table for persistence
- **Error levels**: debug, info, warn, error

### Metrics

```bash
npm run canonicalize:stats
```

Shows:
- Pending/processing/canonicalized/failed counts
- Completion rates
- Error summaries

## Contributing

### Adding New Workers

1. Implement `IngestionWorker` interface
2. Add to worker registry in `run-ingestion.ts`
3. Update configuration schema
4. Add tests and documentation

### Extending Matching Logic

- Modify similarity thresholds in `fuzzy-matcher.ts`
- Add new normalization rules
- Update validation logic

## Troubleshooting

### Common Issues

**Rate Limiting**: Adjust delays in worker configurations
**Scraping Failures**: Check headless browser setup for 1001Tracklists
**Fuzzy Matching**: Review similarity thresholds and normalization
**Database Errors**: Check service role permissions

### Debug Mode

```bash
LOG_LEVEL=debug npm run ingest
```

### Error Recovery

```bash
npm run canonicalize:retry    # Retry failed jobs
npm run canonicalize:stats    # Check error distribution
```

## Context & Venue Detection ✅ NEW

The system now includes intelligent context and venue detection for YouTube videos with confidence scoring and batch processing support.

### Features

- **Automatic Detection**: Identifies festivals, radio shows, publishers, and venues from video metadata
- **Confidence Scoring**: 0-1 scale with reason codes for QA analysis
- **Backfill vs Rolling Modes**: Different processing strategies for historical vs new content
- **Batch Processing**: Safe processing of large channel backlogs
- **Deduplication**: Normalized name matching prevents duplicate contexts/venues

### Configuration

Enhanced YouTube configuration with per-channel modes:

```json
{
  "youtube": {
    "enabled": true,
    "channels": [
      {
        "channelId": "UCPKT_csvP72boVX0XrMtagQ",
        "mode": "rolling",
        "name": "Cercle"
      },
      {
        "channelId": "UC_CiDDWOQNqhzD-h_8kOXBg",
        "mode": "backfill", 
        "name": "Tomorrowland"
      }
    ],
    "contextDetection": {
      "enabled": true,
      "autoVerifyThreshold": 0.9,
      "logAllDetections": true
    }
  }
}
```

### Usage Examples

**Rolling Mode** (daily new content):
```bash
npm run ingest  # Processes rolling channels with auto-verification
```

**Backfill Mode** (historical content):
```bash
npm run backfill:youtube UCPKT_csvP72boVX0XrMtagQ 500  # Cercle channel, 500 videos
npm run backfill:youtube UC_CiDDWOQNqhzD-h_8kOXBg     # Tomorrowland channel, default limit
```

### Quality Assurance

**Review Pending Detections**:
```sql
-- Check backfill results waiting for review
SELECT * FROM raw_mixes WHERE status='pending' LIMIT 20;

-- View detected contexts with confidence scores  
SELECT m.title, c.name, mc.role, 
       (m.raw_metadata->>'contextVenueDetection')::jsonb
FROM mixes m 
JOIN mix_contexts mc ON m.id=mc.mix_id 
JOIN contexts c ON mc.context_id=c.id 
ORDER BY m.created_at DESC LIMIT 20;
```

**Monitor Detection Performance**:
```sql
-- Context detection success rates by channel
SELECT 
  raw_metadata->>'channelTitle' as channel,
  COUNT(*) as total_videos,
  COUNT(CASE WHEN jsonb_array_length((raw_metadata->>'contextVenueDetection')::jsonb->'contexts') > 0 THEN 1 END) as videos_with_contexts
FROM raw_mixes 
WHERE provider = 'youtube'
GROUP BY raw_metadata->>'channelTitle'
ORDER BY total_videos DESC;
```

### Detection Patterns

The system recognizes:

- **Festivals**: Tomorrowland, Ultra Music Festival, EDC, Coachella
- **Radio Shows**: Essential Mix, Group Therapy, Diplo & Friends  
- **Publishers**: Channel-based mapping (Cercle, Boiler Room, etc.)
- **Venues**: Printworks London, Fabric, Berghain, Ministry of Sound

See `docs/QA_QUERIES.md` for comprehensive monitoring queries.

### Mode Comparison

| Mode | Use Case | Verification | Processing |
|------|----------|-------------|------------|
| **Rolling** | New daily content | Auto-verify confidence ≥0.9 | Real-time ingestion |
| **Backfill** | Historical content | Manual review required | Batch processing |

## License

ISC

## Support

For issues and feature requests, please use the GitHub issue tracker.