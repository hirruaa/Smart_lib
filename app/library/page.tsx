'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'

type Book = { id: number; title: string; author: string; category: string; description: string | null; pdf_url: string | null }
type Loan = { id: number; book_id: number; status: string; request_date: string; due_date: string | null; returned_date: string | null; duration_days: number | null }
type Progress = { book_id: number; current_page: number; total_pages: number | null }

export default function LibraryPage() {
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [progress, setProgress] = useState<Progress[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const [booksResult, loansResult, progressResult] = await Promise.all([
        supabase.from('books').select('id,title,author,category,description,pdf_url').order('title'),
        supabase.from('borrow_requests').select('id,book_id,status,request_date,due_date,returned_date,duration_days').eq('student_id', user.id).order('request_date', { ascending: false }),
        supabase.from('reading_progress').select('book_id,current_page,total_pages').eq('user_id', user.id),
      ])
      setBooks((booksResult.data ?? []) as Book[])
      setLoans((loansResult.data ?? []) as Loan[])
      setProgress((progressResult.data ?? []) as Progress[])
      setLoading(false)
    }
    void load()
  }, [router])

  const bookMap = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])
  const progressMap = useMemo(() => new Map(progress.map((item) => [item.book_id, item])), [progress])
  const active = loans.filter((loan) => loan.status === 'approved' && !loan.returned_date)
  const history = loans.filter((loan) => loan.status === 'returned' || loan.status === 'rejected' || loan.status === 'revoked')
  const requests = loans.filter((loan) => loan.status === 'pending')

  if (loading) return <main className="surface-page min-h-screen p-6"><div className="surface-card mx-auto max-w-6xl p-8 text-sm text-slate-500">Loading your library...</div></main>

  return <main className="surface-page min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="surface-card flex flex-wrap items-end justify-between gap-4 p-6"><div><button type="button" onClick={() => router.push('/dashboard/student')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Student dashboard</button><p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">My library</p><h1 className="mt-2 text-3xl font-semibold">Your reading space</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Open active books, check requests, and return to your reading progress.</p></div><button type="button" onClick={() => router.push('/dashboard/student#explore')} className="pine-action rounded-xl px-4 py-3 text-sm font-semibold">Discover books</button></header>
    <section className="grid gap-4 sm:grid-cols-3"><div className="surface-card p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Active books</p><strong className="mt-3 block text-3xl">{active.length}</strong></div><div className="surface-card p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Pending requests</p><strong className="mt-3 block text-3xl">{requests.length}</strong></div><div className="surface-card p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Reading history</p><strong className="mt-3 block text-3xl">{history.length}</strong></div></section>
    <section className="surface-card p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Currently reading</h2><p className="mt-1 text-sm text-slate-500">Your active digital access and saved page progress.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2">{active.map((loan) => { const book = bookMap.get(loan.book_id); const saved = progressMap.get(loan.book_id); return <article key={loan.id} className="rounded-2xl border border-paper-300 bg-paper-50 p-5 dark:border-forest-700 dark:bg-forest-900/50"><p className="text-xs font-semibold uppercase tracking-wider text-pine-600 dark:text-pine-200">Active access</p><h3 className="mt-2 text-lg font-semibold">{book?.title ?? `Book #${loan.book_id}`}</h3><p className="mt-1 text-sm text-slate-500">{book?.author ?? 'Library resource'}</p><p className="mt-4 text-xs text-slate-500">{saved ? `Page ${saved.current_page}${saved.total_pages ? ` of ${saved.total_pages}` : ''}` : 'Not started yet'} · {loan.due_date ? `due ${new Date(loan.due_date).toLocaleDateString()}` : 'no due date'}</p><button type="button" onClick={() => router.push(`/reader/${loan.book_id}`)} className="pine-action mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold">Open reader</button></article> })}{active.length === 0 ? <p className="text-sm text-slate-500">You do not have active books yet. Discover a resource to get started.</p> : null}</div></section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="surface-card p-6"><h2 className="text-xl font-semibold">Pending requests</h2><div className="mt-4 space-y-3">{requests.map((loan) => <article key={loan.id} className="rounded-xl border border-paper-300 p-4 dark:border-forest-700"><strong>{bookMap.get(loan.book_id)?.title ?? `Book #${loan.book_id}`}</strong><p className="mt-1 text-xs text-slate-500">Requested {new Date(loan.request_date).toLocaleDateString()}</p></article>)}{requests.length === 0 ? <p className="text-sm text-slate-500">No pending requests.</p> : null}</div></div><div className="surface-card p-6"><h2 className="text-xl font-semibold">Reading history</h2><div className="mt-4 space-y-3">{history.slice(0, 8).map((loan) => <article key={loan.id} className="flex items-center justify-between gap-3 rounded-xl border border-paper-300 p-4 dark:border-forest-700"><div><strong>{bookMap.get(loan.book_id)?.title ?? `Book #${loan.book_id}`}</strong><p className="mt-1 text-xs capitalize text-slate-500">{loan.status} · {new Date(loan.request_date).toLocaleDateString()}</p></div><span className="text-xs text-slate-500">Closed</span></article>)}{history.length === 0 ? <p className="text-sm text-slate-500">No reading history yet.</p> : null}</div></div></section>
  </div></main>
}
