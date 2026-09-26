import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const { data, error } = await supabase
    .from('notifications')
    .select('id,event_type,title,message,reference_id,read_at,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PATCH(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'A valid notification id is required.' }, { status: 400 })
  const { data, error } = await supabase
    .from('notifications')
    .update({ read_at: body.read === false ? null : new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id,read_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
