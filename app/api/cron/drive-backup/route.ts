import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createGoogleDriveBackup } from '@/utils/googleDriveBackup'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Drive backup job is not configured.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Supabase service configuration is missing.' }, { status: 503 })

  try {
    const supabase = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const backup = await createGoogleDriveBackup(supabase)
    return NextResponse.json({ success: true, backup })
  } catch (error) {
    console.error('Google Drive backup failed.', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Google Drive backup failed.' }, { status: 500 })
  }
}
