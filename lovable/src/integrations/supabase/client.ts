import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Supabase client for the AKST Lovable frontend.
 *
 * Project: EXTRA Ankhor MasterHub (xhzyavyftgyqzftlqdlz).
 * Uses the PUBLISHABLE key — safe to ship to the browser; all access is
 * governed by Row Level Security (public read of is_public rows only).
 * The service-role key must NEVER appear in frontend code.
 *
 * You can override these at build time with Vite env vars
 * (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY) if you prefer.
 */
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://xhzyavyftgyqzftlqdlz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable___8SYEYZIGYNjArtl6Nujg_nTeXwYOi';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
