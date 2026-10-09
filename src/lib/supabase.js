import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** True when the two public env vars are present. The UI shows a setup screen otherwise. */
export const isConfigured = Boolean(url && anonKey)

// Only the PUBLIC anon key is used in the browser. Every permission is enforced
// by Postgres row level security and SECURITY DEFINER functions.
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null
