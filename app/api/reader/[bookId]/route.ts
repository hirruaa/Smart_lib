import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { streamGoogleDrivePdf } from '@/utils/googleDrive'
import { apiError } from '@/utils/api'
import { isStaffRole } from '@/utils/roles'

function parseRange(value: string | null, size: number | null) {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2])) return 'invalid'
  if (size === null) return { header: value }

  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return 'invalid'
  return { header: `bytes=${start}-${Math.min(end, size - 1)}` }
}

function responseHeaders(source?: Headers | Record<string, unknown>) {
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  for (const name of ['content-length', 'content-range', 'accept-ranges']) {
    const value = source instanceof Headers ? source.get(name) : source?.[name]
    if (typeof value === 'string') headers.set(name, value)
  }
  return headers
}

export async function GET(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const bookId = Number((await params).bookId)
  if (!Number.isInteger(bookId) || bookId < 1) return NextResponse.json({ error: 'Invalid resource.' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError && authError.name !== 'AuthSessionMissingError') {
    return apiError('Unable to verify your session.', 500, authError)
  }
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const isMissingTableError = (error: { code?: string; message?: string } | null) =>
    Boolean(error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')))

  const [
    { data: profile, error: profileError },
    { data: book, error: bookError },
    { data: ownedContribution, error: contributionError },
  ] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('books').select('id,pdf_url,storage_provider,storage_file_id,storage_path,catalog_type,file_size').eq('id', bookId).maybeSingle(),
    supabase.from('book_contributions').select('id').eq('approved_book_id', bookId).eq('user_id', user.id).eq('status', 'approved').maybeSingle(),
  ])
  if (profileError) return apiError('Unable to verify your library role.', 500, profileError)
  if (bookError) return apiError('Unable to retrieve this library resource.', 500, bookError)
  if (contributionError) return apiError('Unable to verify contribution access.', 500, contributionError)
  if (book?.catalog_type === 'physical') return NextResponse.json({ error: 'This title is only available as a physical library book.' }, { status: 409 })
  if (!book || (!book.pdf_url && !book.storage_file_id && !book.storage_path)) return NextResponse.json({ error: 'Resource unavailable.' }, { status: 404 })

  const isAdmin = isStaffRole(profile?.role)
  const isContributor = Boolean(ownedContribution)
  if (!isAdmin && !isContributor) {
    const [loanResult, grantResult] = await Promise.all([
      supabase.from('borrow_requests').select('id').eq('student_id', user.id).eq('book_id', bookId).eq('status', 'approved').is('returned_date', null).gt('due_date', new Date().toISOString()).maybeSingle(),
      supabase.from('book_access_grants').select('id').eq('student_id', user.id).eq('book_id', bookId).eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).maybeSingle(),
    ])
    if (loanResult.error) return apiError('Unable to verify your digital access.', 500, loanResult.error)
    if (grantResult.error && !isMissingTableError(grantResult.error)) {
      return apiError('Unable to verify temporary access.', 500, grantResult.error)
    }
    if (!loanResult.data && !grantResult.data) return NextResponse.json({ error: 'Active access required.' }, { status: 403 })
  }

  if (book.storage_provider === 'external' || (!book.storage_provider && book.pdf_url?.startsWith('http'))) {
    return NextResponse.json({ error: 'External resources must be migrated to protected library storage.' }, { status: 409 })
  }

  const fileSize = Number.isFinite(Number(book.file_size)) && Number(book.file_size) > 0 ? Number(book.file_size) : null
  const range = parseRange(request.headers.get('range'), fileSize)
  if (range === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: fileSize === null ? undefined : { 'Content-Range': `bytes */${fileSize}` },
    })
  }

  if (book.storage_provider === 'google_drive' && book.storage_file_id) {
    try {
      const file = await streamGoogleDrivePdf(book.storage_file_id, undefined, range?.header)
      const headers = responseHeaders(file.headers)
      if (range && file.status === 200) {
        return NextResponse.json({ error: 'The document provider did not honor the requested byte range.' }, { status: 502 })
      }
      return new Response(file.body, { status: file.status || 200, headers })
    } catch (error) {
      console.error('Unable to stream the protected Google Drive PDF.', error)
      return NextResponse.json({ error: 'Unable to retrieve the protected document.' }, { status: 502 })
    }
  }

  const cleanPath = (book.storage_path || book.pdf_url || '').replace(/^ebooks\//, '')
  const { data: signedFile, error } = await supabase.storage.from('ebooks').createSignedUrl(cleanPath, 60)
  if (error || !signedFile) {
    console.error('Unable to create a protected PDF read URL.', error)
    return NextResponse.json({ error: 'Unable to retrieve the protected document.' }, { status: 502 })
  }
  const upstream = await fetch(signedFile.signedUrl, {
    headers: range ? { Range: range.header } : undefined,
    cache: 'no-store',
  })
  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) {
    console.error('Protected PDF storage returned an unsuccessful response.', upstream.status)
    return NextResponse.json({ error: 'Unable to retrieve the protected document.' }, { status: 502 })
  }
  if (range && upstream.status === 200) {
    return NextResponse.json({ error: 'The document provider did not honor the requested byte range.' }, { status: 502 })
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders(upstream.headers),
  })
}
