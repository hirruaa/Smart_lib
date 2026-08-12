import { createClient as createBrowserClient, type SupabaseClient } from '@supabase/supabase-js'

declare global {
  // eslint-disable-next-line no-var
  var __supabase_client: SupabaseClient | undefined
}

export function createClient() {
  if (typeof window === 'undefined') {
    throw new Error('createClient() should only be used in the browser')
  }

  if (!global.__supabase_client) {
    global.__supabase_client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          detectSessionInUrl: true,
        },
      }
    )
  }

  return global.__supabase_client
}
