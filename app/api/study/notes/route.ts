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

  let query = supabase.from('study_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  if (bookId) {
    const parsedBookId = positiveInteger(bookId)
    if (!parsedBookId) return NextResponse.json({ error: 'A valid book is required.' }, { status: 400 })
    query = query.eq('book_id', parsedBookId)
  }

  const { data, error } = await query
  if (error) return apiError('Unable to load notes.', 500, error)
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid note data.' }, { status: 400 })
  const { book_id, page, text, selection_text, meta } = body
  const parsedBookId = book_id == null ? null : positiveInteger(book_id)
  const parsedPage = page == null ? null : positiveInteger(page, 100000)
  const noteText = text == null ? null : boundedText(text, 20000)
  const selectedText = selection_text == null ? null : boundedText(selection_text, 10000)
  if ((book_id != null && !parsedBookId) || (page != null && !parsedPage) || (text != null && noteText === null) || (selection_text != null && selectedText === null)) {
    return NextResponse.json({ error: 'Invalid note data.' }, { status: 400 })
  }
  const payload: any = {
    user_id: user.id,
    book_id: parsedBookId,
    page: parsedPage,
    text: noteText,
    selection_text: selectedText,
    meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
  }

  const { data, error } = await supabase.from('study_notes').insert(payload).select().single()
  if (error) return apiError('Unable to save note.', 500, error)
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid note data.' }, { status: 400 })
  const { id, text, selection_text, page, meta } = body
  const noteId = positiveInteger(id)
  if (!noteId) return NextResponse.json({ error: 'A valid note is required.' }, { status: 400 })

  const updates: any = {}
  if (text !== undefined) updates.text = boundedText(text, 20000)
  if (selection_text !== undefined) updates.selection_text = boundedText(selection_text, 10000)
  if (page !== undefined) updates.page = positiveInteger(page, 100000)
  if (meta !== undefined) updates.meta = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
  if ((text !== undefined && updates.text === null) || (selection_text !== undefined && updates.selection_text === null) || (page !== undefined && updates.page === null)) {
    return NextResponse.json({ error: 'Invalid note data.' }, { status: 400 })
  }

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'No note changes supplied.' }, { status: 400 })
  const { data, error } = await supabase.from('study_notes').update(updates).eq('id', noteId).eq('user_id', user.id).select().single()
  if (error) return apiError('Unable to update note.', 500, error)
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const supabase = createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const noteId = positiveInteger(id)
  if (!noteId) return NextResponse.json({ error: 'A valid note is required.' }, { status: 400 })

  const { error } = await supabase.from('study_notes').delete().eq('id', noteId).eq('user_id', user.id)
  if (error) return apiError('Unable to delete note.', 500, error)
  return NextResponse.json({ success: true })
}
