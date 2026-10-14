import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { downloadGoogleDrivePdf } from '@/utils/googleDrive'
import { apiError } from '@/utils/api'
import { isStaffRole } from '@/utils/roles'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ contributionId: string }> }) {
  const contributionId = Number((await params).contributionId)
  if (!Number.isInteger(contributionId) || contributionId < 1) {
    return NextResponse.json({ error: 'Invalid contribution.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError && authError.name !== 'AuthSessionMissingError') {
    return apiError('Unable to verify your session.', 500, authError)
  }
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const [
    { data: profile, error: profileError },
    { data: contribution, error: contributionError },
  ] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('book_contributions').select('id,user_id,pdf_url,storage_provider,storage_file_id,storage_path,file_name,mime_type').eq('id', contributionId).maybeSingle(),
  ])
  if (profileError) return apiError('Unable to verify your library role.', 500, profileError)
  if (contributionError) return apiError('Unable to retrieve this contribution.', 500, contributionError)
  if (!contribution) return NextResponse.json({ error: 'Contribution not found.' }, { status: 404 })
  if (!isStaffRole(profile?.role) && contribution.user_id !== user.id) {
    return NextResponse.json({ error: 'You are not allowed to open this contribution.' }, { status: 403 })
  }

  if (contribution.storage_provider === 'google_drive' && contribution.storage_file_id) {
    try {
      const bytes = await downloadGoogleDrivePdf(contribution.storage_file_id, contribution.user_id)
      return new Response(bytes as unknown as BodyInit, {
        headers: {
          'Content-Type': contribution.mime_type || 'application/pdf',
          'Content-Disposition': `inline; filename="${(contribution.file_name || 'contribution.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (error) {
      return apiError('Unable to retrieve the Google Drive file.', 502, error)
    }
  }

  const path = (contribution.storage_path || contribution.pdf_url || '').replace(/^ebooks\//, '')
  const ownerPrefix = `contributions/${contribution.user_id}/`
  if (/^https?:\/\//i.test(path)) {
    return NextResponse.json({ error: 'External contribution files are not supported. Upload the PDF to library storage.' }, { status: 409 })
  }
  if (!path || !path.startsWith(ownerPrefix) || path.split('/').some((segment: string) => segment === '.' || segment === '..')) {
    return NextResponse.json({ error: 'Contribution file is unavailable.' }, { status: 404 })
  }

  const { data: file, error } = await supabase.storage.from('ebooks').download(path)
  if (error) return apiError('Unable to retrieve the stored file.', 502, error)
  if (!file) return NextResponse.json({ error: 'Contribution file is unavailable.' }, { status: 404 })
  return new Response(await file.arrayBuffer(), {
    headers: {
      'Content-Type': contribution.mime_type || 'application/pdf',
      'Content-Disposition': `inline; filename="${(contribution.file_name || 'contribution.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
