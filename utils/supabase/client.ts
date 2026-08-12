import { createClient as createBrowserClient, type SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

export function createClient() {
  if (typeof window === 'undefined') {
    throw new Error('createClient() should only be used in the browser')
  }

  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    }

    supabaseClient = createBrowserClient(url, key, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  }

  return supabaseClient
}
