export const dynamic = 'force-dynamic'
import React from 'react'
import EReader from '@/components/EReader'
import ReaderSessionGuard from '@/components/ReaderSessionGuard'
import { createClient } from '@/utils/supabase/server'

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

  const [{ data: profile }, { data: ownedContribution }] = await Promise.all([
    supabase.from('profiles').select('role,full_name').eq('id', user.id).maybeSingle(),
    supabase.from('book_contributions').select('id').eq('approved_book_id', bookId).eq('user_id', user.id).eq('status', 'approved').maybeSingle(),
  ])
  const isAdmin = profile?.role === 'admin'
  const isContributor = Boolean(ownedContribution)
  const [loanResult, grantResult] = await Promise.all([
    supabase
      .from('borrow_requests')
      .select('id')
      .eq('student_id', user.id)
      .eq('book_id', bookId)
      .eq('status', 'approved')
      .is('returned_date', null)
      .gt('due_date', new Date().toISOString())
      .maybeSingle(),
    supabase
      .from('book_access_grants')
      .select('id')
      .eq('student_id', user.id)
      .eq('book_id', bookId)
      .eq('status', 'active')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .maybeSingle(),
  ])

  if (grantResult.error && !isMissingTableError(grantResult.error)) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Access service unavailable</h1><p className="mt-2">The library access table is not available yet. Please re-run the Supabase schema repair.</p></div></div>
  }

  const activeLoan = loanResult.data
  const activeGrant = grantResult.data

  if (!isAdmin && !isContributor && !activeLoan && !activeGrant) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Active access required</h1><p className="mt-2">Request temporary digital access from the library before opening this resource.</p></div></div>
  }

  const { data } = await supabase.from('books').select('id,pdf_url,storage_provider,storage_file_id,storage_path,title,access_mode,catalog_type').eq('id', bookId).maybeSingle()
  const book = (data as any) ?? null

  if (book?.catalog_type === 'physical') {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Physical book</h1><p className="mt-2">This title is available as a physical library book. Check its availability in the physical collection.</p><a href="/physical-library" className="mt-4 inline-block font-semibold text-pine-700 underline dark:text-pine-200">Browse physical books</a></div></div>
  }

  if (!book || (!book.pdf_url && !book.storage_file_id && !book.storage_path)) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Resource unavailable</h1><p className="mt-2">This resource does not have a readable digital file yet.</p></div></div>
  }

  let resolvedPdfUrl = book.pdf_url || ''
  if (book.storage_provider === 'google_drive' || book.storage_provider === 'supabase' || !resolvedPdfUrl.startsWith('http://') && !resolvedPdfUrl.startsWith('https://')) resolvedPdfUrl = `/api/reader/${rawBookId}`

  if ((book.access_mode === 'points' || book.access_mode === 'restricted') && (book.pdf_url.startsWith('http://') || book.pdf_url.startsWith('https://'))) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Protected file migration required</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">This paid or restricted resource must be stored in the library&apos;s protected PDF storage before it can be opened.</p></div></div>
  }

  const viewerLabel = [profile?.full_name, user.email].filter(Boolean).join(' · ') || 'Smart Lib member'

  return (
    <div className="reader-page min-h-screen bg-paper-100 text-slate-900 dark:bg-forest-900 dark:text-paper-100">
      <ReaderSessionGuard>
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-8">
          <div
            className="reader-protected-content"
            onContextMenu={(event) => event.preventDefault()}
            style={{ '--reader-watermark': JSON.stringify(viewerLabel) } as React.CSSProperties}
          >
            <EReader bookId={bookId} pdfUrl={resolvedPdfUrl} title={book.title} />
          </div>
        </div>
      </ReaderSessionGuard>
    </div>
  )
}
