import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { EBOOKS_BUCKET, MAX_FILE_SIZE } from '@/utils/storage'
import { apiError, boundedText } from '@/utils/api'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'
import { isAdminRole } from '@/utils/roles'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 55 * 1024 * 1024)) return NextResponse.json({ error: 'Upload request is too large.' }, { status: 413 })
  const requestLimit = rateLimit(request, { name: 'ebook-upload', limit: 5, windowMs: 60 * 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  let form: FormData
  try {
    form = await request.formData()
  } catch (error) {
    return apiError('The upload request could not be read.', 400, error)
  }
  const file = form.get('file')
  const categoryInput = boundedText(form.get('category') || 'Contributions', 60)
  const category = categoryInput || 'Contributions'
  const requestedProvider = String(form.get('provider') || 'supabase')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const role = profile?.role
  if (!isAdminRole(role) && role !== 'faculty') {
    return NextResponse.json({ error: 'Only administrators and faculty may upload library materials.' }, { status: 403 })
  }
  if (role === 'faculty' && category.toLowerCase() !== 'contributions') {
    return NextResponse.json({ error: 'Faculty uploads are limited to supplementary course materials.' }, { status: 403 })
  }
  if (requestedProvider !== 'supabase') return NextResponse.json({ error: 'Only college library storage is available.' }, { status: 400 })
  const isbn = boundedText(form.get('isbn') || '', 32)
  if (role === 'admin' && category.toLowerCase() !== 'contributions' && (!isbn || !isbn.trim())) return NextResponse.json({ error: 'ISBN is required for catalog books.' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF or EPUB book file.' }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Book files must be between 1 byte and 50 MB.' }, { status: 400 })
  const extension = file.name.split('.').pop()?.toLowerCase()
  const isPdf = extension === 'pdf' && file.type === 'application/pdf'
  const isEpub = extension === 'epub' && file.type === 'application/epub+zip'
  if (!isPdf && !isEpub) return NextResponse.json({ error: 'Only PDF and EPUB book files are accepted.' }, { status: 400 })
  const safeName = (file.name || (isEpub ? 'book.epub' : 'book.pdf')).toLowerCase().replace(/[^a-z0-9.]+/g, '_').slice(-120) || (isEpub ? 'book.epub' : 'book.pdf')
  const buffer = Buffer.from(await file.arrayBuffer())
  if (isPdf && (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-')) {
    return NextResponse.json({ error: 'The uploaded file is not a valid PDF.' }, { status: 400 })
  }
  if (isEpub && (buffer.subarray(0, 2).toString('ascii') !== 'PK' || !buffer.includes(Buffer.from('application/epub+zip')) || !buffer.includes(Buffer.from('META-INF/container.xml')))) {
    return NextResponse.json({ error: 'The uploaded file is not a valid EPUB book.' }, { status: 400 })
  }

  const folder = category.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'contributions'
  const path = `${folder}/${user.id}/${Date.now()}_${safeName}`
  const mimeType = isEpub ? 'application/epub+zip' : 'application/pdf'
  const { error } = await supabase.storage.from(EBOOKS_BUCKET).upload(path, file, { contentType: mimeType, upsert: false })
  if (error) return apiError('Unable to store the uploaded book file.', 500, error)
  return NextResponse.json({ storage_provider: 'supabase', storage_path: path, pdf_url: path, file_name: file.name, file_size: file.size, mime_type: mimeType })
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  const requestLimit = rateLimit(request, { name: 'upload-cleanup', limit: 20, windowMs: 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return NextResponse.json({ error: 'External provider cleanup is no longer available.' }, { status: 410 })
}
