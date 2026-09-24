import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

function validPage(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function validStrokes(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length > 1000) return false
  return value.every((stroke) => {
    if (!stroke || typeof stroke !== 'object') return false
    const points = (stroke as { points?: unknown }).points
    return Array.isArray(points) && points.length <= 2000 && points.every((point) => {
      if (!point || typeof point !== 'object') return false
      const item = point as { x?: unknown; y?: unknown }
      return Number.isFinite(item.x) && Number.isFinite(item.y)
    })
  })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const bookId = Number(url.searchParams.get('book_id'))
  const page = Number(url.searchParams.get('page'))
  if (!Number.isInteger(bookId) || !validPage(page)) {
    return NextResponse.json({ error: 'A valid book and page are required.' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const { data, error } = await supabase
    .from('study_drawings')
    .select('strokes, updated_at')
    .eq('user_id', user.id)
    .eq('book_id', bookId)
    .eq('page', page)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ strokes: data?.strokes ?? [], updatedAt: data?.updated_at ?? null })
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const bookId = Number(body.bookId)
    const page = Number(body.page)
    if (!Number.isInteger(bookId) || !validPage(page) || !validStrokes(body.strokes)) {
      return NextResponse.json({ error: 'Invalid drawing data.' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

    const { data, error } = await supabase
      .from('study_drawings')
      .upsert({ user_id: user.id, book_id: bookId, page, strokes: body.strokes, updated_at: new Date().toISOString() }, { onConflict: 'user_id,book_id,page' })
      .select('strokes, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ strokes: data.strokes, updatedAt: data.updated_at })
  } catch {
    return NextResponse.json({ error: 'Unable to save drawing.' }, { status: 500 })
  }
}
