import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { apiError, boundedText, positiveInteger } from '@/utils/api'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const bookId = url.searchParams.get('book_id')

  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = supabase.from('highlights').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (bookId) {
    const parsedBookId = positiveInteger(bookId)
    if (!parsedBookId) return NextResponse.json({ error: 'A valid book is required.' }, { status: 400 })
    query = query.eq('book_id', parsedBookId)
  }

  const { data, error } = await query
  if (error) return apiError('Unable to load highlights.', 500, error)
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid highlight data.' }, { status: 400 })
  const { book_id, page, rects, color, note_id, meta } = body
  const parsedBookId = book_id == null ? null : positiveInteger(book_id)
  const parsedPage = page == null ? null : positiveInteger(page, 100000)
  const parsedNoteId = note_id == null ? null : positiveInteger(note_id)
  const allowedColors = new Set(['yellow', 'green', 'blue', 'pink', 'purple'])
  const selectedColor = typeof color === 'string' && allowedColors.has(color) ? color : 'yellow'
  const selectionText = meta && typeof meta === 'object' && !Array.isArray(meta) && 'selection_text' in meta
    ? boundedText((meta as { selection_text?: unknown }).selection_text, 10000)
    : undefined
  const validRects = Array.isArray(rects) && rects.length <= 100 && rects.every((rect: unknown) => {
    if (!rect || typeof rect !== 'object') return false
    const item = rect as Record<string, unknown>
    return ['x', 'y', 'width', 'height'].every((key) => typeof item[key] === 'number' && Number.isFinite(item[key]) && Math.abs(item[key] as number) <= 100000)
  })
  const safeMeta = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
  if ((book_id != null && !parsedBookId) || (page != null && !parsedPage) || (note_id != null && !parsedNoteId) || !validRects || (selectionText === null) || JSON.stringify(safeMeta).length > 12000) {
    return NextResponse.json({ error: 'Invalid highlight data.' }, { status: 400 })
  }
  const payload: any = {
    user_id: user.id,
    book_id: parsedBookId,
    page: parsedPage,
    rects,
    color: selectedColor,
    note_id: parsedNoteId,
    meta: safeMeta
  }

  const { data, error } = await supabase.from('highlights').insert(payload).select().single()
  if (error) return apiError('Unable to save highlight.', 500, error)
  return NextResponse.json(data)
}
