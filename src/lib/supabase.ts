import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * True when the app has credentials for the shared backend. When false every
 * data hook short-circuits into an explanatory empty state instead of throwing
 * `Invalid URL` deep inside supabase-js, which is what a missing .env used to
 * produce.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[BhoomiX Partner] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set. ' +
      'Copy .env.example to .env and point it at the same project as BhoomiX Main.',
  );
}

/**
 * Partner-side client for the shared BhoomiX project.
 *
 * The storage key is deliberately distinct from the Main app's default so that
 * a partner session and a customer session can coexist in the same browser
 * without evicting each other.
 */
export const supabase = createClient<Database>(
  SUPABASE_URL ?? 'http://localhost',
  SUPABASE_KEY ?? 'public-anon-key',
  {
    auth: {
      storage: typeof window === 'undefined' ? undefined : window.localStorage,
      storageKey: 'bhoomix-partner-auth',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
