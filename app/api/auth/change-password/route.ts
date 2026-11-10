import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError } from '@/utils/api'
import { bodyTooLarge, originViolation, rateLimit, sameOrigin, tooManyRequests } from '@/utils/requestSecurity'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 2_048)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })

  const sessionClient = await createClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError) return apiError('Unable to verify your account.', 401, authError)
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const limit = await rateLimit(request, { name: 'change-password', limit: 5, windowMs: 15 * 60_000, identity: user.id })
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds)

  const body = await request.json().catch(() => null)
  const password = body && typeof body === 'object' && typeof body.password === 'string' ? body.password : ''
  if (password.length < 12 || password.length > 128) {
    return NextResponse.json({ error: 'Password must be between 12 and 128 characters.' }, { status: 400 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Password updates are not configured on the server.' }, { status: 503 })
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: authUser, error: authLookupError } = await adminClient.auth.admin.getUserById(user.id)
  if (authLookupError) return apiError('Unable to verify your account.', 500, authLookupError)
  if (!authUser.user) return NextResponse.json({ error: 'Your account could not be found.' }, { status: 404 })

  const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
    password,
    app_metadata: { ...authUser.user.app_metadata, must_change_password: false },
  })
  if (updateError) return apiError('Unable to update your password.', 400, updateError)

  return NextResponse.json({ success: true })
}
