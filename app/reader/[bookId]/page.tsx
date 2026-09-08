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

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = profile?.role === 'admin'
  const { data: activeLoan } = await supabase
    .from('borrow_requests')
    .select('id')
    .eq('student_id', user.id)
    .eq('book_id', Number(params.bookId))
    .eq('status', 'approved')
    .is('returned_date', null)
    .gt('due_date', new Date().toISOString())
    .maybeSingle()

  if (!isAdmin && !activeLoan) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Active access required</h1><p className="mt-2">Request temporary digital access from the library before opening this resource.</p></div></div>
  }

  const { data } = await supabase.from('books').select('id,pdf_url,title').eq('id', Number(params.bookId)).maybeSingle()
  const book = (data as any) ?? null

  if (!book || !book.pdf_url) {
    return <div className="surface-page min-h-screen p-8"><div className="surface-card mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">Resource unavailable</h1><p className="mt-2">This resource does not have a readable digital file yet.</p></div></div>
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
        <EReader bookId={Number(params.bookId)} pdfUrl={book.pdf_url} />
      </div>
    </div>
  )
}
