import { getServiceClient } from './supabase/service';
import { logger } from '../services/logger';
import type { ContextType } from './supabase/types';

// Context suggestion from rules engine
export interface ContextSuggestion {
  rule_id: string;
  context_type: ContextType;
  context_name: string;
  confidence: number;
  reasoning: string;
  requires_approval: boolean;
  matched_text?: string;
  rule_name: string;
}

// Mix content for analysis
export interface MixContent {
  title: string;
  description?: string;
  artist_name?: string;
  platform?: string;
  channel_name?: string;
  channel_id?: string;
}

// Rule configuration interfaces
interface PatternRuleConfig {
  regex: string;
  flags?: string;
}

interface KeywordRuleConfig {
  keywords: string[];
  require_all?: boolean;
}

interface ChannelMappingConfig {
  youtube_channel_ids?: string[];
  soundcloud_usernames?: string[];
}

interface TitlePatternConfig {
  contains: string[];
  followed_by?: string[];
  extract_venue?: boolean;
}

type RuleConfig = PatternRuleConfig | KeywordRuleConfig | ChannelMappingConfig | TitlePatternConfig;

// Database rule representation
interface ContextRule {
  id: string;
  rule_name: string;
  rule_type: 'pattern' | 'keyword' | 'channel_mapping' | 'title_pattern' | 'description_pattern';
  target_context_type: ContextType;
  target_context_name: string;
  pattern_config: RuleConfig;
  confidence_weight: number;
  requires_approval: boolean;
  priority: number;
}

/**
 * Basic Context Rules Engine for Phase 2
 * Detects festivals, radio shows, publishers and other contexts in mix content
 */
export class BasicContextRulesEngine {
  private supabase = getServiceClient();
  private rulesCache: ContextRule[] = [];
  private cacheExpiry: Date = new Date(0);
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Analyze mix content and return context suggestions
   */
  async suggestContexts(
    content: MixContent,
    artistId?: string,
    platform?: string
  ): Promise<ContextSuggestion[]> {
    try {
      // Load active rules (with caching)
      const rules = await this.getActiveRules(artistId, platform);
      const suggestions: ContextSuggestion[] = [];
      
      // Apply each rule to the content
      for (const rule of rules) {
        const matches = await this.applyRule(rule, content);
        suggestions.push(...matches);
      }
      
      // Sort by confidence and remove duplicates
      const deduplicatedSuggestions = this.deduplicateSuggestions(suggestions);
      
      logger.info(`Context analysis complete: ${suggestions.length} raw matches, ${deduplicatedSuggestions.length} final suggestions`, {
        title: content.title,
        totalRules: rules.length,
        matchingRules: suggestions.length
      });
      
      return deduplicatedSuggestions;
      
    } catch (error) {
      logger.error('Context rules engine failed', error as Error, { content });
      return [];
    }
  }
  
  /**
   * Apply a single rule to mix content
   */
  private async applyRule(rule: ContextRule, content: MixContent): Promise<ContextSuggestion[]> {
    try {
      let matches: ContextSuggestion[] = [];
      
      switch (rule.rule_type) {
        case 'pattern':
        case 'description_pattern':
          matches = this.applyPatternRule(rule, content);
          break;
          
        case 'keyword':
          matches = this.applyKeywordRule(rule, content);
          break;
          
        case 'channel_mapping':
          matches = this.applyChannelMappingRule(rule, content);
          break;
          
        case 'title_pattern':
          matches = this.applyTitlePatternRule(rule, content);
          break;
          
        default:
          logger.warn(`Unknown rule type: ${rule.rule_type}`, { ruleId: rule.id });
      }
      
      // Log rule application for learning
      if (matches.length > 0) {
        await this.logRuleApplication(rule.id, content, matches);
      }
      
      return matches;
      
    } catch (error) {
      logger.error(`Rule application failed: ${rule.rule_name}`, error as Error, { 
        ruleId: rule.id, 
        content 
      });
      return [];
    }
  }
  
  /**
   * Apply pattern/regex rule
   */
  private applyPatternRule(rule: ContextRule, content: MixContent): ContextSuggestion[] {
    const config = rule.pattern_config as PatternRuleConfig;
    
    try {
      const regex = new RegExp(config.regex, config.flags || 'i');
      const searchText = rule.rule_type === 'description_pattern' 
        ? (content.description || '') 
        : content.title;
      
      const match = regex.exec(searchText);
      
      if (match) {
        return [{
          rule_id: rule.id,
          rule_name: rule.rule_name,
          context_type: rule.target_context_type,
          context_name: rule.target_context_name,
          confidence: rule.confidence_weight,
          requires_approval: rule.requires_approval,
          reasoning: `Pattern match: "${match[0]}" in ${rule.rule_type === 'description_pattern' ? 'description' : 'title'}`,
          matched_text: match[0]
        }];
      }
      
      return [];
      
    } catch (error) {
      logger.error(`Invalid regex in rule ${rule.rule_name}`, error as Error);
      return [];
    }
  }
  
  /**
   * Apply keyword rule
   */
  private applyKeywordRule(rule: ContextRule, content: MixContent): ContextSuggestion[] {
    const config = rule.pattern_config as KeywordRuleConfig;
    const searchText = `${content.title} ${content.description || ''}`.toLowerCase();
    
    const matchedKeywords = config.keywords.filter(keyword => 
      searchText.includes(keyword.toLowerCase())
    );
    
    const shouldMatch = config.require_all 
      ? matchedKeywords.length === config.keywords.length
      : matchedKeywords.length > 0;
    
    if (shouldMatch) {
      return [{
        rule_id: rule.id,
        rule_name: rule.rule_name,
        context_type: rule.target_context_type,
        context_name: rule.target_context_name,
        confidence: rule.confidence_weight * (matchedKeywords.length / config.keywords.length),
        requires_approval: rule.requires_approval,
        reasoning: `Keyword match: ${matchedKeywords.join(', ')}`,
        matched_text: matchedKeywords.join(', ')
      }];
    }
    
    return [];
  }
  
  /**
   * Apply channel mapping rule
   */
  private applyChannelMappingRule(rule: ContextRule, content: MixContent): ContextSuggestion[] {
    const config = rule.pattern_config as ChannelMappingConfig;
    
    // Check YouTube channel IDs
    if (config.youtube_channel_ids && content.channel_id && content.platform === 'youtube') {
      if (config.youtube_channel_ids.includes(content.channel_id)) {
        return [{
          rule_id: rule.id,
          rule_name: rule.rule_name,
          context_type: rule.target_context_type,
          context_name: rule.target_context_name,
          confidence: rule.confidence_weight,
          requires_approval: rule.requires_approval,
          reasoning: `YouTube channel mapping: ${content.channel_id}`,
          matched_text: content.channel_name || content.channel_id
        }];
      }
    }
    
    // Check SoundCloud usernames
    if (config.soundcloud_usernames && content.channel_name && content.platform === 'soundcloud') {
      const matchedUsername = config.soundcloud_usernames.find(username =>
        content.channel_name?.toLowerCase().includes(username.toLowerCase())
      );
      
      if (matchedUsername) {
        return [{
          rule_id: rule.id,
          rule_name: rule.rule_name,
          context_type: rule.target_context_type,
          context_name: rule.target_context_name,
          confidence: rule.confidence_weight,
          requires_approval: rule.requires_approval,
          reasoning: `SoundCloud channel mapping: ${matchedUsername}`,
          matched_text: content.channel_name
        }];
      }
    }
    
    return [];
  }
  
  /**
   * Apply title pattern rule (for extracting venue names from "Live at X" patterns)
   */
  private applyTitlePatternRule(rule: ContextRule, content: MixContent): ContextSuggestion[] {
    const config = rule.pattern_config as TitlePatternConfig;
    const title = content.title.toLowerCase();
    
    // Check if title contains required patterns
    const hasRequiredPattern = config.contains.some(pattern => 
      title.includes(pattern.toLowerCase())
    );
    
    if (!hasRequiredPattern) {
      return [];
    }
    
    // If extract_venue is enabled, try to extract venue name
    if (config.extract_venue) {
      const liveAtMatch = title.match(/(?:live at|recorded at|@)\s+([^,\-\|]+)/i);
      if (liveAtMatch) {
        const venueName = liveAtMatch[1].trim();
        
        return [{
          rule_id: rule.id,
          rule_name: rule.rule_name,
          context_type: rule.target_context_type,
          context_name: venueName,
          confidence: rule.confidence_weight,
          requires_approval: rule.requires_approval,
          reasoning: `Extracted venue from title pattern: "${liveAtMatch[0]}"`,
          matched_text: venueName
        }];
      }
    }
    
    // Standard pattern match
    return [{
      rule_id: rule.id,
      rule_name: rule.rule_name,
      context_type: rule.target_context_type,
      context_name: rule.target_context_name,
      confidence: rule.confidence_weight,
      requires_approval: rule.requires_approval,
      reasoning: `Title pattern match: contains "${config.contains.join(' or ')}"`,
      matched_text: config.contains.find(p => title.includes(p.toLowerCase()))
    }];
  }
  
  /**
   * Remove duplicate suggestions, keeping highest confidence
   */
  private deduplicateSuggestions(suggestions: ContextSuggestion[]): ContextSuggestion[] {
    const seen = new Map<string, ContextSuggestion>();
    
    for (const suggestion of suggestions) {
      const key = `${suggestion.context_type}:${suggestion.context_name.toLowerCase()}`;
      const existing = seen.get(key);
      
      if (!existing || suggestion.confidence > existing.confidence) {
        seen.set(key, suggestion);
      }
    }
    
    return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Get active rules with caching
   */
  private async getActiveRules(artistId?: string, platform?: string): Promise<ContextRule[]> {
    // Check cache validity
    if (this.rulesCache.length > 0 && new Date() < this.cacheExpiry) {
      return this.filterRulesForScope(this.rulesCache, artistId, platform);
    }
    
    // Fetch fresh rules from database
    const { data: rules, error } = await this.supabase
      .from('context_rules')
      .select(`
        id,
        rule_name,
        rule_type,
        target_context_type,
        target_context_name,
        pattern_config,
        confidence_weight,
        requires_approval,
        priority
      `)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .order('confidence_weight', { ascending: false });
    
    if (error) {
      logger.error('Failed to fetch context rules', error);
      return [];
    }
    
    // Update cache
    this.rulesCache = rules || [];
    this.cacheExpiry = new Date(Date.now() + this.CACHE_DURATION_MS);
    
    return this.filterRulesForScope(this.rulesCache, artistId, platform);
  }
  
  /**
   * Filter rules based on scope (global, artist-specific, platform-specific)
   */
  private filterRulesForScope(rules: ContextRule[], artistId?: string, platform?: string): ContextRule[] {
    // For now, return all global rules since we don't have scope filtering in the initial schema
    // This will be enhanced when we add artist/platform specific rules
    return rules;
  }
  
  /**
   * Log rule application for future learning
   */
  private async logRuleApplication(
    ruleId: string, 
    content: MixContent, 
    suggestions: ContextSuggestion[]
  ): Promise<void> {
    try {
      // Update rule application count
      await this.supabase
        .from('context_rules')
        .update({ 
          application_count: this.supabase.raw('application_count + 1'),
          last_applied_at: new Date().toISOString()
        })
        .eq('id', ruleId);
      
      logger.debug(`Logged rule application: ${ruleId}`, {
        suggestionsCount: suggestions.length,
        title: content.title
      });
      
    } catch (error) {
      logger.error('Failed to log rule application', error as Error, { ruleId });
    }
  }
  
  /**
   * Clear rules cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.rulesCache = [];
    this.cacheExpiry = new Date(0);
  }
}