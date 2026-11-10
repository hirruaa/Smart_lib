import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { apiError } from '@/utils/api'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'
import { isStaffRole } from '@/utils/roles'

export const runtime = 'nodejs'

const bucket = 'student-headshots'
const maxPhotoBytes = 10 * 1024 * 1024
const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

async function getStaffContext() {
  const sessionClient = await createClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()
  if (authError && authError.name !== 'AuthSessionMissingError') {
    return { response: apiError('Unable to verify your session.', 500, authError) }
  }
  if (!user) return { response: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) }

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profileError) return { response: apiError('Unable to verify staff access.', 500, profileError) }
  if (!isStaffRole(profile?.role)) return { response: NextResponse.json({ error: 'Library staff access required.' }, { status: 403 }) }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return { response: NextResponse.json({ error: 'Server-side Supabase storage is not configured.' }, { status: 503 }) }
  }
  return {
    adminClient: createSupabaseClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  }
}

function isValidStudentId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(_request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const studentId = (await params).studentId
  if (!isValidStudentId(studentId)) return NextResponse.json({ error: 'Invalid member.' }, { status: 400 })

  const context = await getStaffContext()
  if ('response' in context) return context.response
  const { data: profile, error: profileError } = await context.adminClient
    .from('profiles').select('student_photo_path').eq('id', studentId).maybeSingle()
  if (profileError) return apiError('Unable to retrieve the member photo.', 500, profileError)
  if (!profile?.student_photo_path) return NextResponse.json({ error: 'No member photo has been uploaded.' }, { status: 404 })

  const { data, error } = await context.adminClient.storage.from(bucket).createSignedUrl(profile.student_photo_path, 60)
  if (error || !data?.signedUrl) return apiError('Unable to open the member photo.', 500, error)
  return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, maxPhotoBytes + 1024 * 1024)) {
    return NextResponse.json({ error: 'Photo file must be 10 MB or smaller.' }, { status: 413 })
  }
  const requestLimit = await rateLimit(request, { name: 'admin-member-photo', limit: 20, windowMs: 60 * 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)

  const studentId = (await params).studentId
  if (!isValidStudentId(studentId)) return NextResponse.json({ error: 'Invalid member.' }, { status: 400 })
  const context = await getStaffContext()
  if ('response' in context) return context.response

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('photo')
  if (!(file instanceof File) || file.size < 1 || file.size > maxPhotoBytes) {
    return NextResponse.json({ error: 'Choose a photo file no larger than 10 MB.' }, { status: 400 })
  }
  const extension = allowedTypes.get(file.type)
  if (!extension) return NextResponse.json({ error: 'Use a JPEG, PNG, or WebP photo.' }, { status: 400 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const hasValidSignature = file.type === 'image/jpeg'
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  if (!hasValidSignature) return NextResponse.json({ error: 'The file contents do not match the selected image type.' }, { status: 400 })

  const { data: profile, error: profileError } = await context.adminClient
    .from('profiles').select('student_photo_path').eq('id', studentId).maybeSingle()
  if (profileError) return apiError('Unable to verify the member account.', 500, profileError)
  if (!profile) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  const path = `${studentId}/headshot.${extension}`
  const { error: uploadError } = await context.adminClient.storage.from(bucket).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
    cacheControl: '60',
  })
  if (uploadError) return apiError('Unable to save the member photo.', 500, uploadError)

  const { error: updateError } = await context.adminClient.from('profiles')
    .update({ student_photo_path: path }).eq('id', studentId)
  if (updateError) {
    if (profile.student_photo_path !== path) {
      const { error: cleanupError } = await context.adminClient.storage.from(bucket).remove([path])
      if (cleanupError) console.error('Unable to clean up a member photo after its profile update failed.', cleanupError)
    }
    return apiError('Unable to link the photo to the member profile.', 500, updateError)
  }
  if (profile.student_photo_path && profile.student_photo_path !== path) {
    const { error: removeError } = await context.adminClient.storage.from(bucket).remove([profile.student_photo_path])
    if (removeError) console.error('Unable to remove the replaced member photo.', removeError)
  }
  return NextResponse.json({ success: true })
}
