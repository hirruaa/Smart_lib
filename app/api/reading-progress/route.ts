import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const bookId = Number(new URL(request.url).searchParams.get('book_id'))
  if (!Number.isInteger(bookId)) return NextResponse.json({ error: 'A valid book is required.' }, { status: 400 })
  const { data, error } = await supabase.from('reading_progress').select('*').eq('user_id', user.id).eq('book_id', bookId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 8_192)) return NextResponse.json({ error: 'Progress request is too large.' }, { status: 413 })
  const requestLimit = rateLimit(request, { name: 'reading-progress-write', limit: 120, windowMs: 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const bookId = Number(body.bookId)
  const currentPage = Number(body.currentPage)
  const totalPages = body.totalPages == null ? null : Number(body.totalPages)
  if (!Number.isInteger(bookId) || !Number.isInteger(currentPage) || currentPage < 1 || (totalPages !== null && (!Number.isInteger(totalPages) || totalPages < 1))) {
    return NextResponse.json({ error: 'Invalid reading progress.' }, { status: 400 })
  }
  const { data, error } = await supabase.from('reading_progress').upsert({ user_id: user.id, book_id: bookId, current_page: currentPage, total_pages: totalPages, updated_at: new Date().toISOString() }, { onConflict: 'user_id,book_id' }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
