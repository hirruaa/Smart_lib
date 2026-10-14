'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import { EbookPaymentsSkeleton } from '@/components/skeletons/AdminDashboardSkeleton'
import { isStaffRole } from '@/utils/roles'

type Purchase = {
  id: number
  student_id: string
  book_id: number
  fee_amount: number
  transaction_reference: string
  payment_proof_path: string
  status: string
  receipt_number: string | null
  requested_at: string
}

type Book = { id: number; title: string }
type Member = { id: string; full_name: string | null; email: string }

export default function EbookPaymentsPage() {
  const router = useRouter()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [books, setBooks] = useState<Book[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [proofUrls, setProofUrls] = useState<Record<number, string>>({})
  const [proofErrors, setProofErrors] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError) { setError(profileError.message); setLoading(false); return }
    if (!isStaffRole(profile?.role)) { router.replace('/dashboard'); return }

    const { data, error: purchasesError } = await supabase.from('ebook_purchase_requests')
      .select('id,student_id,book_id,fee_amount,transaction_reference,payment_proof_path,status,receipt_number,requested_at')
      .order('requested_at', { ascending: false })
    if (purchasesError) { setError(purchasesError.message); setLoading(false); return }
    const rows = (data ?? []) as Purchase[]
    setPurchases(rows)
    setProofUrls({})
    setProofErrors({})
    if (rows.length === 0) {
      setBooks([])
      setMembers([])
      setLoading(false)
      return
    }
    const bookIds = Array.from(new Set(rows.map((item) => item.book_id)))
    const memberIds = Array.from(new Set(rows.map((item) => item.student_id)))
    const [bookResult, memberResult] = await Promise.all([
      supabase.from('books').select('id,title').in('id', bookIds),
      supabase.from('profiles').select('id,full_name,email').in('id', memberIds),
    ])
    if (bookResult.error || memberResult.error) {
      setError(bookResult.error?.message ?? memberResult.error?.message ?? 'Unable to load purchase details.')
      setLoading(false)
      return
    }
    setBooks((bookResult.data ?? []) as Book[])
    setMembers((memberResult.data ?? []) as Member[])
    const signedResults = await Promise.all(rows.filter((purchase) => purchase.status === 'pending').map(async (purchase) => {
      const { data: file, error: fileError } = await supabase.storage.from('ebook-payment-proofs').createSignedUrl(purchase.payment_proof_path, 300)
      return fileError
        ? { id: purchase.id, error: fileError.message }
        : { id: purchase.id, url: file.signedUrl }
    }))
    setProofUrls(Object.fromEntries(signedResults.filter((result): result is { id: number; url: string } => 'url' in result).map((result) => [result.id, result.url])))
    setProofErrors(Object.fromEntries(signedResults.filter((result): result is { id: number; error: string } => 'error' in result).map((result) => [result.id, result.error])))
    setLoading(false)
  }, [router])

  useEffect(() => { void load() }, [load])

  const decide = async (purchaseId: number, decision: 'approved' | 'rejected') => {
    setBusyId(purchaseId)
    setError(null)
    setNotice(null)
    const { error: decisionError } = await getSupabase().rpc('admin_decide_ebook_purchase', {
      p_purchase_id: purchaseId,
      p_decision: decision,
    })
    if (decisionError) setError(decisionError.message)
    else {
      setNotice(decision === 'approved' ? 'Payment verified. Permanent e-book access and the digital receipt have been issued.' : 'Payment request rejected.')
      await load()
    }
    setBusyId(null)
  }

  if (loading) return <EbookPaymentsSkeleton />
  const pending = purchases.filter((purchase) => purchase.status === 'pending')
  return <main className="surface-page min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="surface-card p-6">
        <button type="button" onClick={() => router.push('/dashboard/admin')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Admin dashboard</button>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Digital library</p>
        <h1 className="mt-2 text-3xl font-semibold">Premium e-book payments</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Review payment evidence against the merchant record. Approving a valid payment grants permanent access and issues a digital receipt; uploaded screenshots and references remain evidence, not automatic confirmation.</p>
      </header>
      {error ? <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div> : null}
      <section className="surface-card space-y-4 p-6">
        <h2 className="text-xl font-semibold">Payments awaiting verification ({pending.length})</h2>
        {pending.map((purchase) => {
          const book = books.find((item) => item.id === purchase.book_id)
          const member = members.find((item) => item.id === purchase.student_id)
          return <article key={purchase.id} className="grid gap-5 rounded-2xl border border-paper-300 bg-paper-50 p-5 dark:border-forest-700 dark:bg-forest-900/50 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
            <div>
              <h3 className="text-lg font-semibold">{book?.title ?? `Book #${purchase.book_id}`}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{member?.full_name || member?.email || purchase.student_id}</p>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs uppercase text-slate-500">Amount</dt><dd className="font-semibold">₱{Number(purchase.fee_amount).toFixed(2)}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Reference</dt><dd className="break-all font-mono">{purchase.transaction_reference}</dd></div>
                <div><dt className="text-xs uppercase text-slate-500">Submitted</dt><dd>{new Date(purchase.requested_at).toLocaleString()}</dd></div>
              </dl>
              <p className="mt-4 text-xs text-amber-700 dark:text-amber-300">Verify the payment in the GCash merchant record. A screenshot and extracted reference alone do not prove payment.</p>
              {proofErrors[purchase.id] ? <p role="alert" className="mt-3 text-xs text-rose-700 dark:text-rose-300">Could not load receipt: {proofErrors[purchase.id]}</p> : null}
              <div className="mt-5 flex gap-2">
                <button type="button" disabled={busyId !== null} onClick={() => void decide(purchase.id, 'rejected')} className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300">Reject</button>
                <button type="button" disabled={busyId !== null || !proofUrls[purchase.id]} onClick={() => void decide(purchase.id, 'approved')} className="pine-action rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">{busyId === purchase.id ? 'Saving...' : 'Verify payment & grant access'}</button>
              </div>
            </div>
            {proofUrls[purchase.id] ? <a href={proofUrls[purchase.id]} target="_blank" rel="noreferrer" aria-label={`Open GCash receipt for ${book?.title ?? `book ${purchase.book_id}`}`}><img src={proofUrls[purchase.id]} alt="Submitted GCash payment receipt" className="max-h-80 w-full rounded-xl border border-slate-200 object-contain dark:border-slate-700" /></a> : <p className="text-sm text-slate-500">{proofErrors[purchase.id] ? 'Receipt image could not be accessed.' : 'Loading receipt image...'}</p>}
          </article>
        })}
        {pending.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500 dark:bg-slate-800/60">No e-book payments are awaiting review.</p> : null}
      </section>
      <section className="surface-card p-6">
        <h2 className="text-xl font-semibold">Payment history</h2>
        <div className="mt-4 space-y-2">{purchases.filter((purchase) => purchase.status !== 'pending').map((purchase) => { const member = members.find((item) => item.id === purchase.student_id); return <article key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-paper-300 p-4 text-sm dark:border-forest-700"><div><strong>{books.find((item) => item.id === purchase.book_id)?.title ?? `Book #${purchase.book_id}`}</strong><p className="mt-1 text-xs text-slate-500">{member?.full_name?.trim() || 'Unknown member'} · {purchase.receipt_number ?? 'No receipt issued'}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize dark:bg-slate-800">{purchase.status}</span></article> })}</div>
        {purchases.every((purchase) => purchase.status === 'pending') ? <p className="mt-4 text-sm text-slate-500">No completed payment decisions yet.</p> : null}
      </section>
    </div>
  </main>
}
