import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | null = null

/**
 * Returns the browser Supabase client, or null if env vars are missing.
 * NEXT_PUBLIC_* vars must be present at build time in Vercel — they are
 * inlined by Webpack and cannot be injected at runtime.
 */
export function createClient(): SupabaseClient | null {
  if (typeof window === 'undefined') {
    // SSR context — caller should use utils/supabase/server.ts instead
    return null
  }

  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      console.error(
        '[SmartLib] Supabase env vars are missing from the browser bundle.\n' +
        'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set\n' +
        'in Vercel → Project Settings → Environment Variables BEFORE deploying.\n' +
        'Trigger a new deployment after adding them.'
      )
      return null
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

/**
 * Returns the browser Supabase client. Throws a friendly error if env vars
 * were not baked in at build time. Use this in components that require auth.
 * Alias kept for backwards compatibility with existing call sites.
 */
export function getSupabase(): SupabaseClient {
  const client = createClient()
  if (!client) {
    throw new Error(
      'Supabase is not configured. ' +
      'Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
      'are set in Vercel → Project Settings → Environment Variables, ' +
      'then trigger a new deployment.'
    )
  }
  return client
}
