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

  const body = await request.json().catch(() => ({}))
  if (body.sessionId) {
    const sessionId = String(body.sessionId)
    const role = body.role === 'user' || body.role === 'assistant' ? body.role : null
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!sessionId || !role || !content || content.length > 12000) {
      return NextResponse.json({ error: 'Invalid assistant message.' }, { status: 400 })
    }
    const { data: ownedSession, error: sessionError } = await supabase
      .from('assistant_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (sessionError) return NextResponse.json({ error: 'Unable to verify assistant session.' }, { status: 500 })
    if (!ownedSession) return NextResponse.json({ error: 'Assistant session not found.' }, { status: 404 })

    const { error } = await supabase.from('assistant_messages').insert({
      session_id: sessionId,
      user_id: user.id,
      role,
      content,
      results: body.results ?? [],
      loans: body.loans ?? [],
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('assistant_sessions').update({ updated_at: new Date().toISOString() }).eq('id', body.sessionId).eq('user_id', user.id)
    return NextResponse.json({ success: true })
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : ''
  const { data, error } = await supabase.from('assistant_sessions').insert({ user_id: user.id, title: title || 'New research chat' }).select('id, title').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}

export async function DELETE(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!sessionId) return NextResponse.json({ error: 'Assistant session is required.' }, { status: 400 })

  const { data: ownedSession, error: lookupError } = await supabase
    .from('assistant_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!ownedSession) return NextResponse.json({ error: 'Assistant conversation not found.' }, { status: 404 })

  const { error } = await supabase
    .from('assistant_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: remainingSession, error: verifyError } = await supabase
    .from('assistant_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (verifyError) return NextResponse.json({ error: verifyError.message }, { status: 500 })
  if (remainingSession) return NextResponse.json({ error: 'Conversation could not be deleted. Check the assistant_sessions delete policy in Supabase.' }, { status: 500 })
  return NextResponse.json({ success: true, deletedSessionId: sessionId })
}
