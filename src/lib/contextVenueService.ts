import { getServiceClient } from './supabase/service';
import { logger } from '../services/logger';
import type { 
  Context, 
  Venue, 
  MixContext, 
  ContextType, 
  MixContextRole, 
  ExternalIds 
} from './supabase/types';
import type { DetectedContext, DetectedVenue } from '../utils/contextVenueDetector';
import { normalizeContextName, normalizeVenueName } from '../utils/contextVenueDetector';

export interface ContextCreationResult {
  context: Context;
  created: boolean; // true if newly created, false if existing
}

export interface VenueCreationResult {
  venue: Venue;
  created: boolean; // true if newly created, false if existing
}

export interface MixContextCreationResult {
  mixContext: MixContext;
  created: boolean;
}

/**
 * Service for managing contexts, venues, and their relationships
 */
export class ContextVenueService {
  private supabase = getServiceClient();

  /**
   * Find existing context by normalized name and type
   */
  async findExistingContext(name: string, type: ContextType): Promise<Context | null> {
    const normalizedName = normalizeContextName(name);
    
    try {
      // First try exact name match
      const { data: exactMatch } = await this.supabase
        .from('contexts')
        .select('*')
        .eq('name', name)
        .eq('type', type)
        .single();

      if (exactMatch) {
        return exactMatch;
      }

      // Then try normalized name match (fuzzy)
      const { data: contexts } = await this.supabase
        .from('contexts')
        .select('*')
        .eq('type', type);

      if (contexts) {
        for (const context of contexts) {
          if (normalizeContextName(context.name) === normalizedName) {
            return context;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to find existing context', error as Error, {
        metadata: { name, type, normalizedName }
      });
      throw error;
    }
  }

  /**
   * Find existing venue by normalized name and city
   */
  async findExistingVenue(name: string, city?: string): Promise<Venue | null> {
    const normalizedName = normalizeVenueName(name);
    
    try {
      // Build query based on whether city is provided
      let query = this.supabase
        .from('venues')
        .select('*')
        .eq('name', name);

      if (city) {
        query = query.eq('city', city);
      }

      const { data: exactMatch } = await query.single();

      if (exactMatch) {
        return exactMatch;
      }

      // Try normalized name match
      const { data: venues } = await this.supabase
        .from('venues')
        .select('*');

      if (venues) {
        for (const venue of venues) {
          const nameMatches = normalizeVenueName(venue.name) === normalizedName;
          const cityMatches = !city || !venue.city || venue.city.toLowerCase() === city.toLowerCase();
          
          if (nameMatches && cityMatches) {
            return venue;
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to find existing venue', error as Error, {
        metadata: { name, city, normalizedName }
      });
      throw error;
    }
  }

  /**
   * Create or get existing context
   */
  async ensureContext(detectedContext: DetectedContext): Promise<ContextCreationResult> {
    try {
      // Check if context already exists
      const existing = await this.findExistingContext(detectedContext.name, detectedContext.type);
      
      if (existing) {
        logger.debug(`Using existing context: ${existing.name} (${existing.type})`);
        return { context: existing, created: false };
      }

      // Create new context
      const contextData = {
        name: detectedContext.name,
        type: detectedContext.type,
        external_ids: detectedContext.external_ids || {},
        parent_id: null, // TODO: Handle hierarchical relationships in future
        website: null,
        venue_id: null
      };

      const { data: newContext, error } = await this.supabase
        .from('contexts')
        .insert(contextData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create context: ${error.message}`);
      }

      logger.info(`Created new context: ${newContext.name} (${newContext.type})`, {
        metadata: {
          contextId: newContext.id,
          confidence: detectedContext.confidence,
          reasonCodes: detectedContext.reason_codes
        }
      });

      return { context: newContext, created: true };
    } catch (error) {
      logger.error('Failed to ensure context', error as Error, {
        metadata: { detectedContext }
      });
      throw error;
    }
  }

  /**
   * Create or get existing venue
   */
  async ensureVenue(detectedVenue: DetectedVenue): Promise<VenueCreationResult> {
    try {
      // Check if venue already exists
      const existing = await this.findExistingVenue(detectedVenue.name, detectedVenue.city);
      
      if (existing) {
        logger.debug(`Using existing venue: ${existing.name}${existing.city ? ` (${existing.city})` : ''}`);
        return { venue: existing, created: false };
      }

      // Create new venue
      const venueData = {
        name: detectedVenue.name,
        city: detectedVenue.city || null,
        country: detectedVenue.country || null,
        lat: detectedVenue.lat || null,
        lng: detectedVenue.lng || null,
        capacity: null,
        website: null,
        external_ids: detectedVenue.external_ids || {}
      };

      const { data: newVenue, error } = await this.supabase
        .from('venues')
        .insert(venueData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create venue: ${error.message}`);
      }

      logger.info(`Created new venue: ${newVenue.name}${newVenue.city ? ` (${newVenue.city})` : ''}`, {
        metadata: {
          venueId: newVenue.id,
          confidence: detectedVenue.confidence,
          reasonCodes: detectedVenue.reason_codes
        }
      });

      return { venue: newVenue, created: true };
    } catch (error) {
      logger.error('Failed to ensure venue', error as Error, {
        metadata: { detectedVenue }
      });
      throw error;
    }
  }

  /**
   * Create mix-context relationship if it doesn't exist
   */
  async ensureMixContext(
    mixId: string,
    contextId: string,
    role: MixContextRole
  ): Promise<MixContextCreationResult> {
    try {
      // Check if relationship already exists
      const { data: existing } = await this.supabase
        .from('mix_contexts')
        .select('*')
        .eq('mix_id', mixId)
        .eq('context_id', contextId)
        .eq('role', role)
        .single();

      if (existing) {
        logger.debug(`Mix-context relationship already exists: ${mixId} -> ${contextId} (${role})`);
        return { mixContext: existing, created: false };
      }

      // Create new relationship
      const { data: newMixContext, error } = await this.supabase
        .from('mix_contexts')
        .insert({
          mix_id: mixId,
          context_id: contextId,
          role
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create mix-context relationship: ${error.message}`);
      }

      logger.info(`Created mix-context relationship: ${mixId} -> ${contextId} (${role})`);
      return { mixContext: newMixContext, created: true };
    } catch (error) {
      logger.error('Failed to ensure mix-context relationship', error as Error, {
        metadata: { mixId, contextId, role }
      });
      throw error;
    }
  }

  /**
   * Update mix with venue information
   */
  async updateMixVenue(mixId: string, venueId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('mixes')
        .update({ venue_id: venueId })
        .eq('id', mixId);

      if (error) {
        throw new Error(`Failed to update mix venue: ${error.message}`);
      }

      logger.info(`Updated mix venue: ${mixId} -> ${venueId}`);
    } catch (error) {
      logger.error('Failed to update mix venue', error as Error, {
        metadata: { mixId, venueId }
      });
      throw error;
    }
  }

  /**
   * Process detected contexts and venues for a raw mix
   * This function handles the complete workflow of creating contexts/venues and relationships
   */
  async processDetectionResults(
    rawMixId: string,
    detectedContexts: DetectedContext[],
    detectedVenue?: DetectedVenue,
    isVerified: boolean = false
  ): Promise<{
    contexts: ContextCreationResult[];
    venue?: VenueCreationResult;
    mixContexts: MixContextCreationResult[];
    venueUpdated: boolean;
  }> {
    try {
      logger.info(`Processing detection results for raw mix: ${rawMixId}`, {
        metadata: {
          contextsCount: detectedContexts.length,
          hasVenue: !!detectedVenue,
          isVerified
        }
      });

      const results = {
        contexts: [] as ContextCreationResult[],
        venue: undefined as VenueCreationResult | undefined,
        mixContexts: [] as MixContextCreationResult[],
        venueUpdated: false
      };

      // Process contexts
      for (const detectedContext of detectedContexts) {
        try {
          const contextResult = await this.ensureContext(detectedContext);
          results.contexts.push(contextResult);

          // Only create mix-context relationships for canonicalized mixes
          // Raw mixes will have this processed during canonicalization
          
        } catch (error) {
          logger.error(`Failed to process context: ${detectedContext.name}`, error as Error, {
            metadata: { rawMixId, detectedContext }
          });
        }
      }

      // Process venue
      if (detectedVenue) {
        try {
          const venueResult = await this.ensureVenue(detectedVenue);
          results.venue = venueResult;
        } catch (error) {
          logger.error(`Failed to process venue: ${detectedVenue.name}`, error as Error, {
            metadata: { rawMixId, detectedVenue }
          });
        }
      }

      logger.info(`Completed processing detection results for raw mix: ${rawMixId}`, {
        metadata: {
          contextsCreated: results.contexts.filter(c => c.created).length,
          contextsReused: results.contexts.filter(c => !c.created).length,
          venueCreated: results.venue?.created || false,
          venueReused: results.venue && !results.venue.created
        }
      });

      return results;
    } catch (error) {
      logger.error('Failed to process detection results', error as Error, {
        metadata: { rawMixId, detectedContexts, detectedVenue }
      });
      throw error;
    }
  }

  /**
   * Get context statistics for monitoring
   */
  async getContextStats(): Promise<{
    totalContexts: number;
    contextsByType: Record<ContextType, number>;
    totalVenues: number;
    totalMixContexts: number;
  }> {
    try {
      const [
        { count: totalContexts },
        { data: contextsByType },
        { count: totalVenues },
        { count: totalMixContexts }
      ] = await Promise.all([
        this.supabase.from('contexts').select('*', { count: 'exact', head: true }),
        this.supabase.from('contexts').select('type'),
        this.supabase.from('venues').select('*', { count: 'exact', head: true }),
        this.supabase.from('mix_contexts').select('*', { count: 'exact', head: true })
      ]);

      const typeStats = (contextsByType || []).reduce((acc, item) => {
        acc[item.type as ContextType] = (acc[item.type as ContextType] || 0) + 1;
        return acc;
      }, {} as Record<ContextType, number>);

      return {
        totalContexts: totalContexts || 0,
        contextsByType: typeStats,
        totalVenues: totalVenues || 0,
        totalMixContexts: totalMixContexts || 0
      };
    } catch (error) {
      logger.error('Failed to get context stats', error as Error);
      throw error;
    }
  }
}

// Export singleton instance
export const contextVenueService = new ContextVenueService();