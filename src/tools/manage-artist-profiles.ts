#!/usr/bin/env node

import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

import { ArtistProfileConfigGenerator } from '../lib/artist-profile-config-generator';
import { getServiceClient } from '../lib/supabase/service';
import { logger } from '../services/logger';

/**
 * CLI tool for managing artist profiles
 * Usage: npm run manage:profiles <command> [args]
 */

const supabase = getServiceClient();
const generator = new ArtistProfileConfigGenerator();

async function listProfiles(status?: string) {
  console.log(`📋 Artist Profiles${status ? ` (${status})` : ''}:`);
  console.log('=' + '='.repeat(50));
  
  let query = supabase.from('artist_profiles').select('*');
  
  if (status) {
    query = query.eq('verification_status', status);
  }
  
  const { data: profiles, error } = await query.order('discovered_at', { ascending: false });
  
  if (error) {
    console.error('❌ Failed to fetch profiles:', error.message);
    return;
  }
  
  if (!profiles || profiles.length === 0) {
    console.log('No profiles found.');
    return;
  }
  
  console.log(`Found ${profiles.length} profile(s):\n`);
  
  profiles.forEach((profile, index) => {
    const confidenceScores = profile.confidence_scores as any || {};
    const platformCount = Object.keys(confidenceScores).filter(key => confidenceScores[key] > 0.4).length;
    
    console.log(`${index + 1}. ${profile.artist_name}`);
    console.log(`   ID: ${profile.id}`);
    console.log(`   Status: ${profile.verification_status}`);
    console.log(`   Platforms: ${platformCount}/4`);
    console.log(`   Discovered: ${new Date(profile.discovered_at).toLocaleDateString()}`);
    
    // Show platform links
    if (profile.soundcloud_username) console.log(`   🔊 SoundCloud: ${profile.soundcloud_username}`);
    if (profile.youtube_channel_id) console.log(`   📹 YouTube: ${profile.youtube_channel_id}`);
    if (profile.spotify_artist_id) console.log(`   🎵 Spotify: ${profile.spotify_artist_id}`);
    if (profile.tracklists_1001_url) console.log(`   📝 1001Tracklists: Found`);
    
    console.log('');
  });
}

async function showProfile(artistName: string) {
  console.log(`🎯 Artist Profile: "${artistName}"`);
  console.log('=' + '='.repeat(50));
  
  const { data: profile, error } = await supabase
    .from('artist_profiles')
    .select('*')
    .eq('artist_name', artistName)
    .maybeSingle();
  
  if (error) {
    console.error('❌ Failed to fetch profile:', error.message);
    return;
  }
  
  if (!profile) {
    console.log('❌ No profile found for this artist.');
    return;
  }
  
  console.log(`Artist Name: ${profile.artist_name}`);
  console.log(`Verification Status: ${profile.verification_status}`);
  console.log(`Discovery Method: ${profile.discovery_method}`);
  console.log(`Discovered: ${new Date(profile.discovered_at).toLocaleDateString()}`);
  
  if (profile.verified_at) {
    console.log(`Verified: ${new Date(profile.verified_at).toLocaleDateString()}`);
  }
  
  console.log('\n📱 Platform Links:');
  
  const confidenceScores = profile.confidence_scores as any || {};
  
  if (profile.soundcloud_url) {
    console.log(`🔊 SoundCloud: ${profile.soundcloud_url} (${Math.round((confidenceScores.soundcloud || 0) * 100)}%)`);
  }
  
  if (profile.youtube_channel_url) {
    console.log(`📹 YouTube: ${profile.youtube_channel_url} (${Math.round((confidenceScores.youtube || 0) * 100)}%)`);
  }
  
  if (profile.spotify_url) {
    console.log(`🎵 Spotify: ${profile.spotify_url} (${Math.round((confidenceScores.spotify || 0) * 100)}%)`);
  }
  
  if (profile.tracklists_1001_url) {
    console.log(`📝 1001Tracklists: ${profile.tracklists_1001_url} (${Math.round((confidenceScores['1001tracklists'] || 0) * 100)}%)`);
  }
  
  if (profile.notes) {
    console.log(`\n📝 Notes: ${profile.notes}`);
  }
}

async function verifyProfile(artistName: string, verifiedBy: string = 'admin') {
  console.log(`✅ Verifying profile for: "${artistName}"`);
  
  const { data: profile, error: fetchError } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('artist_name', artistName)
    .maybeSingle();
  
  if (fetchError) {
    console.error('❌ Failed to fetch profile:', fetchError.message);
    return;
  }
  
  if (!profile) {
    console.log('❌ No profile found for this artist.');
    return;
  }
  
  try {
    await generator.verifyArtistProfile(profile.id, verifiedBy);
    console.log('✅ Profile verified successfully!');
  } catch (error) {
    console.error('❌ Failed to verify profile:', error);
  }
}

async function generateConfigs(status: string = 'verified') {
  console.log(`🔧 Generating worker configurations (${status} profiles)...`);
  
  try {
    const configs = await generator.generateAllWorkerConfigs({
      verificationStatus: status as any,
      minConfidence: 0.5
    });
    
    console.log('\n📊 Generated Configurations:');
    console.log(`🔊 SoundCloud: ${configs.soundcloud.artists?.length || 0} artists`);
    console.log(`📹 YouTube: ${configs.youtube.channels?.length || 0} channels`);
    console.log(`📝 1001Tracklists: ${(configs['1001tracklists'].searchTerms?.length || 0) + (configs['1001tracklists'].urls?.length || 0)} items`);
    
    // Show some examples
    if (configs.soundcloud.artists && configs.soundcloud.artists.length > 0) {
      console.log('\n🔊 SoundCloud usernames:');
      configs.soundcloud.artists.slice(0, 5).forEach(artist => console.log(`  - ${artist}`));
      if (configs.soundcloud.artists.length > 5) {
        console.log(`  ... and ${configs.soundcloud.artists.length - 5} more`);
      }
    }
    
    if (configs.youtube.channels && configs.youtube.channels.length > 0) {
      console.log('\n📹 YouTube channels:');
      configs.youtube.channels.slice(0, 5).forEach(channel => console.log(`  - ${channel}`));
      if (configs.youtube.channels.length > 5) {
        console.log(`  ... and ${configs.youtube.channels.length - 5} more`);
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to generate configs:', error);
  }
}

async function generateJobs(mode: 'backfill' | 'rolling' = 'rolling') {
  console.log(`🚀 Generating ingestion jobs (${mode} mode)...`);
  
  try {
    const jobs = await generator.generateIngestionJobs({
      mode,
      batchSize: 50,
      verificationStatus: 'verified',
      minConfidence: 0.6
    });
    
    console.log(`\n📊 Generated ${jobs.length} job(s):`);
    
    const jobCounts = jobs.reduce((acc, job) => {
      acc[job.worker_type] = (acc[job.worker_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(jobCounts).forEach(([workerType, count]) => {
      console.log(`  ${workerType}: ${count} job(s)`);
    });
    
    console.log('\nFirst 10 jobs:');
    jobs.slice(0, 10).forEach((job, index) => {
      console.log(`  ${index + 1}. ${job.worker_type}: ${job.source_id}`);
    });
    
    if (jobs.length > 10) {
      console.log(`  ... and ${jobs.length - 10} more`);
    }
    
  } catch (error) {
    console.error('❌ Failed to generate jobs:', error);
  }
}

// Main CLI handler
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);
  
  switch (command) {
    case 'list':
      await listProfiles(args[0]);
      break;
      
    case 'show':
      if (!args[0]) {
        console.error('Usage: npm run manage:profiles show "Artist Name"');
        process.exit(1);
      }
      await showProfile(args[0]);
      break;
      
    case 'verify':
      if (!args[0]) {
        console.error('Usage: npm run manage:profiles verify "Artist Name" [verifiedBy]');
        process.exit(1);
      }
      await verifyProfile(args[0], args[1]);
      break;
      
    case 'configs':
      await generateConfigs(args[0]);
      break;
      
    case 'jobs':
      await generateJobs(args[0] as any);
      break;
      
    default:
      console.log('Artist Profile Management Tool');
      console.log('============================');
      console.log('');
      console.log('Commands:');
      console.log('  list [status]              List all profiles (optional: pending/verified/rejected)');
      console.log('  show "Artist Name"         Show detailed profile information');
      console.log('  verify "Artist Name"       Verify a profile');
      console.log('  configs [status]           Generate worker configurations');
      console.log('  jobs [mode]                Generate ingestion jobs (backfill/rolling)');
      console.log('');
      console.log('Examples:');
      console.log('  npm run manage:profiles list pending');
      console.log('  npm run manage:profiles show "Rinzen"');
      console.log('  npm run manage:profiles verify "Rinzen"');
      console.log('  npm run manage:profiles configs verified');
      console.log('  npm run manage:profiles jobs rolling');
      break;
  }
}

main().catch(error => {
  console.error('❌ Command failed:', error);
  process.exit(1);
});