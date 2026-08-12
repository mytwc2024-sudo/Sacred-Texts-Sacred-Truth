import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from './config.js';

/**
 * Server-side Supabase client using the service-role key.
 *
 * This bypasses Row Level Security, so it must ONLY ever run in trusted
 * server contexts (this pipeline, CI). Never expose this client or its key
 * to the browser / Lovable frontend — that uses the publishable key instead.
 */
export const supabase: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
