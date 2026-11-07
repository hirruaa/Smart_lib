export const dynamic = 'force-dynamic'
import ReaderContentProtection from '@/components/ReaderContentProtection'
import ReaderSessionGuard from '@/components/ReaderSessionGuard'
import StudyRoom from '@/components/StudyRoom'
import { createClient } from '@/utils/supabase/server'
import { isStaffRole } from '@/utils/roles'

type Props = { params: Promise<{ bookId: string }> }

export default async function Page({ params }: Props) {
  const { bookId: rawBookId } = await params
  const bookId = Number(rawBookId)
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData.user
  const isMissingTableError = (error: { code?: string; message?: string } | null) =>
    Boolean(error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')))

  if (!user) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Sign in to read this resource</h1><p className="mt-2">Digital reading is available to authenticated library members.</p></div></div>
  }

  const accessCheckedAt = new Date().toISOString()
  const [
    { data: profile },
    { data: ownedContribution },
    loanResult,
    grantResult,
    { data: book },
  ] = await Promise.all([
    supabase.from('profiles').select('role,full_name').eq('id', user.id).maybeSingle(),
    supabase.from('book_contributions').select('id').eq('approved_book_id', bookId).eq('user_id', user.id).eq('status', 'approved').maybeSingle(),
    supabase
      .from('borrow_requests')
      .select('id')
      .eq('student_id', user.id)
      .eq('book_id', bookId)
      .eq('status', 'approved')
      .is('returned_date', null)
      .gt('due_date', accessCheckedAt)
      .maybeSingle(),
    supabase
      .from('book_access_grants')
      .select('id')
      .eq('student_id', user.id)
      .eq('book_id', bookId)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${accessCheckedAt}`)
      .maybeSingle(),
    supabase.from('books').select('id,pdf_url,storage_provider,storage_file_id,storage_path,file_name,mime_type,title,access_mode,catalog_type').eq('id', bookId).maybeSingle(),
  ])
  const isAdmin = isStaffRole(profile?.role)
  const isContributor = Boolean(ownedContribution)

  if (grantResult.error && !isMissingTableError(grantResult.error)) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Access service unavailable</h1><p className="mt-2">The library access table is not available yet. Please re-run the Supabase schema repair.</p></div></div>
  }

  const activeLoan = loanResult.data
  const activeGrant = grantResult.data

  if (!isAdmin && !isContributor && !activeLoan && !activeGrant) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Active access required</h1><p className="mt-2">Request temporary digital access from the library before opening this resource.</p></div></div>
  }

  const readableBook = (book as any) ?? null

  if (readableBook?.catalog_type === 'physical') {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Physical book</h1><p className="mt-2">This title is available as a physical library book. Search the catalog to check availability.</p><a href="/dashboard/student#explore" className="mt-4 inline-block font-semibold text-pine-700 underline dark:text-pine-200">Open catalog</a></div></div>
  }

  if (!readableBook || (!readableBook.pdf_url && !readableBook.storage_file_id && !readableBook.storage_path)) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Resource unavailable</h1><p className="mt-2">This resource does not have a readable digital file yet.</p></div></div>
  }

  if (readableBook.mime_type === 'application/epub+zip' || readableBook.storage_path?.toLowerCase().endsWith('.epub')) {
    return <main className="surface-page flex min-h-screen items-center justify-center px-4 py-10"><section className="surface-card w-full max-w-xl p-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-700 dark:text-pine-200">EPUB book</p><h1 className="mt-3 text-2xl font-semibold">{readableBook.title}</h1><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">This book is available as an EPUB file. Download it and open it in an EPUB-compatible reading app.</p><a href={`/api/reader/${rawBookId}?download=1`} className="pine-action mt-6 inline-flex rounded-xl px-4 py-3 text-sm font-semibold">Download EPUB</a><a href="/dashboard#explore" className="ml-3 inline-flex rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold dark:border-slate-700">Back to catalog</a></section></main>
  }

  let resolvedPdfUrl = readableBook.pdf_url || ''
  if (readableBook.storage_provider === 'google_drive' || readableBook.storage_provider === 'supabase' || !resolvedPdfUrl.startsWith('http://') && !resolvedPdfUrl.startsWith('https://')) resolvedPdfUrl = `/api/reader/${rawBookId}`

  if (readableBook.access_mode === 'points' && (readableBook.pdf_url?.startsWith('http://') || readableBook.pdf_url?.startsWith('https://'))) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Protected file migration required</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">This paid or restricted resource must be stored in the library&apos;s protected PDF storage before it can be opened.</p></div></div>
  }

  const viewerLabel = [profile?.full_name, user.email].filter(Boolean).join(' · ') || 'Mary the Queen College member'

  return (
    <div className="reader-page min-h-screen bg-paper-100 text-slate-900 dark:bg-forest-900 dark:text-paper-100">
      <ReaderSessionGuard>
        <div className="reader-session-layout mx-auto max-w-7xl px-4 pb-8 sm:px-8">
          <ReaderContentProtection viewerLabel={viewerLabel}>
            <StudyRoom bookId={bookId} pdfUrl={resolvedPdfUrl} title={readableBook.title} />
          </ReaderContentProtection>
        </div>
      </ReaderSessionGuard>
    </div>
  )
}
