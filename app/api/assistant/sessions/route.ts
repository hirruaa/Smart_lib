import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (sessionId) {
    const { data, error } = await supabase
      .from('assistant_messages')
      .select('id, role, content, results, loans, created_at')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ messages: data ?? [] })
  }

  const { data, error } = await supabase
    .from('assistant_sessions')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  if (body.sessionId) {
    const { error } = await supabase.from('assistant_messages').insert({
      session_id: body.sessionId,
      user_id: user.id,
      role: body.role,
      content: body.content,
      results: body.results ?? [],
      loans: body.loans ?? [],
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('assistant_sessions').update({ updated_at: new Date().toISOString() }).eq('id', body.sessionId).eq('user_id', user.id)
    return NextResponse.json({ success: true })
  }

  const { data, error } = await supabase.from('assistant_sessions').insert({ user_id: user.id, title: body.title || 'New research chat' }).select('id, title').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}