import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user && authError?.name === 'AuthSessionMissingError') {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }
  if (authError) {
    console.error('Notification authentication lookup failed.', authError)
    return NextResponse.json({ error: 'Unable to verify your session.' }, { status: 500 })
  }
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const { data, error } = await supabase
    .from('notifications')
    .select('id,event_type,title,message,reference_id,read_at,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 8_192)) return NextResponse.json({ error: 'Notification request is too large.' }, { status: 413 })
  const requestLimit = rateLimit(request, { name: 'notification-write', limit: 120, windowMs: 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user && authError?.name === 'AuthSessionMissingError') {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  }
  if (authError) {
    console.error('Notification update authentication lookup failed.', authError)
    return NextResponse.json({ error: 'Unable to verify your session.' }, { status: 500 })
  }
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  let body: { id?: unknown; read?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'The request body must be valid JSON.' }, { status: 400 })
  }
  const id = Number(body.id)
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'A valid notification id is required.' }, { status: 400 })
  if (body.read !== undefined && typeof body.read !== 'boolean') {
    return NextResponse.json({ error: 'The read field must be a boolean.' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: body.read === false ? null : new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id,read_at')
    .single()
  if (error) {
    console.error('Notification update failed.', error)
    return NextResponse.json({ error: 'Unable to update this notification.' }, { status: 500 })
  }
  return NextResponse.json(data)
}
