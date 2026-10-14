import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError, boundedText } from '@/utils/api'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'
import { isStaffRole } from '@/utils/roles'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 16_384)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  const requestLimit = rateLimit(request, { name: 'admin-create-member', limit: 20, windowMs: 60 * 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return apiError('Unable to verify administrator access.', 500, profileError)
  if (!isStaffRole(profile?.role)) return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server-side Supabase admin credentials are not configured.' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid student data.' }, { status: 400 })
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const role = body.role === 'faculty' || body.role === 'librarian' ? body.role : body.role === 'student' || body.role === undefined ? 'student' : null
  const fullName = boundedText(body.fullName ?? '', 120)
  const school = boundedText(body.school ?? '', 120)
  const department = boundedText(body.department ?? '', 120)
  const course = boundedText(body.course ?? '', 120)
  const studentYear = boundedText(body.studentYear ?? '', 40)

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid member email.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  if (!role) return NextResponse.json({ error: 'Choose a valid member role.' }, { status: 400 })
  if (fullName === null || school === null || department === null || course === null || studentYear === null) {
    return NextResponse.json({ error: 'Profile details exceed the allowed length.' }, { status: 400 })
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  if (role === 'faculty') {
    if (!department) return NextResponse.json({ error: 'Choose a department for the faculty account.' }, { status: 400 })
    const { data: departmentChoice, error: departmentError } = await adminClient
      .from('academic_departments')
      .select('id')
      .eq('name', department)
      .eq('is_active', true)
      .maybeSingle()
    if (departmentError) return apiError('Faculty departments are not configured. Apply the faculty signup migration first.', 503, departmentError)
    if (!departmentChoice) return NextResponse.json({ error: 'Choose an active department from the catalog.' }, { status: 400 })
  }
  const { data: created, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      member_type: role,
      school,
      department,
      course: role === 'student' ? course : '',
      student_year: role === 'student' ? studentYear : '',
    },
  })

  if (error) return apiError('Unable to create the member account. The email may already be registered.', 409, error)

  if (created.user) {
    const { error: profileUpdateError } = await adminClient.from('profiles').update({
      full_name: fullName || null,
      school: school || null,
      department: department || null,
      course: role === 'student' ? course || null : null,
      student_year: role === 'student' ? studentYear || null : null,
      role,
    }).eq('id', created.user.id)
    if (profileUpdateError) {
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id)
      if (rollbackError) console.error('Unable to roll back member creation after profile setup failed.', rollbackError)
      return apiError('Unable to save the new member profile.', 500, profileUpdateError)
    }
  }

  return NextResponse.json({ success: true, email })
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 4_096)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  const requestLimit = rateLimit(request, { name: 'admin-delete-member', limit: 10, windowMs: 60 * 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)

  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return apiError('Unable to verify administrator access.', 500, profileError)
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const targetUserId = body && typeof body === 'object' && typeof body.userId === 'string' ? body.userId.trim() : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return NextResponse.json({ error: 'A valid member account is required.' }, { status: 400 })
  }
  if (targetUserId === user.id) return NextResponse.json({ error: 'You cannot delete your own administrator account.' }, { status: 400 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server-side Supabase admin credentials are not configured.' }, { status: 503 })
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: targetProfile, error: targetProfileError } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle()

  if (targetProfileError) {
    console.error('Unable to load the member profile before deletion.', targetProfileError)
    return apiError('Unable to find the member account.', 500, targetProfileError)
  }
  if (!targetProfile) return NextResponse.json({ error: 'Member account not found.' }, { status: 404 })
  if (targetProfile.role === 'admin' || targetProfile.role === 'librarian') {
    return NextResponse.json({ error: 'Staff accounts cannot be deleted from member management.' }, { status: 403 })
  }

  const { data: targetAuthUser, error: targetAuthUserError } = await adminClient.auth.admin.getUserById(targetUserId)
  if (targetAuthUserError || !targetAuthUser.user) {
    if (targetAuthUserError) console.error('Unable to load the member auth account before deletion.', targetAuthUserError)
    return NextResponse.json({ error: 'The member authentication account could not be found.' }, { status: 404 })
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId)
  if (deleteError) {
    return apiError('Unable to delete this account. Existing borrowing or audit records may require the account to be retained.', 409, deleteError)
  }

  return NextResponse.json({ success: true, email: targetAuthUser.user.email ?? null })
}
