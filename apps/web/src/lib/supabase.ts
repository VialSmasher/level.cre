import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Allow demo mode without Supabase credentials
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        persistSession: true,
        // The app completes PKCE on the dedicated /auth/callback route.
        // Auto-detecting sessions from the URL can race with that page and
        // cause the same auth code to be consumed twice.
        detectSessionInUrl: false,
      },
    })
  : null
