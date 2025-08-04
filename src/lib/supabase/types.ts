// Auto-generated types will go here
// Run `npm run db:types` to generate from Supabase schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Staging table types
export interface RawMix {
  id: string
  provider: 'youtube' | 'soundcloud' | '1001tracklists'
  source_url: string
  external_id: string | null
  raw_title: string | null
  raw_description: string | null
  raw_artist: string | null
  uploaded_at: string | null
  duration_seconds: number | null
  artwork_url: string | null
  raw_metadata: Json | null
  status: 'pending' | 'processing' | 'canonicalized' | 'failed'
  canonicalized_mix_id: string | null
  error_message: string | null
  created_at: string
  processed_at: string | null
  // New Phase 2 fields for artist discovery and context rules
  discovered_artist_id?: string | null
  discovery_source?: string | null
  suggested_contexts?: Json | null // ContextSuggestion[] from rules engine
}

export interface RawTrack {
  id: string
  raw_mix_id: string
  line_text: string
  position: number | null
  timestamp_seconds: number | null
  raw_artist: string | null
  raw_title: string | null
  source: string | null
  created_at: string
}

export interface IngestionJob {
  id: string
  worker_type: 'soundcloud' | 'youtube' | '1001tracklists' | 'artist-discovery' | 'canonicalization'
  job_payload: Json | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  attempts: number
  max_attempts: number
  last_run: string | null
  next_run: string | null
  error_message: string | null
  requested_by: string | null
  created_at: string
  updated_at: string
}

export interface IngestionLog {
  id: string
  job_id: string | null
  raw_mix_id: string | null
  worker_type: string | null
  message: string
  level: 'debug' | 'info' | 'warn' | 'error'
  metadata: Json | null
  created_at: string
}

export interface SystemHealth {
  id: string
  service_name: string
  last_polled_at: string
  metadata: Json | null
  created_at: string
  updated_at: string
}

// Job payload interfaces
export interface BaseJobPayload {
  worker_type: 'youtube' | 'soundcloud' | '1001tracklists' | 'artist-discovery'
  source_id: string
  mode: 'backfill' | 'rolling'
  batch_size: number
}

export interface StructuredError {
  video_id?: string
  error_type: string
  message: string
  stack?: string
}

// External IDs structure with namespaced keys
export interface ExternalIds {
  youtube?: string  // yt:video_id
  soundcloud?: string  // sc:track_id
  '1001'?: string  // 1001:mix_id
  maps?: string  // gmaps:place_id for venues
  spotify?: string  // spotify:playlist_id
  facebook?: string  // fb:event_id
  instagram?: string  // ig:profile_id
}

// Context and venue type enums (kept in sync with SQL constraints)
export type ContextType = 'festival' | 'radio_show' | 'publisher' | 'series' | 'label' | 'promoter' | 'stage'
export type MixContextRole = 'performed_at' | 'broadcasted_on' | 'published_by'

// New table interfaces
export interface Venue {
  id: string
  name: string
  city: string | null
  country: string | null
  lat: number | null
  lng: number | null
  capacity: number | null
  website: string | null
  external_ids: ExternalIds | null
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface Context {
  id: string
  name: string
  type: ContextType
  parent_id: string | null
  website: string | null
  external_ids: ExternalIds | null
  venue_id: string | null
  is_verified: boolean
  verified_by: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
}

export interface MixContext {
  id: string
  mix_id: string
  context_id: string
  role: MixContextRole
  created_at: string
}

// Artist profile for link discovery
export interface ArtistProfile {
  id: string
  artist_name: string
  normalized_name: string
  soundcloud_url: string | null
  soundcloud_username: string | null
  youtube_channel_url: string | null
  youtube_channel_id: string | null
  spotify_artist_id: string | null
  spotify_url: string | null
  tracklists_1001_url: string | null
  confidence_scores: Json | null
  platform_metadata: Json | null
  verification_status: 'pending' | 'verified' | 'rejected' | 'manual_review'
  discovery_method: 'automatic' | 'manual' | 'hybrid'
  notes: string | null
  manual_overrides: Json | null
  discovered_at: string
  verified_at: string | null
  created_at: string
  updated_at: string
  // New Phase 2 staging workflow fields
  proposed_by?: string | null
  approval_status?: 'pending' | 'approved' | 'rejected'
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  backfill_jobs_created?: boolean
  backfill_job_ids?: Json | null
}

// Platform-specific discovery results
export interface PlatformDiscoveryResult {
  platform: 'soundcloud' | 'youtube' | 'spotify' | '1001tracklists'
  url: string | null
  username?: string | null
  id?: string | null
  confidence: number
  metadata: Record<string, any>
  error?: string
}

// Artist discovery search result
export interface ArtistDiscoveryResult {
  artist_name: string
  platforms: PlatformDiscoveryResult[]
  overall_confidence: number
  discovery_notes: string[]
}

// Context rules engine types (Phase 2)
export interface ContextRule {
  id: string
  rule_name: string
  description: string | null
  rule_type: 'pattern' | 'keyword' | 'channel_mapping' | 'title_pattern' | 'description_pattern'
  scope: 'global' | 'artist' | 'platform'
  scope_value: string | null
  target_context_type: ContextType
  target_context_name: string
  confidence_weight: number
  pattern_config: Json
  created_by: string | null
  requires_approval: boolean
  is_active: boolean
  priority: number
  accuracy_score: number | null
  application_count: number
  correct_applications: number
  created_at: string
  updated_at: string
  last_applied_at: string | null
  version: number
  parent_rule_id: string | null
}

export interface RuleApplication {
  id: string
  rule_id: string
  raw_mix_id: string
  suggested_context_type: ContextType
  suggested_context_name: string
  confidence_score: number
  matched_text: string | null
  reasoning: string | null
  mix_title: string
  mix_description: string | null
  artist_name: string | null
  platform: string | null
  channel_name: string | null
  channel_id: string | null
  moderator_feedback: 'correct' | 'incorrect' | 'partially_correct' | 'spam' | null
  feedback_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  rule_version: number
  applied_automatically: boolean
  requires_approval: boolean
  created_at: string
}

// Database schema type (will be auto-generated)
export interface Database {
  public: {
    Tables: {
      raw_mixes: {
        Row: RawMix
        Insert: Omit<RawMix, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<RawMix, 'id' | 'created_at'>>
      }
      raw_tracks: {
        Row: RawTrack
        Insert: Omit<RawTrack, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<RawTrack, 'id' | 'created_at'>>
      }
      ingestion_jobs: {
        Row: IngestionJob
        Insert: Omit<IngestionJob, 'id' | 'created_at' | 'updated_at' | 'attempts' | 'max_attempts' | 'last_run' | 'next_run' | 'error_message'> & {
          id?: string
          attempts?: number
          max_attempts?: number
          last_run?: string | null
          next_run?: string | null
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<IngestionJob, 'id' | 'created_at'>> & {
          updated_at?: string
        }
      }
      ingestion_logs: {
        Row: IngestionLog
        Insert: Omit<IngestionLog, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<IngestionLog, 'id' | 'created_at'>>
      }
      // Production tables (subset of what exists in mixd-web)
      mixes: {
        Row: {
          id: string
          title: string
          slug: string | null
          description: string | null
          audio_url: string | null
          cover_url: string | null
          duration: number | null
          venue: string | null  // legacy field - migrating to venue_id
          location: string | null  // legacy field - migrating to venue_id  
          event_date: string | null
          published_date: string | null
          created_at: string | null
          created_by: string | null
          external_ids: Json | null
          is_verified: boolean
          verified_by: string | null
          verified_at: string | null
          ingestion_source: string | null
          ingestion_notes: string | null
          raw_mix_id: string | null
          venue_id: string | null  // new relational field
        }
        Insert: any
        Update: any
      }
      tracks: {
        Row: {
          id: string
          title: string
          spotify_track_id: string | null
          label_id: string | null
          is_unreleased: boolean | null
          last_checked_spotify: string | null
          is_verified: boolean | null
          ingestion_source: string | null
        }
        Insert: any
        Update: any
      }
      artists: {
        Row: {
          id: string
          name: string
          spotify_id: string | null
          profile_image_url: string | null
          genres: string[] | null
          is_verified: boolean | null
          ingestion_source: string | null
        }
        Insert: any
        Update: any
      }
      track_aliases: {
        Row: {
          id: string
          track_id: string | null
          alias: string
          source_type: string | null
          mix_id: string | null
          context: string | null
          is_primary: boolean | null
          created_at: string | null
        }
        Insert: any
        Update: any
      }
      mix_tracks: {
        Row: {
          mix_id: string
          track_id: string
          position: number | null
          start_time: number | null
          played_with_previous: boolean | null
        }
        Insert: any
        Update: any
      }
      track_artists: {
        Row: {
          track_id: string
          artist_id: string
          role: string | null
          position: number | null
        }
        Insert: any
        Update: any
      }
      mix_artists: {
        Row: {
          mix_id: string
          artist_id: string
          role: string | null
        }
        Insert: any
        Update: any
      }
      venues: {
        Row: Venue
        Insert: Omit<Venue, 'id' | 'created_at' | 'updated_at' | 'is_verified' | 'verified_by' | 'verified_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
          is_verified?: boolean
          verified_by?: string | null
          verified_at?: string | null
        }
        Update: Partial<Omit<Venue, 'id' | 'created_at'>> & {
          updated_at?: string
        }
      }
      contexts: {
        Row: Context
        Insert: Omit<Context, 'id' | 'created_at' | 'updated_at' | 'is_verified' | 'verified_by' | 'verified_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
          is_verified?: boolean
          verified_by?: string | null
          verified_at?: string | null
        }
        Update: Partial<Omit<Context, 'id' | 'created_at'>> & {
          updated_at?: string
        }
      }
      mix_contexts: {
        Row: MixContext
        Insert: Omit<MixContext, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Omit<MixContext, 'id' | 'created_at'>>
      }
      system_health: {
        Row: SystemHealth
        Insert: Omit<SystemHealth, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<SystemHealth, 'id' | 'created_at'>> & {
          updated_at?: string
        }
      }
      artist_profiles: {
        Row: ArtistProfile
        Insert: Omit<ArtistProfile, 'id' | 'normalized_name' | 'discovered_at' | 'created_at' | 'updated_at'> & {
          id?: string
          normalized_name?: string
          discovered_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<ArtistProfile, 'id' | 'normalized_name' | 'created_at'>> & {
          updated_at?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}