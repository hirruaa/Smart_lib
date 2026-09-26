export const dynamic = 'force-dynamic'
import React from 'react'
import EReader from '@/components/EReader'
import { createClient } from '@/utils/supabase/server'

type Props = { params: { bookId: string } }

export default async function Page({ params }: Props) {
  const supabase = createClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData.user

  if (!user) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Sign in to read this resource</h1><p className="mt-2">Digital reading is available to authenticated library members.</p></div></div>
  }

  const [{ data: profile }, { data: ownedContribution }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('book_contributions').select('id').eq('approved_book_id', Number(params.bookId)).eq('user_id', user.id).eq('status', 'approved').maybeSingle(),
  ])
  const isAdmin = profile?.role === 'admin'
  const isContributor = Boolean(ownedContribution)
  const [{ data: activeLoan }, { data: activeGrant }] = await Promise.all([
    supabase
      .from('borrow_requests')
      .select('id')
      .eq('student_id', user.id)
      .eq('book_id', Number(params.bookId))
      .eq('status', 'approved')
      .is('returned_date', null)
      .gt('due_date', new Date().toISOString())
      .maybeSingle(),
    supabase
      .from('book_access_grants')
      .select('id')
      .eq('student_id', user.id)
      .eq('book_id', Number(params.bookId))
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ])

  if (!isAdmin && !isContributor && !activeLoan && !activeGrant) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Active access required</h1><p className="mt-2">Request temporary digital access from the library before opening this resource.</p></div></div>
  }

  const { data } = await supabase.from('books').select('id,pdf_url,storage_provider,storage_file_id,storage_path,title,access_mode').eq('id', Number(params.bookId)).maybeSingle()
  const book = (data as any) ?? null

  if (!book || (!book.pdf_url && !book.storage_file_id && !book.storage_path)) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Resource unavailable</h1><p className="mt-2">This resource does not have a readable digital file yet.</p></div></div>
  }

  let resolvedPdfUrl = book.pdf_url || ''
  if (book.storage_provider === 'google_drive' || book.storage_provider === 'supabase' || !resolvedPdfUrl.startsWith('http://') && !resolvedPdfUrl.startsWith('https://')) resolvedPdfUrl = `/api/reader/${params.bookId}`

  if ((book.access_mode === 'points' || book.access_mode === 'restricted') && (book.pdf_url.startsWith('http://') || book.pdf_url.startsWith('https://'))) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Protected file migration required</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">This paid or restricted resource must be stored in the library&apos;s protected PDF storage before it can be opened.</p></div></div>
  }

  return (
    <div className="min-h-screen bg-paper-100 px-4 py-6 text-slate-900 dark:bg-forest-900 dark:text-paper-100 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between border-b border-paper-300/80 pb-4 dark:border-forest-800">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Reading Session</span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">{book.title}</h1>
          </div>
        </div>
        <EReader bookId={Number(params.bookId)} pdfUrl={resolvedPdfUrl} />
      </div>
    </div>
  )
}
