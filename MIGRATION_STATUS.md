# Migration Status & History

This document tracks the deployment status of database migrations for the mixd-ingestion service.

## Current Production Schema Status

✅ **All migrations deployed successfully**

### Migration History

| Migration | Date | Status | Description |
|-----------|------|--------|-------------|
| `20250803165804_remote_schema.sql` | 2025-08-03 | ✅ Deployed | Remote schema sync |
| `20250803165900_add_contexts_and_venues.sql` | 2025-08-03 | ✅ Deployed | Contexts & venues schema |

### Tables in Production

#### Core Tables
- ✅ `raw_mixes` - Raw ingestion staging
- ✅ `raw_tracks` - Raw track data
- ✅ `ingestion_jobs` - Job orchestration  
- ✅ `ingestion_logs` - Comprehensive logging
- ✅ `mixes` - Production mix records (with `venue_id` column)
- ✅ `tracks` - Individual track records
- ✅ `artists` - Artist profiles
- ✅ `mix_tracks` - Mix-track relationships
- ✅ `track_artists` - Track-artist relationships
- ✅ `mix_artists` - Mix-artist relationships
- ✅ `track_aliases` - Track name variations

#### Context & Venue Tables (NEW)
- ✅ `venues` - Physical locations and stages
- ✅ `contexts` - Cultural contexts with hierarchy support
- ✅ `mix_contexts` - Mix-context relationships with roles

### Indexes & Constraints

All performance indexes deployed:
- ✅ Context type and hierarchy indexes
- ✅ Mix-context relationship indexes  
- ✅ Venue location indexes
- ✅ External ID optimization indexes

### Functions & Triggers

- ✅ `check_context_hierarchy_depth()` - Hierarchy validation function
- ✅ `trigger_check_context_depth` - Depth warning trigger

## Next Steps

1. **Phase 2**: Update ingestion workers to populate new tables
2. **Phase 3**: Migrate existing mix data to new relational structure
3. **Phase 4**: Deprecate legacy flat fields once migration complete

## Migration Commands

```bash
# Check migration status
supabase migration list

# Apply new migrations  
supabase db push

# Generate updated TypeScript types
npm run db:types
```

## Rollback Plan

If rollback needed:
1. Remove new tables: `DROP TABLE mix_contexts, contexts, venues;`
2. Remove column: `ALTER TABLE mixes DROP COLUMN venue_id;`
3. Drop functions: `DROP FUNCTION check_context_hierarchy_depth();`

**Note**: No rollback expected - schema is additive and non-breaking.

---

**Last Updated**: 2025-08-03  
**Production Status**: ✅ LIVE  
**Next Review**: After Phase 2 implementation