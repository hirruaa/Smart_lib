import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError } from '@/utils/api'
import { rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'
import { isStaffRole } from '@/utils/roles'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  if (!sameOrigin(request)) return originViolation()

  const username = new URL(request.url).searchParams.get('username')?.trim().toLowerCase() ?? ''
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
    return NextResponse.json({ error: 'Enter a valid username.' }, { status: 400 })
  }

  const sessionClient = await createClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError) return apiError('Unable to verify your staff session.', 401, authError)
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) return apiError('Unable to verify staff access.', 500, profileError)
  if (!isStaffRole(profile?.role)) {
    return NextResponse.json({ error: 'Librarian or administrator access required.' }, { status: 403 })
  }

  const requestLimit = await rateLimit(request, {
    name: 'admin-username-availability',
    limit: 60,
    windowMs: 60_000,
    identity: user.id,
  })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server-side Supabase admin credentials are not configured.' }, { status: 503 })
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await adminClient
    .from('profiles')
    .select('id')
    .eq('username', username)
    .limit(1)
    .maybeSingle()

  if (error) return apiError('Unable to verify username availability.', 503, error)
  return NextResponse.json({ available: !data })
}
