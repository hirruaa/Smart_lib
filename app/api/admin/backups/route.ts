import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { createGoogleDriveBackup } from '@/utils/googleDriveBackup'
import { rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'
import { isStaffRole } from '@/utils/roles'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  const requestLimit = rateLimit(request, { name: 'admin-backup', limit: 2, windowMs: 60 * 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
  const sessionClient = await createClient()
  const { data: { user }, error: userError } = await sessionClient.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    console.error('Unable to verify administrator role for backup.', profileError)
    return NextResponse.json({ error: 'Unable to verify administrator access.' }, { status: 500 })
  }
  if (!isStaffRole(profile?.role)) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 })

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Supabase service configuration is missing.' }, { status: 503 })

  try {
    const supabase = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const backup = await createGoogleDriveBackup(supabase)
    return NextResponse.json({ success: true, backup })
  } catch (error) {
    console.error('Administrator-triggered Google Drive backup failed.', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Google Drive backup failed.' }, { status: 500 })
  }
}
