import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

async function runPhysicalMaintenance(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Physical reminder job is not configured.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Supabase service configuration is missing.' }, { status: 503 })
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data, error } = await supabase.rpc('system_run_maintenance')
  if (error) {
    console.error('Library maintenance job failed.', error)
    return NextResponse.json({ error: 'Unable to process scheduled library maintenance.' }, { status: 500 })
  }
  return NextResponse.json(data ?? { processed: 0, fines_updated: 0 })
}

// Vercel Cron calls scheduled routes with GET. Keep POST for manual/internal
// callers that already use the original endpoint.
export async function GET(request: Request) {
  return runPhysicalMaintenance(request)
}

export async function POST(request: Request) {
  return runPhysicalMaintenance(request)
}
