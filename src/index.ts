#!/usr/bin/env node

import { program } from 'commander';
import { runIngestionJob } from './jobs/run-ingestion';
import { 
  runCanonicalizationJob, 
  retryFailedCanonicalization, 
  showCanonicalizationStats 
} from './jobs/run-canonicalization';
import { logger } from './services/logger';

/**
 * CLI for mixd-ingestion service
 * Provides commands for ingestion, canonicalization, and management
 */

program
  .name('mixd-ingestion')
  .description('Mixd.fm ingestion service CLI')
  .version('1.0.0');

// Ingestion command
program
  .command('ingest')
  .description('Run ingestion from all configured sources')
  .option('-c, --config <path>', 'Path to sources.json config file')
  .action(async (options) => {
    try {
      logger.info('Starting ingestion job via CLI');
      await runIngestionJob();
    } catch (err) {
      logger.error('Ingestion command failed', err as Error);
      process.exit(1);
    }
  });

// Canonicalization commands
const canonicalizeCmd = program
  .command('canonicalize')
  .description('Canonicalization commands');

canonicalizeCmd
  .command('run')
  .description('Run canonicalization for pending raw mixes')
  .option('-b, --batch <size>', 'Batch size for processing', '10')
  .action(async (options) => {
    try {
      logger.info('Starting canonicalization job via CLI');
      await runCanonicalizationJob();
    } catch (err) {
      logger.error('Canonicalization command failed', err as Error);
      process.exit(1);
    }
  });

canonicalizeCmd
  .command('retry')
  .description('Retry failed canonicalizations')
  .option('-a, --max-age <hours>', 'Maximum age of failed jobs to retry', '24')
  .option('-b, --batch <size>', 'Batch size for processing', '5')
  .action(async (options) => {
    try {
      logger.info('Starting retry canonicalization job via CLI');
      await retryFailedCanonicalization();
    } catch (err) {
      logger.error('Retry canonicalization command failed', err as Error);
      process.exit(1);
    }
  });

canonicalizeCmd
  .command('stats')
  .description('Show canonicalization statistics')
  .action(async () => {
    try {
      await showCanonicalizationStats();
    } catch (err) {
      logger.error('Stats command failed', err as Error);
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show service status and statistics')
  .action(async () => {
    try {
      console.log('🔍 Mixd Ingestion Service Status\n');
      
      // Import here to avoid circular dependencies
      const { CanonicalizationJobRunner } = await import('./jobs/run-canonicalization');
      const runner = new CanonicalizationJobRunner();
      
      const stats = await runner.getStats();
      
      console.log('📊 Raw Mixes Status:');
      console.log(`  Pending:       ${stats.pending}`);
      console.log(`  Processing:    ${stats.processing}`);
      console.log(`  Canonicalized: ${stats.canonicalized}`);
      console.log(`  Failed:        ${stats.failed}`);
      console.log(`  Total:         ${stats.total}`);
      
      if (stats.total > 0) {
        const completionRate = ((stats.canonicalized / stats.total) * 100).toFixed(1);
        console.log(`  Completion:    ${completionRate}%`);
      }
      
      console.log('\n✅ Service is operational');
      
    } catch (err) {
      logger.error('Status command failed', err as Error);
      process.exit(1);
    }
  });

// Help command
program
  .command('help')
  .description('Show help information')
  .action(() => {
    console.log(`
🎵 Mixd Ingestion Service

Available Commands:
  ingest                    Run ingestion from all configured sources
  canonicalize run          Process pending raw mixes
  canonicalize retry        Retry failed canonicalizations  
  canonicalize stats        Show canonicalization statistics
  status                    Show service status
  help                      Show this help

Environment Variables:
  SUPABASE_URL              Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY Service role key for database access
  YOUTUBE_API_KEY           YouTube Data API key
  SOUNDCLOUD_CLIENT_ID      SoundCloud API client ID (optional)
  LOG_LEVEL                 Logging level (debug, info, warn, error)

Configuration:
  Edit config/sources.json to configure ingestion sources

Examples:
  npm run ingest            Run daily ingestion
  npm run canonicalize      Process pending mixes
  npm run canonicalize:stats Show statistics
    `);
  });

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}