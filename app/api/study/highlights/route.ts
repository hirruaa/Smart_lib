import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const bookId = url.searchParams.get('book_id')

  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = supabase.from('highlights').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
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
  const { book_id, page, rects, color, note_id, meta } = body
  const payload: any = {
    user_id: user.id,
    book_id: book_id ? Number(book_id) : null,
    page: page ? Number(page) : null,
    rects: rects ?? [],
    color: color ?? 'yellow',
    note_id: note_id ?? null,
    meta: meta ?? {}
  }

  const { data, error } = await supabase.from('highlights').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
