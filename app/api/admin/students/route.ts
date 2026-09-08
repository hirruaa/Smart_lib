import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: Request) {
  const sessionClient = createClient()
  const { data: { user } } = await sessionClient.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const { data: profile, error: profileError } = await sessionClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server-side Supabase admin credentials are not configured.' }, { status: 503 })
  }

  const body = await request.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const fullName = String(body.fullName ?? '').trim()

  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Enter a valid student email.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  const adminClient = createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: created, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'student' },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 409 })

  if (created.user && fullName) {
    await adminClient.from('profiles').update({ full_name: fullName }).eq('id', created.user.id)
  }

  return NextResponse.json({ success: true, email })
}
