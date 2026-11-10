import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { apiError } from '@/utils/api'
import { isStaffRole } from '@/utils/roles'
import { rateLimit, tooManyRequests } from '@/utils/requestSecurity'

const isMissingTableError = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')))

export async function GET(request: Request) {
  const requestLimit = await rateLimit(request, { name: 'reader-library', limit: 120, windowMs: 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError && authError.name !== 'AuthSessionMissingError') {
    return apiError('Unable to verify your session.', 500, authError)
  }
  const user = authData.user
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const [
    { data: profile, error: profileError },
    { data: books, error: booksError },
    { data: loans, error: loansError },
    { data: grants, error: grantsError },
    { data: contributions, error: contributionsError },
    { data: progress, error: progressError },
    { data: notes, error: notesError },
    { data: highlights, error: highlightsError },
  ] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('books')
      .select('id,title,author,category,catalog_type,pdf_url,storage_provider,storage_file_id,storage_path,mime_type')
      .neq('catalog_type', 'physical')
      .order('title')
      .limit(1000),
    supabase.from('borrow_requests').select('book_id')
      .eq('student_id', user.id).eq('status', 'approved').is('returned_date', null).gt('due_date', new Date().toISOString()),
    supabase.from('book_access_grants').select('book_id')
      .eq('student_id', user.id).eq('status', 'active').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    supabase.from('book_contributions').select('approved_book_id')
      .eq('user_id', user.id).eq('status', 'approved').not('approved_book_id', 'is', null),
    supabase.from('reading_progress').select('book_id,current_page,total_pages,updated_at')
      .eq('user_id', user.id).order('updated_at', { ascending: false }),
    supabase.from('study_notes').select('id,book_id,page,text,selection_text,created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(501),
    supabase.from('highlights').select('id,book_id,page,created_at')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(501),
  ])

  const failed = profileError ?? booksError ?? loansError ?? contributionsError ?? progressError ?? notesError ?? highlightsError
    ?? (isMissingTableError(grantsError) ? null : grantsError)
  if (failed) return apiError('Unable to load your study library.', 500, failed)
  if (!profile) return NextResponse.json({ error: 'Your library profile could not be verified.' }, { status: 403 })

  const bookTitles = new Map((books ?? []).map((book) => [Number(book.id), book.title]))
  const readableBookIds = new Set<number>()
  for (const loan of loans ?? []) readableBookIds.add(Number(loan.book_id))
  for (const grant of grants ?? []) readableBookIds.add(Number(grant.book_id))
  for (const contribution of contributions ?? []) {
    if (contribution.approved_book_id != null) readableBookIds.add(Number(contribution.approved_book_id))
  }

  const progressByBook = new Map((progress ?? []).map((entry) => [Number(entry.book_id), entry]))
  const accessibleBooks = (books ?? []).filter((book) =>
    (isStaffRole(profile.role) || readableBookIds.has(Number(book.id)))
    && book.catalog_type !== 'physical'
    && Boolean(book.storage_path || book.storage_file_id || book.pdf_url)
    && book.mime_type !== 'application/epub+zip'
    && !book.storage_path?.toLowerCase().endsWith('.epub')
    && book.storage_provider !== 'external'
    && !(book.storage_provider == null && /^https?:\/\//i.test(book.pdf_url ?? ''))
  ).map((book) => {
    const savedProgress = progressByBook.get(Number(book.id))
    return {
      id: Number(book.id),
      title: book.title,
      author: book.author,
      category: book.category,
      current_page: savedProgress?.current_page ?? 1,
      total_pages: savedProgress?.total_pages ?? null,
      updated_at: savedProgress?.updated_at ?? null,
    }
  })

  const savedNotes = (notes ?? []).slice(0, 500).map((note) => ({
    ...note,
    book_title: bookTitles.get(Number(note.book_id)) ?? `Book ${note.book_id}`,
  }))
  const savedHighlights = (highlights ?? []).slice(0, 500).map((highlight) => ({
    book_title: bookTitles.get(Number(highlight.book_id)) ?? `Book ${highlight.book_id}`,
  }))

  return NextResponse.json({
    books: accessibleBooks,
    notes: savedNotes,
    highlights: savedHighlights,
    libraryMayBeIncomplete: (books?.length ?? 0) === 1000,
    studyItemsTruncated: (notes?.length ?? 0) > 500 || (highlights?.length ?? 0) > 500,
  })
}
