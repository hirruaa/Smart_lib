import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError } from '@/utils/api'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 2_048)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  const limit = rateLimit(request, { name: 'username-login', limit: 8, windowMs: 60_000 })
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds)

  const body = await request.json().catch(() => null)
  const username = body && typeof body === 'object' && typeof body.username === 'string'
    ? body.username.trim().toLowerCase()
    : ''
  const password = body && typeof body === 'object' && typeof body.password === 'string'
    ? body.password
    : ''
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username) || password.length < 1 || password.length > 256) {
    return NextResponse.json({ error: 'The username/email or password is incorrect.' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) return NextResponse.json({ error: 'Username sign-in is not configured.' }, { status: 503 })

  const lookupClient = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: profile, error: lookupError } = await lookupClient
    .from('profiles')
    .select('email')
    .eq('username', username)
    .maybeSingle()
  if (lookupError) return apiError('Unable to sign in right now.', 503, lookupError)
  if (!profile?.email) return NextResponse.json({ error: 'The username/email or password is incorrect.' }, { status: 401 })

  // Supabase Auth remains the credential verifier and session issuer. The
  // service key is used only to resolve the private username-to-email mapping.
  const sessionClient = await createClient()
  const { error: signInError } = await sessionClient.auth.signInWithPassword({ email: profile.email, password })
  if (signInError) return NextResponse.json({ error: 'The username/email or password is incorrect.' }, { status: 401 })

  return NextResponse.json({ success: true })
}
