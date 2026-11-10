import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError, boundedText } from '@/utils/api'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'
import { isAdminRole, isStaffRole } from '@/utils/roles'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 16_384)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  const requestLimit = await rateLimit(request, { name: 'admin-create-member', limit: 20, windowMs: 60 * 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
  const sessionClient = await createClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return apiError('Unable to verify staff access.', 500, profileError)
  if (!isStaffRole(profile?.role)) return NextResponse.json({ error: 'Librarian or administrator access required.' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server-side Supabase admin credentials are not configured.' }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid student data.' }, { status: 400 })
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const initialPassword = typeof body.password === 'string' ? body.password : ''
  const role = body.role === 'faculty' || body.role === 'librarian' ? body.role : body.role === 'student' || body.role === undefined ? 'student' : null
  const fullName = boundedText(body.fullName ?? '', 120)
  const school = 'Mary the Queen College of Quezon City'
  const department = boundedText(body.department ?? '', 120)
  const course = boundedText(body.course ?? '', 120)
  const studentYear = boundedText(body.studentYear ?? '', 40)
  const institutionalIdInput = typeof body.institutionalId === 'string' ? body.institutionalId : ''
  const institutionalId = institutionalIdInput
  const identityVerified = body.identityVerified === true

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid member email.' }, { status: 400 })
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) return NextResponse.json({ error: 'Username must be 3–30 characters and use letters, numbers, periods, underscores, or hyphens.' }, { status: 400 })
  if (initialPassword.length < 12 || initialPassword.length > 128) return NextResponse.json({ error: 'Initial password must be between 12 and 128 characters.' }, { status: 400 })
  if (!role) return NextResponse.json({ error: 'Choose a valid member role.' }, { status: 400 })
  if (profile.role === 'librarian' && role === 'librarian') {
    return NextResponse.json({ error: 'Librarians may invite student and faculty members only.' }, { status: 403 })
  }
  if (profile.role === 'librarian' && !identityVerified) {
    return NextResponse.json({ error: 'Confirm that the member’s physical school ID was checked in person.' }, { status: 400 })
  }
  if (fullName === null || !fullName.trim()) return NextResponse.json({ error: 'Enter the member’s full name.' }, { status: 400 })
  if (role === 'faculty' && !department) return NextResponse.json({ error: 'Choose a faculty.' }, { status: 400 })
  if (role === 'student' && (!course || !studentYear)) {
    return NextResponse.json({ error: 'Choose a course program and year level for the student account.' }, { status: 400 })
  }
  if (role !== 'librarian' && !/^\d{5,8}$/.test(institutionalId)) {
    return NextResponse.json({ error: 'Enter an institutional ID using 5–8 digits only.' }, { status: 400 })
  }
  if (department === null || course === null || studentYear === null) {
    return NextResponse.json({ error: 'Profile details exceed the allowed length.' }, { status: 400 })
  }

  const adminClient = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: usernameMatch, error: usernameLookupError } = await adminClient
    .from('profiles').select('id').eq('username', username).limit(1).maybeSingle()
  if (usernameLookupError) {
    const usernameColumnMissing = usernameLookupError.code === '42703'
      || usernameLookupError.code === 'PGRST204'
      || /column .*username.* does not exist/i.test(usernameLookupError.message)
    return apiError(
      usernameColumnMissing
        ? 'Username accounts are not enabled in the database yet. Apply the admin-provisioned usernames migration, then try again.'
        : 'Unable to verify username availability.',
      503,
      usernameLookupError
    )
  }
  if (usernameMatch) return NextResponse.json({ error: 'That username is already in use.' }, { status: 409 })
  if (institutionalId) {
    const { data: idMatch, error: idLookupError } = await adminClient
      .from('profiles').select('id').eq('institutional_id', institutionalId).maybeSingle()
    if (idLookupError) return apiError('Unable to verify institutional ID availability.', 503, idLookupError)
    if (idMatch) return NextResponse.json({ error: 'That institutional ID is already assigned to another member.' }, { status: 409 })
  }
  if (role === 'faculty') {
    const { data: departmentChoice, error: departmentError } = await adminClient
      .from('academic_departments')
      .select('id')
      .eq('name', department)
      .eq('is_active', true)
      .maybeSingle()
    if (departmentError) return apiError('The faculty list is unavailable.', 503, departmentError)
    if (!departmentChoice) return NextResponse.json({ error: 'Choose an active faculty from the catalog.' }, { status: 400 })
  }
  if (role === 'student') {
    const { data: courseChoice, error: courseError } = await adminClient
      .from('academic_courses').select('id').eq('name', course).eq('is_active', true).maybeSingle()
    if (courseError) return apiError('Student course choices are unavailable.', 503, courseError)
    if (!courseChoice) return NextResponse.json({ error: 'Choose an active course program from the catalog.' }, { status: 400 })
    if (!['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].includes(studentYear)) {
      return NextResponse.json({ error: 'Choose a valid year level.' }, { status: 400 })
    }
  }
  const inviteCallback = new URL('/auth/callback', process.env.NEXT_PUBLIC_SITE_URL || request.url)
  inviteCallback.searchParams.set('next', '/reset-password?required=1')
  const { data: created, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteCallback.toString(),
    data: {
      full_name: fullName,
      username,
      member_type: role,
      school,
      department,
      course: role === 'student' ? course : '',
      student_year: role === 'student' ? studentYear : '',
      institutional_id: institutionalId || '',
    },
  })

  if (error) return apiError('Unable to send the account invitation. The email may already be registered or Auth email delivery may be unavailable.', 409, error)

  if (!created.user) return NextResponse.json({ error: 'The invitation was created without a member account. Contact an administrator.' }, { status: 500 })

  const { error: passwordSetupError } = await adminClient.auth.admin.updateUserById(created.user.id, {
    password: initialPassword,
    app_metadata: { ...created.user.app_metadata, must_change_password: true },
  })
  if (passwordSetupError) {
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id)
    if (rollbackError) console.error('Unable to roll back member invitation after initial password setup failed.', rollbackError)
    return apiError('Unable to set up the temporary account password.', 500, passwordSetupError)
  }

  {
    const { error: profileUpdateError } = await adminClient.from('profiles').update({
      full_name: fullName || null,
      username,
      school: school || null,
      department: department || null,
      course: role === 'student' ? course || null : null,
      student_year: role === 'student' ? studentYear || null : null,
      institutional_id: institutionalId || null,
      role,
    }).eq('id', created.user.id)
    if (profileUpdateError) {
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id)
      if (rollbackError) console.error('Unable to roll back member invitation after profile setup failed.', rollbackError)
      if (profileUpdateError.code === '23505' && /username/i.test(profileUpdateError.message)) {
        return NextResponse.json({ error: 'That username was just claimed. Choose another username and try again.' }, { status: 409 })
      }
      return apiError('Unable to save the invited member profile.', 500, profileUpdateError)
    }
  }

  const { error: auditError } = await adminClient.from('audit_logs').insert({
    actor_id: user.id,
    action: 'member_invited',
    target_type: 'profile',
    details: {
      target_user_id: created.user.id,
      role,
      identity_verified_in_person: profile.role === 'librarian' ? identityVerified : null,
      verification_method: profile.role === 'librarian' ? 'school_id_checked_in_person' : null,
    },
  })
  if (auditError) {
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id)
    if (rollbackError) console.error('Unable to roll back member invitation after audit logging failed.', rollbackError)
    return apiError('Unable to record the member invitation audit event.', 500, auditError)
  }

  return NextResponse.json({ success: true, email, username, userId: created.user.id })
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 4_096)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  const requestLimit = await rateLimit(request, { name: 'admin-delete-member', limit: 10, windowMs: 60 * 60_000 })
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
  // Use the authenticated admin session for the profile lookup. The service
  // client is intentionally reserved for Auth Admin API operations.
  const { data: targetProfile, error: targetProfileError } = await sessionClient
    .from('profiles')
    .select('role')
    .eq('id', targetUserId)
    .maybeSingle()

  if (targetProfileError) {
    console.error('Unable to load the member profile before deletion.', targetProfileError)
    return apiError('Unable to find the member account.', 500, targetProfileError)
  }
  if (!targetProfile) return NextResponse.json({ error: 'Member account not found.' }, { status: 404 })
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
