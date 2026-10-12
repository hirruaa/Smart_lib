'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import { LibrarySkeleton } from '@/components/skeletons'

type Book = { id: number; title: string; author: string; category: string; description: string | null; pdf_url: string | null }
type Loan = { id: number; book_id: number; status: string; request_date: string; due_date: string | null; returned_date: string | null; duration_days: number | null }
type Progress = { book_id: number; current_page: number; total_pages: number | null }
type EbookPurchase = {
  id: number
  book_id: number
  fee_amount: number
  transaction_reference: string
  status: string
  receipt_number: string | null
  requested_at: string
}

export default function LibraryPage() {
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [progress, setProgress] = useState<Progress[]>([])
  const [purchases, setPurchases] = useState<EbookPurchase[]>([])
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const [booksResult, loansResult, progressResult, purchasesResult] = await Promise.all([
        supabase.from('books').select('id,title,author,category,description,pdf_url').order('title'),
        supabase.from('borrow_requests').select('id,book_id,status,request_date,due_date,returned_date,duration_days').eq('student_id', user.id).order('request_date', { ascending: false }),
        supabase.from('reading_progress').select('book_id,current_page,total_pages').eq('user_id', user.id),
        supabase.from('ebook_purchase_requests').select('id,book_id,fee_amount,transaction_reference,status,receipt_number,requested_at').eq('student_id', user.id).order('requested_at', { ascending: false }),
      ])
      setBooks((booksResult.data ?? []) as Book[])
      setLoans((loansResult.data ?? []) as Loan[])
      setProgress((progressResult.data ?? []) as Progress[])
      if (purchasesResult.error) setPurchaseError(`Unable to load e-book payment history: ${purchasesResult.error.message}`)
      setPurchases((purchasesResult.data ?? []) as EbookPurchase[])
      setLoading(false)
    }
    void load()
  }, [router])

  const bookMap = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])
  const progressMap = useMemo(() => new Map(progress.map((item) => [item.book_id, item])), [progress])
  const active = loans.filter((loan) => loan.status === 'approved' && !loan.returned_date)
  const history = loans.filter((loan) => loan.status === 'returned' || loan.status === 'rejected' || loan.status === 'revoked')
  const requests = loans.filter((loan) => loan.status === 'pending')

  if (loading) return <LibrarySkeleton />

  return <main className="surface-page min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="surface-card flex flex-wrap items-end justify-between gap-4 p-6"><div><button type="button" onClick={() => router.push('/dashboard')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Member dashboard</button><p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">My library</p><h1 className="mt-2 text-3xl font-semibold">Your reading space</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Open active books, check requests, and return to your reading progress.</p></div><button type="button" onClick={() => router.push('/dashboard#explore')} className="pine-action rounded-xl px-4 py-3 text-sm font-semibold">Discover books</button></header>
    <section className="grid gap-4 sm:grid-cols-3"><div className="surface-card p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Active books</p><strong className="mt-3 block text-3xl">{active.length}</strong></div><div className="surface-card p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Pending requests</p><strong className="mt-3 block text-3xl">{requests.length}</strong></div><div className="surface-card p-5"><p className="text-xs uppercase tracking-wider text-slate-500">Reading history</p><strong className="mt-3 block text-3xl">{history.length}</strong></div></section>
    <section className="surface-card p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Currently reading</h2><p className="mt-1 text-sm text-slate-500">Your active digital access and saved page progress.</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2">{active.map((loan) => { const book = bookMap.get(loan.book_id); const saved = progressMap.get(loan.book_id); return <article key={loan.id} className="rounded-2xl border border-paper-300 bg-paper-50 p-5 dark:border-forest-700 dark:bg-forest-900/50"><p className="text-xs font-semibold uppercase tracking-wider text-pine-600 dark:text-pine-200">Active access</p><h3 className="mt-2 text-lg font-semibold">{book?.title ?? `Book #${loan.book_id}`}</h3><p className="mt-1 text-sm text-slate-500">{book?.author ?? 'Library resource'}</p><p className="mt-4 text-xs text-slate-500">{saved ? `Page ${saved.current_page}${saved.total_pages ? ` of ${saved.total_pages}` : ''}` : 'Not started yet'} · {loan.due_date ? `due ${new Date(loan.due_date).toLocaleDateString()}` : 'no due date'}</p><button type="button" onClick={() => router.push(`/reader/${loan.book_id}`)} className="pine-action mt-4 rounded-xl px-4 py-2.5 text-sm font-semibold">Open reader</button></article> })}{active.length === 0 ? <p className="text-sm text-slate-500">You do not have active books yet. Discover a resource to get started.</p> : null}</div></section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="surface-card p-6"><h2 className="text-xl font-semibold">Pending requests</h2><div className="mt-4 space-y-3">{requests.map((loan) => <article key={loan.id} className="rounded-xl border border-paper-300 p-4 dark:border-forest-700"><strong>{bookMap.get(loan.book_id)?.title ?? `Book #${loan.book_id}`}</strong><p className="mt-1 text-xs text-slate-500">Requested {new Date(loan.request_date).toLocaleDateString()}</p></article>)}{requests.length === 0 ? <p className="text-sm text-slate-500">No pending requests.</p> : null}</div></div><div className="surface-card p-6"><h2 className="text-xl font-semibold">Reading history</h2><div className="mt-4 space-y-3">{history.slice(0, 8).map((loan) => <article key={loan.id} className="flex items-center justify-between gap-3 rounded-xl border border-paper-300 p-4 dark:border-forest-700"><div><strong>{bookMap.get(loan.book_id)?.title ?? `Book #${loan.book_id}`}</strong><p className="mt-1 text-xs capitalize text-slate-500">{loan.status} · {new Date(loan.request_date).toLocaleDateString()}</p></div><span className="text-xs text-slate-500">Closed</span></article>)}{history.length === 0 ? <p className="text-sm text-slate-500">No reading history yet.</p> : null}</div></div></section>
    <section className="surface-card p-6"><h2 className="text-xl font-semibold">Past e-book payment records</h2><p className="mt-1 text-sm text-slate-500">New paid e-book purchases are paused until automatic online payment verification is available. Free and points-based e-books unlock immediately.</p>{purchaseError ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{purchaseError}</p> : null}<div className="mt-4 space-y-3">{purchases.map((purchase) => <article key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-paper-300 p-4 dark:border-forest-700"><div><strong>{bookMap.get(purchase.book_id)?.title ?? `Book #${purchase.book_id}`}</strong><p className="mt-1 text-xs text-slate-500">₱{Number(purchase.fee_amount).toFixed(2)} · Ref {purchase.transaction_reference} · {new Date(purchase.requested_at).toLocaleDateString()}</p>{purchase.receipt_number ? <p className="mt-1 font-mono text-xs text-pine-700 dark:text-pine-200">Digital receipt: {purchase.receipt_number}</p> : null}</div><div className="flex items-center gap-3"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize dark:bg-slate-800">{purchase.status}</span>{purchase.status === 'approved' ? <button type="button" onClick={() => router.push(`/reader/${purchase.book_id}`)} className="pine-action rounded-lg px-3 py-2 text-xs font-semibold">Read e-book</button> : null}</div></article>)}{purchases.length === 0 && !purchaseError ? <p className="text-sm text-slate-500">No past paid e-book records.</p> : null}</div></section>
  </div></main>
}
