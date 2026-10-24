import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { positiveInteger } from '@/utils/api'

export async function GET(request: Request, { params }: { params: Promise<{ bookId: string }> }) {
  const { bookId: rawBookId } = await params
  const bookId = positiveInteger(rawBookId)
  if (!bookId) return NextResponse.json({ error: 'A valid book is required.' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const [notesResult, highlightsResult, progressResult] = await Promise.all([
    supabase.from('study_notes').select('*').eq('user_id', user.id).eq('book_id', bookId).order('created_at', { ascending: false }),
    supabase.from('highlights').select('*').eq('user_id', user.id).eq('book_id', bookId).order('created_at', { ascending: false }),
    supabase.from('reading_progress').select('current_page,total_pages,updated_at').eq('user_id', user.id).eq('book_id', bookId).maybeSingle(),
  ])

  const failed = notesResult.error ?? highlightsResult.error ?? progressResult.error
  if (failed) return NextResponse.json({ error: 'Unable to load reader study data.' }, { status: 500 })
  return NextResponse.json({ notes: notesResult.data ?? [], highlights: highlightsResult.data ?? [], progress: progressResult.data ?? null })
}
