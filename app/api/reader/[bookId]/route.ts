import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { downloadGoogleDrivePdf } from '@/utils/googleDrive'

function parseRange(value: string | null, size: number) {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2])) return null
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[2] ? Number(match[2]) : size - 1
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return 'invalid'
  return { start, end: Math.min(end, size - 1) }
}

export async function GET(request: Request, { params }: { params: { bookId: string } }) {
  const bookId = Number(params.bookId)
  if (!Number.isInteger(bookId) || bookId < 1) return NextResponse.json({ error: 'Invalid resource.' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const [{ data: profile }, { data: book }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('books').select('id,pdf_url,storage_provider,storage_file_id,storage_path').eq('id', bookId).maybeSingle(),
  ])
  if (!book || (!book.pdf_url && !book.storage_file_id && !book.storage_path)) return NextResponse.json({ error: 'Resource unavailable.' }, { status: 404 })

  const isAdmin = profile?.role === 'admin'
  if (!isAdmin) {
    const [{ data: loan }, { data: grant }] = await Promise.all([
      supabase.from('borrow_requests').select('id').eq('student_id', user.id).eq('book_id', bookId).eq('status', 'approved').is('returned_date', null).gt('due_date', new Date().toISOString()).maybeSingle(),
      supabase.from('book_access_grants').select('id').eq('student_id', user.id).eq('book_id', bookId).eq('status', 'active').gt('expires_at', new Date().toISOString()).maybeSingle(),
    ])
    if (!loan && !grant) return NextResponse.json({ error: 'Active access required.' }, { status: 403 })
  }

  if (book.storage_provider === 'external' || (!book.storage_provider && book.pdf_url?.startsWith('http'))) {
    return NextResponse.json({ error: 'External resources must be migrated to protected library storage.' }, { status: 409 })
  }

  let bytes: Uint8Array
  if (book.storage_provider === 'google_drive' && book.storage_file_id) {
    try { bytes = new Uint8Array(await downloadGoogleDrivePdf(book.storage_file_id)) } catch { return NextResponse.json({ error: 'Unable to retrieve the protected document.' }, { status: 404 }) }
  } else {
    const cleanPath = (book.storage_path || book.pdf_url || '').replace(/^ebooks\//, '')
    const { data: file, error } = await supabase.storage.from('ebooks').download(cleanPath)
    if (error || !file) return NextResponse.json({ error: 'Unable to retrieve the protected document.' }, { status: 404 })
    bytes = new Uint8Array(await file.arrayBuffer())
  }
  const range = parseRange(request.headers.get('range'), bytes.byteLength)
  if (range === 'invalid') return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.byteLength}` } })
  const headers = new Headers({ 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
  if (!range) {
    headers.set('Content-Length', String(bytes.byteLength))
    return new Response(bytes as unknown as BodyInit, { status: 200, headers })
  }
  const chunk = bytes.slice(range.start, range.end + 1)
  headers.set('Content-Length', String(chunk.byteLength))
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${bytes.byteLength}`)
  return new Response(chunk as unknown as BodyInit, { status: 206, headers })
}
