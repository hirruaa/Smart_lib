import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError, boundedText } from '@/utils/api'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'
import { isAdminRole } from '@/utils/roles'

export const runtime = 'nodejs'

const isValidUserId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

async function getAdminContext() {
  const sessionClient = await createClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError) return { response: apiError('Unable to verify your administrator session.', 401, authError) }
  if (!user) return { response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profileError) return { response: apiError('Unable to verify administrator access.', 500, profileError) }
  if (!isAdminRole(profile?.role)) return { response: NextResponse.json({ error: 'Administrator access required.' }, { status: 403 }) }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return { response: NextResponse.json({ error: 'Server-side Supabase admin credentials are not configured.' }, { status: 503 }) }
  }

  return {
    actorId: user.id,
    adminClient: createSupabaseClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  }
}

async function getMember(adminClient: SupabaseClient, studentId: string) {
  const { data: profile, error: profileError } = await adminClient
    .from('profiles').select('id,role,email,full_name').eq('id', studentId).maybeSingle()
  if (profileError) return { response: apiError('Unable to find the member profile.', 500, profileError) }
  if (!profile) return { response: NextResponse.json({ error: 'Member account not found.' }, { status: 404 }) }
  if (profile.role === 'admin') return { response: NextResponse.json({ error: 'Administrator accounts cannot be suspended here.' }, { status: 403 }) }

  const { data, error } = await adminClient.auth.admin.getUserById(studentId)
  if (error || !data.user) return { response: apiError('Unable to load the member authentication status.', 404, error) }
  const bannedUntil = data.user.banned_until ?? null
  const suspended = Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now())

  return { profile, suspended, bannedUntil }
}

export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const studentId = (await params).studentId
  if (!isValidUserId(studentId)) return NextResponse.json({ error: 'Invalid member account.' }, { status: 400 })
  const context = await getAdminContext()
  if ('response' in context) return context.response

  const member = await getMember(context.adminClient, studentId)
  if ('response' in member) return member.response
  return NextResponse.json({ suspended: member.suspended, bannedUntil: member.bannedUntil })
}

export async function POST(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 4_096)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  const requestLimit = rateLimit(request, { name: 'admin-member-suspension', limit: 20, windowMs: 60 * 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)

  const studentId = (await params).studentId
  if (!isValidUserId(studentId)) return NextResponse.json({ error: 'Invalid member account.' }, { status: 400 })
  const context = await getAdminContext()
  if ('response' in context) return context.response
  if (context.actorId === studentId) return NextResponse.json({ error: 'You cannot suspend your own account.' }, { status: 400 })

  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid suspension request.' }, { status: 400 })
  const payload = body as { suspended?: unknown; reason?: unknown }
  if (typeof payload.suspended !== 'boolean') return NextResponse.json({ error: 'Choose whether to suspend or restore the account.' }, { status: 400 })
  const reason = boundedText(payload.reason, 500)
  if (reason === null || reason.length < 3) return NextResponse.json({ error: 'Enter a reason of 3 to 500 characters.' }, { status: 400 })

  const member = await getMember(context.adminClient, studentId)
  if ('response' in member) return member.response
  if (member.suspended === payload.suspended) {
    return NextResponse.json({ error: payload.suspended ? 'This account is already suspended.' : 'This account is already active.' }, { status: 409 })
  }

  const action = payload.suspended ? 'member_account_suspended' : 'member_account_unsuspended'
  const { data: auditEntry, error: auditError } = await context.adminClient
    .from('audit_logs')
    .insert({
      actor_id: context.actorId,
      action,
      target_type: 'profile',
      details: {
        target_user_id: studentId,
        target_email: member.profile.email,
        target_role: member.profile.role,
        reason,
        previous_banned_until: member.bannedUntil,
        suspended: payload.suspended,
      },
    })
    .select('id')
    .single()
  if (auditError || !auditEntry) return apiError('Unable to record the account-access audit event.', 500, auditError)

  const { data: updated, error: updateError } = await context.adminClient.auth.admin.updateUserById(studentId, {
    ban_duration: payload.suspended ? '876000h' : 'none',
  })
  if (updateError || !updated.user) {
    const { error: cleanupError } = await context.adminClient.from('audit_logs').delete().eq('id', auditEntry.id)
    if (cleanupError) console.error('Unable to remove the audit event for a failed account suspension change.', cleanupError)
    return apiError('Unable to update the member account suspension.', 500, updateError)
  }

  const bannedUntil = updated.user.banned_until ?? null
  return NextResponse.json({
    success: true,
    suspended: Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now()),
    bannedUntil,
    auditEventId: auditEntry.id,
  })
}
