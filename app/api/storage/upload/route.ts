import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { EBOOKS_BUCKET, MAX_FILE_SIZE } from '@/utils/storage'
import { canDeleteGoogleDriveFile, deleteGoogleDriveFile, isGoogleDriveConfigured, uploadGoogleDrivePdf } from '@/utils/googleDrive'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const form = await request.formData()
  const file = form.get('file')
  const category = String(form.get('category') || 'Contributions')
  const requestedProvider = String(form.get('provider') || 'google_drive')
  const allowFallback = String(form.get('allow_fallback') || 'true') !== 'false'
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!['google_drive', 'supabase'].includes(requestedProvider)) return NextResponse.json({ error: 'Invalid storage provider.' }, { status: 400 })
  if (!(file instanceof File) || file.type !== 'application/pdf') return NextResponse.json({ error: 'Only PDF files are supported.' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'PDF files must be 50 MB or smaller.' }, { status: 400 })
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '_')
  const buffer = Buffer.from(await file.arrayBuffer())

  if (requestedProvider === 'google_drive' && isGoogleDriveConfigured()) {
    try {
      const uploaded = await uploadGoogleDrivePdf({ buffer, fileName: `${Date.now()}_${safeName}`, ownerId: user.id, category })
      return NextResponse.json({ storage_provider: 'google_drive', storage_file_id: uploaded.fileId, file_name: uploaded.fileName, file_size: uploaded.fileSize, mime_type: uploaded.mimeType })
    } catch (error) {
      console.error('Google Drive upload failed.', error)
      if (!allowFallback) {
        const message = error instanceof Error ? error.message : 'Unknown Google Drive error.'
        return NextResponse.json({ error: `Google Drive upload failed: ${message}` }, { status: 502 })
      }
    }
  } else if (requestedProvider === 'google_drive' && !allowFallback) {
    return NextResponse.json({ error: 'Google Drive is not configured.' }, { status: 503 })
  }

  const folder = category.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'contributions'
  const path = `${folder}/${user.id}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from(EBOOKS_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
