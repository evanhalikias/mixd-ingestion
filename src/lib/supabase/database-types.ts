export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      artist_profiles: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          artist_name: string
          backfill_job_ids: Json | null
          backfill_jobs_created: boolean | null
          confidence_scores: Json | null
          created_at: string | null
          discovered_at: string | null
          discovery_method: string | null
          id: string
          manual_overrides: Json | null
          normalized_name: string
          notes: string | null
          platform_metadata: Json | null
          proposed_by: string | null
          rejection_reason: string | null
          soundcloud_url: string | null
          soundcloud_username: string | null
          spotify_artist_id: string | null
          spotify_url: string | null
          tracklists_1001_url: string | null
          updated_at: string | null
          verification_status: string | null
          verified_at: string | null
          youtube_channel_id: string | null
          youtube_channel_url: string | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          artist_name: string
          backfill_job_ids?: Json | null
          backfill_jobs_created?: boolean | null
          confidence_scores?: Json | null
          created_at?: string | null
          discovered_at?: string | null
          discovery_method?: string | null
          id?: string
          manual_overrides?: Json | null
          normalized_name: string
          notes?: string | null
          platform_metadata?: Json | null
          proposed_by?: string | null
          rejection_reason?: string | null
          soundcloud_url?: string | null
          soundcloud_username?: string | null
          spotify_artist_id?: string | null
          spotify_url?: string | null
          tracklists_1001_url?: string | null
          updated_at?: string | null
          verification_status?: string | null
          verified_at?: string | null
          youtube_channel_id?: string | null
          youtube_channel_url?: string | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          artist_name?: string
          backfill_job_ids?: Json | null
          backfill_jobs_created?: boolean | null
          confidence_scores?: Json | null
          created_at?: string | null
          discovered_at?: string | null
          discovery_method?: string | null
          id?: string
          manual_overrides?: Json | null
          normalized_name?: string
          notes?: string | null
          platform_metadata?: Json | null
          proposed_by?: string | null
          rejection_reason?: string | null
          soundcloud_url?: string | null
          soundcloud_username?: string | null
          spotify_artist_id?: string | null
          spotify_url?: string | null
          tracklists_1001_url?: string | null
          updated_at?: string | null
          verification_status?: string | null
          verified_at?: string | null
          youtube_channel_id?: string | null
          youtube_channel_url?: string | null
        }
        Relationships: []
      }
      artists: {
        Row: {
          genres: string[] | null
          id: string
          ingestion_source: string | null
          is_verified: boolean | null
          name: string
          profile_image_url: string | null
          spotify_id: string | null
        }
        Insert: {
          genres?: string[] | null
          id?: string
          ingestion_source?: string | null
          is_verified?: boolean | null
          name: string
          profile_image_url?: string | null
          spotify_id?: string | null
        }
        Update: {
          genres?: string[] | null
          id?: string
          ingestion_source?: string | null
          is_verified?: boolean | null
          name?: string
          profile_image_url?: string | null
          spotify_id?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          body: string
          created_at: string | null
          id: string
          mix_id: string | null
          parent_id: string | null
          timestamp: number | null
          track_id: string | null
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          mix_id?: string | null
          parent_id?: string | null
          timestamp?: number | null
          track_id?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          mix_id?: string | null
          parent_id?: string | null
          timestamp?: number | null
          track_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          created_at: string | null
          description: string | null
          highlighted_artist_id: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          highlighted_artist_id?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          highlighted_artist_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_highlighted_artist_id_fkey"
            columns: ["highlighted_artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          community_id: string
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          community_id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      context_rules: {
        Row: {
          accuracy_score: number | null
          application_count: number | null
          confidence_weight: number | null
          correct_applications: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_applied_at: string | null
          parent_rule_id: string | null
          pattern_config: Json
          priority: number | null
          requires_approval: boolean | null
          rule_name: string
          rule_type: string
          scope: string
          scope_value: string | null
          target_context_name: string
          target_context_type: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          accuracy_score?: number | null
          application_count?: number | null
          confidence_weight?: number | null
          correct_applications?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_applied_at?: string | null
          parent_rule_id?: string | null
          pattern_config: Json
          priority?: number | null
          requires_approval?: boolean | null
          rule_name: string
          rule_type: string
          scope?: string
          scope_value?: string | null
          target_context_name: string
          target_context_type: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          accuracy_score?: number | null
          application_count?: number | null
          confidence_weight?: number | null
          correct_applications?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_applied_at?: string | null
          parent_rule_id?: string | null
          pattern_config?: Json
          priority?: number | null
          requires_approval?: boolean | null
          rule_name?: string
          rule_type?: string
          scope?: string
          scope_value?: string | null
          target_context_name?: string
          target_context_type?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "context_rules_parent_rule_id_fkey"
            columns: ["parent_rule_id"]
            isOneToOne: false
            referencedRelation: "context_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_rules_parent_rule_id_fkey"
            columns: ["parent_rule_id"]
            isOneToOne: false
            referencedRelation: "rule_performance_analysis"
            referencedColumns: ["rule_id"]
          },
        ]
      }
      contexts: {
        Row: {
          created_at: string | null
          external_ids: Json | null
          id: string
          is_verified: boolean
          name: string
          parent_id: string | null
          type: string
          updated_at: string | null
          venue_id: string | null
          verified_at: string | null
          verified_by: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          external_ids?: Json | null
          id?: string
          is_verified?: boolean
          name: string
          parent_id?: string | null
          type: string
          updated_at?: string | null
          venue_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          external_ids?: Json | null
          id?: string
          is_verified?: boolean
          name?: string
          parent_id?: string | null
          type?: string
          updated_at?: string | null
          venue_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contexts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contexts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_connections: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          friend_user_id: string | null
          id: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          friend_user_id?: string | null
          id?: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          friend_user_id?: string | null
          id?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friend_connections_friend_user_id_fkey"
            columns: ["friend_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_jobs: {
        Row: {
          attempts: number | null
          created_at: string | null
          error_message: string | null
          id: string
          job_payload: Json | null
          last_run: string | null
          max_attempts: number | null
          next_run: string | null
          requested_by: string | null
          status: string | null
          updated_at: string | null
          worker_type: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_payload?: Json | null
          last_run?: string | null
          max_attempts?: number | null
          next_run?: string | null
          requested_by?: string | null
          status?: string | null
          updated_at?: string | null
          worker_type: string
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_payload?: Json | null
          last_run?: string | null
          max_attempts?: number | null
          next_run?: string | null
          requested_by?: string | null
          status?: string | null
          updated_at?: string | null
          worker_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ingestion_logs: {
        Row: {
          created_at: string | null
          id: string
          job_id: string | null
          level: string | null
          message: string
          metadata: Json | null
          raw_mix_id: string | null
          worker_type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_id?: string | null
          level?: string | null
          message: string
          metadata?: Json | null
          raw_mix_id?: string | null
          worker_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          job_id?: string | null
          level?: string | null
          message?: string
          metadata?: Json | null
          raw_mix_id?: string | null
          worker_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "ingestion_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingestion_logs_raw_mix_id_fkey"
            columns: ["raw_mix_id"]
            isOneToOne: false
            referencedRelation: "artist_mix_discovery"
            referencedColumns: ["raw_mix_id"]
          },
          {
            foreignKeyName: "ingestion_logs_raw_mix_id_fkey"
            columns: ["raw_mix_id"]
            isOneToOne: false
            referencedRelation: "raw_mixes"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          comment_id: string | null
          created_at: string | null
          id: string
          mix_id: string | null
          track_id: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string | null
          id?: string
          mix_id?: string | null
          track_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string | null
          id?: string
          mix_id?: string | null
          track_id?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          description: string | null
          id: string
          image_url: string | null
          name: string
          spotify_id: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          spotify_id?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          spotify_id?: string | null
        }
        Relationships: []
      }
      likes: {
        Row: {
          created_at: string
          id: string
          source: string
          synced_to_spotify: boolean
          track_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source?: string
          synced_to_spotify?: boolean
          track_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source?: string
          synced_to_spotify?: boolean
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string | null
          id: string
          platform: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type?: string | null
          id?: string
          platform?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string | null
          id?: string
          platform?: string | null
          url?: string
        }
        Relationships: []
      }
      listening_history: {
        Row: {
          album_image_url: string | null
          album_name: string | null
          artist_names: string[]
          created_at: string | null
          duration_ms: number | null
          id: string
          played_at: string
          spotify_track_id: string
          track_name: string
          user_id: string | null
        }
        Insert: {
          album_image_url?: string | null
          album_name?: string | null
          artist_names: string[]
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          played_at: string
          spotify_track_id: string
          track_name: string
          user_id?: string | null
        }
        Update: {
          album_image_url?: string | null
          album_name?: string | null
          artist_names?: string[]
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          played_at?: string
          spotify_track_id?: string
          track_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listening_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_auto_generated: boolean
          is_visible: boolean
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_auto_generated?: boolean
          is_visible?: boolean
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_auto_generated?: boolean
          is_visible?: boolean
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      mix_artists: {
        Row: {
          artist_id: string
          mix_id: string
          role: string | null
        }
        Insert: {
          artist_id: string
          mix_id: string
          role?: string | null
        }
        Update: {
          artist_id?: string
          mix_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mix_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mix_artists_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "mixes"
            referencedColumns: ["id"]
          },
        ]
      }
      mix_contexts: {
        Row: {
          context_id: string
          created_at: string | null
          id: string
          mix_id: string
          role: string
        }
        Insert: {
          context_id: string
          created_at?: string | null
          id?: string
          mix_id: string
          role: string
        }
        Update: {
          context_id?: string
          created_at?: string | null
          id?: string
          mix_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "mix_contexts_context_id_fkey"
            columns: ["context_id"]
            isOneToOne: false
            referencedRelation: "contexts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mix_contexts_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "mixes"
            referencedColumns: ["id"]
          },
        ]
      }
      mix_lists: {
        Row: {
          created_at: string
          id: string
          list_id: string
          mix_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          mix_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          mix_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mix_lists_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mix_lists_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "mixes"
            referencedColumns: ["id"]
          },
        ]
      }
      mix_tracks: {
        Row: {
          mix_id: string
          played_with_previous: boolean | null
          position: number | null
          start_time: number | null
          track_id: string
        }
        Insert: {
          mix_id: string
          played_with_previous?: boolean | null
          position?: number | null
          start_time?: number | null
          track_id: string
        }
        Update: {
          mix_id?: string
          played_with_previous?: boolean | null
          position?: number | null
          start_time?: number | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mix_tracks_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mix_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      mixes: {
        Row: {
          audio_url: string | null
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration: number | null
          event_date: string | null
          external_ids: Json | null
          id: string
          ingestion_notes: string | null
          ingestion_source: string | null
          is_verified: boolean | null
          location: string | null
          published_date: string | null
          raw_mix_id: string | null
          slug: string | null
          title: string
          venue: string | null
          venue_id: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          audio_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration?: number | null
          event_date?: string | null
          external_ids?: Json | null
          id?: string
          ingestion_notes?: string | null
          ingestion_source?: string | null
          is_verified?: boolean | null
          location?: string | null
          published_date?: string | null
          raw_mix_id?: string | null
          slug?: string | null
          title: string
          venue?: string | null
          venue_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          audio_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration?: number | null
          event_date?: string | null
          external_ids?: Json | null
          id?: string
          ingestion_notes?: string | null
          ingestion_source?: string | null
          is_verified?: boolean | null
          location?: string | null
          published_date?: string | null
          raw_mix_id?: string | null
          slug?: string | null
          title?: string
          venue?: string | null
          venue_id?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mixes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mixes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_mixes: {
        Row: {
          artwork_url: string | null
          canonicalized_mix_id: string | null
          created_at: string | null
          discovered_artist_id: string | null
          discovery_source: string | null
          duration_seconds: number | null
          error_message: string | null
          external_id: string | null
          id: string
          processed_at: string | null
          provider: string
          raw_artist: string | null
          raw_description: string | null
          raw_metadata: Json | null
          raw_title: string | null
          source_url: string
          status: string | null
          suggested_contexts: Json | null
          uploaded_at: string | null
        }
        Insert: {
          artwork_url?: string | null
          canonicalized_mix_id?: string | null
          created_at?: string | null
          discovered_artist_id?: string | null
          discovery_source?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          processed_at?: string | null
          provider: string
          raw_artist?: string | null
          raw_description?: string | null
          raw_metadata?: Json | null
          raw_title?: string | null
          source_url: string
          status?: string | null
          suggested_contexts?: Json | null
          uploaded_at?: string | null
        }
        Update: {
          artwork_url?: string | null
          canonicalized_mix_id?: string | null
          created_at?: string | null
          discovered_artist_id?: string | null
          discovery_source?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          processed_at?: string | null
          provider?: string
          raw_artist?: string | null
          raw_description?: string | null
          raw_metadata?: Json | null
          raw_title?: string | null
          source_url?: string
          status?: string | null
          suggested_contexts?: Json | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_mixes_discovered_artist_id_fkey"
            columns: ["discovered_artist_id"]
            isOneToOne: false
            referencedRelation: "artist_mix_discovery"
            referencedColumns: ["artist_id"]
          },
          {
            foreignKeyName: "raw_mixes_discovered_artist_id_fkey"
            columns: ["discovered_artist_id"]
            isOneToOne: false
            referencedRelation: "artist_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_tracks: {
        Row: {
          created_at: string | null
          id: string
          line_text: string
          position: number | null
          raw_artist: string | null
          raw_mix_id: string
          raw_title: string | null
          source: string | null
          timestamp_seconds: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_text: string
          position?: number | null
          raw_artist?: string | null
          raw_mix_id: string
          raw_title?: string | null
          source?: string | null
          timestamp_seconds?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          line_text?: string
          position?: number | null
          raw_artist?: string | null
          raw_mix_id?: string
          raw_title?: string | null
          source?: string | null
          timestamp_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_tracks_raw_mix_id_fkey"
            columns: ["raw_mix_id"]
            isOneToOne: false
            referencedRelation: "artist_mix_discovery"
            referencedColumns: ["raw_mix_id"]
          },
          {
            foreignKeyName: "raw_tracks_raw_mix_id_fkey"
            columns: ["raw_mix_id"]
            isOneToOne: false
            referencedRelation: "raw_mixes"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_applications: {
        Row: {
          applied_automatically: boolean | null
          artist_name: string | null
          channel_id: string | null
          channel_name: string | null
          confidence_score: number
          created_at: string | null
          feedback_notes: string | null
          id: string
          matched_text: string | null
          mix_description: string | null
          mix_title: string
          moderator_feedback: string | null
          platform: string | null
          raw_mix_id: string
          reasoning: string | null
          requires_approval: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_id: string
          rule_version: number | null
          suggested_context_name: string
          suggested_context_type: string
        }
        Insert: {
          applied_automatically?: boolean | null
          artist_name?: string | null
          channel_id?: string | null
          channel_name?: string | null
          confidence_score: number
          created_at?: string | null
          feedback_notes?: string | null
          id?: string
          matched_text?: string | null
          mix_description?: string | null
          mix_title: string
          moderator_feedback?: string | null
          platform?: string | null
          raw_mix_id: string
          reasoning?: string | null
          requires_approval?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id: string
          rule_version?: number | null
          suggested_context_name: string
          suggested_context_type: string
        }
        Update: {
          applied_automatically?: boolean | null
          artist_name?: string | null
          channel_id?: string | null
          channel_name?: string | null
          confidence_score?: number
          created_at?: string | null
          feedback_notes?: string | null
          id?: string
          matched_text?: string | null
          mix_description?: string | null
          mix_title?: string
          moderator_feedback?: string | null
          platform?: string | null
          raw_mix_id?: string
          reasoning?: string | null
          requires_approval?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_id?: string
          rule_version?: number | null
          suggested_context_name?: string
          suggested_context_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_applications_raw_mix_id_fkey"
            columns: ["raw_mix_id"]
            isOneToOne: false
            referencedRelation: "artist_mix_discovery"
            referencedColumns: ["raw_mix_id"]
          },
          {
            foreignKeyName: "rule_applications_raw_mix_id_fkey"
            columns: ["raw_mix_id"]
            isOneToOne: false
            referencedRelation: "raw_mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_applications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "context_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_applications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rule_performance_analysis"
            referencedColumns: ["rule_id"]
          },
        ]
      }
      spotify_artists: {
        Row: {
          created_at: string | null
          genres: string[] | null
          id: string
          image_url: string | null
          name: string
          popularity: number | null
          spotify_id: string
        }
        Insert: {
          created_at?: string | null
          genres?: string[] | null
          id?: string
          image_url?: string | null
          name: string
          popularity?: number | null
          spotify_id: string
        }
        Update: {
          created_at?: string | null
          genres?: string[] | null
          id?: string
          image_url?: string | null
          name?: string
          popularity?: number | null
          spotify_id?: string
        }
        Relationships: []
      }
      spotify_connections: {
        Row: {
          access_token: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          profile_image_url: string | null
          refresh_token: string | null
          spotify_user_id: string
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          profile_image_url?: string | null
          refresh_token?: string | null
          spotify_user_id: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          profile_image_url?: string | null
          refresh_token?: string | null
          spotify_user_id?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spotify_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      spotify_tracks: {
        Row: {
          album: string | null
          album_id: string | null
          artist: string | null
          created_at: string | null
          duration_ms: number | null
          id: string
          image_url: string | null
          popularity: number | null
          preview_url: string | null
          release_date: string | null
          spotify_id: string
          title: string
        }
        Insert: {
          album?: string | null
          album_id?: string | null
          artist?: string | null
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          image_url?: string | null
          popularity?: number | null
          preview_url?: string | null
          release_date?: string | null
          spotify_id: string
          title: string
        }
        Update: {
          album?: string | null
          album_id?: string | null
          artist?: string | null
          created_at?: string | null
          duration_ms?: number | null
          id?: string
          image_url?: string | null
          popularity?: number | null
          preview_url?: string | null
          release_date?: string | null
          spotify_id?: string
          title?: string
        }
        Relationships: []
      }
      spotify_whitelist_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          id: string
          spotify_email: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          spotify_email: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          id?: string
          spotify_email?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staged_entities: {
        Row: {
          created_at: string
          data: Json
          id: string
          notes: string | null
          reviewed_at: string | null
          status: string
          submitted_by: string | null
          type: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_by?: string | null
          type: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          status?: string
          submitted_by?: string | null
          type?: string
        }
        Relationships: []
      }
      staged_mixes: {
        Row: {
          created_at: string | null
          id: string
          json_data: Json | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          json_data?: Json | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          json_data?: Json | null
          title?: string | null
        }
        Relationships: []
      }
      system_health: {
        Row: {
          created_at: string | null
          id: string
          last_polled_at: string
          metadata: Json | null
          service_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_polled_at?: string
          metadata?: Json | null
          service_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_polled_at?: string
          metadata?: Json | null
          service_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      taste_similarity: {
        Row: {
          calculated_at: string | null
          common_artists: string[] | null
          common_genres: string[] | null
          friend_user_id: string | null
          id: string
          similarity_score: number | null
          user_id: string | null
        }
        Insert: {
          calculated_at?: string | null
          common_artists?: string[] | null
          common_genres?: string[] | null
          friend_user_id?: string | null
          id?: string
          similarity_score?: number | null
          user_id?: string | null
        }
        Update: {
          calculated_at?: string | null
          common_artists?: string[] | null
          common_genres?: string[] | null
          friend_user_id?: string | null
          id?: string
          similarity_score?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "taste_similarity_friend_user_id_fkey"
            columns: ["friend_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taste_similarity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      timestamp_votes: {
        Row: {
          created_at: string | null
          id: string
          session_id: string | null
          timestamp_id: string
          user_id: string | null
          vote_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          session_id?: string | null
          timestamp_id: string
          user_id?: string | null
          vote_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          session_id?: string | null
          timestamp_id?: string
          user_id?: string | null
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "timestamp_votes_timestamp_id_fkey"
            columns: ["timestamp_id"]
            isOneToOne: false
            referencedRelation: "user_timestamps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timestamp_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      track_aliases: {
        Row: {
          alias: string
          context: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          mix_id: string | null
          source_type: string | null
          track_id: string | null
        }
        Insert: {
          alias: string
          context?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          mix_id?: string | null
          source_type?: string | null
          track_id?: string | null
        }
        Update: {
          alias?: string
          context?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          mix_id?: string | null
          source_type?: string | null
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "track_aliases_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_aliases_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_artists: {
        Row: {
          artist_id: string
          position: number | null
          role: string | null
          track_id: string
        }
        Insert: {
          artist_id: string
          position?: number | null
          role?: string | null
          track_id: string
        }
        Update: {
          artist_id?: string
          position?: number | null
          role?: string | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_artists_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_audio_features: {
        Row: {
          acousticness: number | null
          created_at: string | null
          danceability: number | null
          energy: number | null
          instrumentalness: number | null
          liveness: number | null
          loudness: number | null
          speechiness: number | null
          spotify_track_id: string
          tempo: number | null
          time_signature: number | null
          valence: number | null
        }
        Insert: {
          acousticness?: number | null
          created_at?: string | null
          danceability?: number | null
          energy?: number | null
          instrumentalness?: number | null
          liveness?: number | null
          loudness?: number | null
          speechiness?: number | null
          spotify_track_id: string
          tempo?: number | null
          time_signature?: number | null
          valence?: number | null
        }
        Update: {
          acousticness?: number | null
          created_at?: string | null
          danceability?: number | null
          energy?: number | null
          instrumentalness?: number | null
          liveness?: number | null
          loudness?: number | null
          speechiness?: number | null
          spotify_track_id?: string
          tempo?: number | null
          time_signature?: number | null
          valence?: number | null
        }
        Relationships: []
      }
      tracks: {
        Row: {
          id: string
          ingestion_source: string | null
          is_unreleased: boolean | null
          is_verified: boolean | null
          label_id: string | null
          last_checked_spotify: string | null
          spotify_track_id: string | null
          title: string
        }
        Insert: {
          id?: string
          ingestion_source?: string | null
          is_unreleased?: boolean | null
          is_verified?: boolean | null
          label_id?: string | null
          last_checked_spotify?: string | null
          spotify_track_id?: string | null
          title: string
        }
        Update: {
          id?: string
          ingestion_source?: string | null
          is_unreleased?: boolean | null
          is_verified?: boolean | null
          label_id?: string | null
          last_checked_spotify?: string | null
          spotify_track_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracks_spotify_track_id_fkey"
            columns: ["spotify_track_id"]
            isOneToOne: false
            referencedRelation: "spotify_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_spotify_playlists: {
        Row: {
          created_at: string
          id: string
          playlist_name: string
          spotify_playlist_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          playlist_name?: string
          spotify_playlist_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          playlist_name?: string
          spotify_playlist_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_spotify_playlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_spotify_tokens: {
        Row: {
          access_token: string | null
          created_at: string | null
          expires_at: string | null
          refresh_token: string | null
          scope: string | null
          spotify_display_name: string | null
          spotify_user_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          spotify_display_name?: string | null
          spotify_user_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: string | null
          refresh_token?: string | null
          scope?: string | null
          spotify_display_name?: string | null
          spotify_user_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_spotify_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_timestamps: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          mix_id: string
          position: number
          session_id: string | null
          start_time: number
          status: string | null
          submitted_by: string | null
          track_id: string
          updated_at: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          mix_id: string
          position: number
          session_id?: string | null
          start_time: number
          status?: string | null
          submitted_by?: string | null
          track_id: string
          updated_at?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          mix_id?: string
          position?: number
          session_id?: string | null
          start_time?: number
          status?: string | null
          submitted_by?: string | null
          track_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_timestamps_mix_id_fkey"
            columns: ["mix_id"]
            isOneToOne: false
            referencedRelation: "mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_timestamps_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_timestamps_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_top_items: {
        Row: {
          genres: string[] | null
          id: string
          image_url: string | null
          item_name: string
          item_type: string
          popularity: number | null
          rank: number
          spotify_item_id: string
          time_range: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          genres?: string[] | null
          id?: string
          image_url?: string | null
          item_name: string
          item_type: string
          popularity?: number | null
          rank: number
          spotify_item_id: string
          time_range: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          genres?: string[] | null
          id?: string
          image_url?: string | null
          item_name?: string
          item_type?: string
          popularity?: number | null
          rank?: number
          spotify_item_id?: string
          time_range?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_top_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          bio: string | null
          created_at: string | null
          email: string
          id: string
          profile_image_url: string | null
          profile_pic_url: string | null
          role: string | null
          spotify_display_name: string | null
          spotify_like_preferences: Json | null
          spotify_user_id: string | null
          username: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          email: string
          id?: string
          profile_image_url?: string | null
          profile_pic_url?: string | null
          role?: string | null
          spotify_display_name?: string | null
          spotify_like_preferences?: Json | null
          spotify_user_id?: string | null
          username?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          email?: string
          id?: string
          profile_image_url?: string | null
          profile_pic_url?: string | null
          role?: string | null
          spotify_display_name?: string | null
          spotify_like_preferences?: Json | null
          spotify_user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      venues: {
        Row: {
          capacity: number | null
          city: string | null
          country: string | null
          created_at: string | null
          external_ids: Json | null
          id: string
          is_verified: boolean
          lat: number | null
          lng: number | null
          name: string
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
          website: string | null
        }
        Insert: {
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          external_ids?: Json | null
          id?: string
          is_verified?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Update: {
          capacity?: number | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          external_ids?: Json | null
          id?: string
          is_verified?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      artist_mix_discovery: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          artist_id: string | null
          artist_name: string | null
          discovered_at: string | null
          discovery_source: string | null
          mix_status: string | null
          raw_mix_id: string | null
          raw_title: string | null
          suggested_contexts: Json | null
        }
        Relationships: []
      }
      pending_context_reviews: {
        Row: {
          application_id: string | null
          artist_name: string | null
          confidence_score: number | null
          matched_text: string | null
          mix_description: string | null
          mix_title: string | null
          platform: string | null
          raw_mix_id: string | null
          reasoning: string | null
          requires_approval: boolean | null
          rule_id: string | null
          rule_name: string | null
          suggested_at: string | null
          suggested_context_name: string | null
          suggested_context_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_applications_raw_mix_id_fkey"
            columns: ["raw_mix_id"]
            isOneToOne: false
            referencedRelation: "artist_mix_discovery"
            referencedColumns: ["raw_mix_id"]
          },
          {
            foreignKeyName: "rule_applications_raw_mix_id_fkey"
            columns: ["raw_mix_id"]
            isOneToOne: false
            referencedRelation: "raw_mixes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_applications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "context_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_applications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "rule_performance_analysis"
            referencedColumns: ["rule_id"]
          },
        ]
      }
      rule_performance_analysis: {
        Row: {
          accuracy_score: number | null
          avg_confidence: number | null
          confidence_weight: number | null
          correct_applications: number | null
          first_application: string | null
          incorrect_applications: number | null
          last_applied_at: string | null
          latest_application: string | null
          max_confidence: number | null
          min_confidence: number | null
          partially_correct_applications: number | null
          reviewed_applications: number | null
          rule_id: string | null
          rule_name: string | null
          rule_type: string | null
          spam_applications: number | null
          target_context_name: string | null
          target_context_type: string | null
          total_applications: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_active_context_rules: {
        Args: {
          p_scope?: string
          p_scope_value?: string
          p_context_type?: string
        }
        Returns: {
          id: string
          rule_name: string
          rule_type: string
          target_context_type: string
          target_context_name: string
          pattern_config: Json
          confidence_weight: number
          requires_approval: boolean
          priority: number
        }[]
      }
      get_artist_profile_by_name: {
        Args: { search_name: string }
        Returns: {
          id: string
          artist_name: string
          confidence_match: number
        }[]
      }
      get_next_pending_job: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          worker_type: string
          job_payload: Json
          status: string
          attempts: number
          max_attempts: number
          last_run: string
          next_run: string
          error_message: string
          requested_by: string
          created_at: string
          updated_at: string
        }[]
      }
      normalize_artist_name: {
        Args: { input_name: string }
        Returns: string
      }
      promote_timestamp_to_mix_tracks: {
        Args: { p_timestamp_id: string }
        Returns: undefined
      }
      submit_public_mix: {
        Args: { mix_title: string; mix_data: Json }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
