import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { EBOOKS_BUCKET, MAX_FILE_SIZE } from '@/utils/storage'
import { canDeleteGoogleDriveFile, deleteGoogleDriveFile, isGoogleDriveConfigured, uploadGoogleDrivePdf } from '@/utils/googleDrive'
import { apiError, boundedText } from '@/utils/api'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = createClient()
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
  const allowFallback = String(form.get('allow_fallback') || 'true') !== 'false'
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!['google_drive', 'supabase'].includes(requestedProvider)) return NextResponse.json({ error: 'Invalid storage provider.' }, { status: 400 })
  if (!(file instanceof File) || file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are supported.' }, { status: 400 })
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'PDF files must be between 1 byte and 50 MB.' }, { status: 400 })
  const safeName = (file.name || 'document.pdf').toLowerCase().replace(/[^a-z0-9.]+/g, '_').slice(-120) || 'document.pdf'
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return NextResponse.json({ error: 'The uploaded file is not a valid PDF.' }, { status: 400 })
  }

  if (requestedProvider === 'google_drive' && isGoogleDriveConfigured()) {
    try {
      const uploaded = await uploadGoogleDrivePdf({ buffer, fileName: `${Date.now()}_${safeName}`, ownerId: user.id, category })
      return NextResponse.json({ storage_provider: 'google_drive', storage_file_id: uploaded.fileId, file_name: uploaded.fileName, file_size: uploaded.fileSize, mime_type: uploaded.mimeType })
    } catch (error) {
      console.error('Google Drive upload failed.', error)
      if (!allowFallback) {
        return apiError('Google Drive upload failed. Try again or choose another storage provider.', 502, error)
      }
    }
  } else if (requestedProvider === 'google_drive' && !allowFallback) {
    return NextResponse.json({ error: 'Google Drive is not configured.' }, { status: 503 })
  }

  const folder = category.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'contributions'
  const path = `${folder}/${user.id}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from(EBOOKS_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (error) return apiError('Unable to store the uploaded PDF.', 500, error)
  return NextResponse.json({ storage_provider: 'supabase', storage_path: path, pdf_url: path, file_name: file.name, file_size: file.size, mime_type: 'application/pdf' })
}

export async function DELETE(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const fileId = new URL(request.url).searchParams.get('fileId')
  if (!user || !fileId || !isGoogleDriveConfigured()) return NextResponse.json({ error: 'Invalid cleanup request.' }, { status: 400 })
  try {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (!(await canDeleteGoogleDriveFile(fileId, user.id, profile?.role === 'admin'))) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 })
    await deleteGoogleDriveFile(fileId)
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Unable to clean up uploaded file.' }, { status: 500 }) }
}
