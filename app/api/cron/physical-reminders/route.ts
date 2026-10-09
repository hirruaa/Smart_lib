import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Physical reminder job is not configured.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Supabase service configuration is missing.' }, { status: 503 })
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await supabase.rpc('system_process_physical_reminders')
  if (error) {
    console.error('Physical reminder job failed.', error)
    return NextResponse.json({ error: 'Unable to process physical-loan reminders.' }, { status: 500 })
  }
  return NextResponse.json({ processed: Number(data) || 0 })
}
