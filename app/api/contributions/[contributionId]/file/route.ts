import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { downloadGoogleDrivePdf } from '@/utils/googleDrive'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: { contributionId: string } }) {
  const contributionId = Number(params.contributionId)
  if (!Number.isInteger(contributionId) || contributionId < 1) {
    return NextResponse.json({ error: 'Invalid contribution.' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const [{ data: profile }, { data: contribution }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('book_contributions').select('id,user_id,pdf_url,storage_provider,storage_file_id,storage_path,file_name,mime_type').eq('id', contributionId).maybeSingle(),
  ])
  if (!contribution) return NextResponse.json({ error: 'Contribution not found.' }, { status: 404 })
  if (profile?.role !== 'admin' && contribution.user_id !== user.id) {
    return NextResponse.json({ error: 'You are not allowed to open this contribution.' }, { status: 403 })
  }

  if (contribution.storage_provider === 'google_drive' && contribution.storage_file_id) {
    try {
      const bytes = await downloadGoogleDrivePdf(contribution.storage_file_id)
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          'Content-Type': contribution.mime_type || 'application/pdf',
          'Content-Disposition': `inline; filename="${(contribution.file_name || 'contribution.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return NextResponse.json({ error: 'Unable to retrieve the Google Drive file.' }, { status: 404 })
    }
  }

  const path = (contribution.storage_path || contribution.pdf_url || '').replace(/^ebooks\//, '')
  if (!path || path.startsWith('http://') || path.startsWith('https://')) {
    if (path.startsWith('http://') || path.startsWith('https://')) return NextResponse.redirect(path)
    return NextResponse.json({ error: 'Contribution file is unavailable.' }, { status: 404 })
  }

  const { data: file, error } = await supabase.storage.from('ebooks').download(path)
  if (error || !file) return NextResponse.json({ error: 'Unable to retrieve the stored file.' }, { status: 404 })
  return new Response(await file.arrayBuffer(), {
    headers: {
      'Content-Type': contribution.mime_type || 'application/pdf',
      'Content-Disposition': `inline; filename="${(contribution.file_name || 'contribution.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
