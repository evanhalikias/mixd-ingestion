import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Service role client for ingestion operations
// This client has full access and bypasses RLS policies
export function createServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Singleton instance for the service
let serviceClient: ReturnType<typeof createServiceClient> | null = null;

export function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createServiceClient();
  }
  return serviceClient;
}