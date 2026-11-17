import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError } from '@/utils/api'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'
import { isStaffRole } from '@/utils/roles'

const isValidUserId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function POST(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 4_096)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  const requestLimit = await rateLimit(request, { name: 'admin-resend-member-invitation', limit: 5, windowMs: 60 * 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)

  const studentId = (await params).studentId
  if (!isValidUserId(studentId)) return NextResponse.json({ error: 'Invalid member account.' }, { status: 400 })

  const sessionClient = await createClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError) return apiError('Unable to verify your staff session.', 401, authError)
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profileError) return apiError('Unable to verify staff access.', 500, profileError)
  if (!isStaffRole(profile?.role)) return NextResponse.json({ error: 'Librarian or administrator access required.' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server-side Supabase admin credentials are not configured.' }, { status: 503 })
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: memberProfile, error: memberProfileError } = await adminClient
    .from('profiles').select('id, role').eq('id', studentId).maybeSingle()
  if (memberProfileError) return apiError('Unable to verify the member account.', 500, memberProfileError)
  if (!memberProfile || !['student', 'faculty', 'librarian'].includes(memberProfile.role)) {
    return NextResponse.json({ error: 'Member account not found.' }, { status: 404 })
  }
  if (profile.role === 'librarian' && memberProfile.role === 'librarian') {
    return NextResponse.json({ error: 'Librarians may resend invitations for students and faculty only.' }, { status: 403 })
  }

  const { data: authMember, error: authMemberError } = await adminClient.auth.admin.getUserById(studentId)
  if (authMemberError || !authMember.user) return apiError('Unable to load the member authentication account.', 404, authMemberError)
  if (authMember.user.email_confirmed_at) {
    return NextResponse.json({ error: 'This member has already verified their email.' }, { status: 409 })
  }
  if (!authMember.user.email) return NextResponse.json({ error: 'This member account has no email address.' }, { status: 409 })

  const confirmationCallback = new URL('/auth/callback', process.env.NEXT_PUBLIC_SITE_URL || request.url)
  confirmationCallback.searchParams.set('next', '/reset-password?required=1')
  const { error: resendError } = await adminClient.auth.resend({
    type: 'signup',
    email: authMember.user.email,
    options: { emailRedirectTo: confirmationCallback.toString() },
  })
  if (resendError) return apiError('Unable to resend the verification email. Check Supabase Auth email delivery settings and try again.', 502, resendError)

  const { error: auditError } = await adminClient.from('audit_logs').insert({
    actor_id: user.id,
    action: 'member_confirmation_resent',
    target_type: 'profile',
    details: { target_user_id: studentId, target_role: memberProfile.role },
  })
  if (auditError) console.warn('Member invitation resend audit logging failed.', auditError)

  return NextResponse.json({ success: true, email: authMember.user.email })
}
