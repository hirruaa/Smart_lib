import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const bookId = url.searchParams.get('book_id')

  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = supabase.from('study_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (bookId) query = query.eq('book_id', Number(bookId))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { book_id, page, text, selection_text, meta } = body
  const payload: any = {
    user_id: user.id,
    book_id: book_id ? Number(book_id) : null,
    page: page ? Number(page) : null,
    text: text ?? null,
    selection_text: selection_text ?? null,
    meta: meta ?? {}
  }

  const { data, error } = await supabase.from('study_notes').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, text, selection_text, page, meta } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const updates: any = {}
  if (text !== undefined) updates.text = text
  if (selection_text !== undefined) updates.selection_text = selection_text
  if (page !== undefined) updates.page = page
  if (meta !== undefined) updates.meta = meta

  const { data, error } = await supabase.from('study_notes').update(updates).eq('id', id).eq('user_id', user.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase.from('study_notes').delete().eq('id', Number(id)).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
