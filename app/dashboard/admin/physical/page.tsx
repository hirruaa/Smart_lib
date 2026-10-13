'use client'

import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { getSupabase } from '@/utils/supabase/client'
import { AdminPhysicalSkeleton } from '@/components/skeletons/AdminDashboardSkeleton'
import ResultModal from '@/components/ResultModal'
import ActionModal from '@/components/ActionModal'
import { DIGITAL_ACCESS_DURATION_OPTIONS } from '@/utils/libraryContracts'

type Book = { id: number; title: string; catalog_type: string; cover_image_url: string | null }
type Copy = { id: number; book_id: number; copy_code: string; qr_token: string; status: string; location: string | null }
type Option = { id: number; book_id: number; duration_days: number; fee_amount: number; is_active: boolean }
type Loan = {
  id: number; student_id: string; book_id: number; copy_id: number | null; duration_days: number
  fee_amount: number; payment_method: string; payment_status: string; transaction_reference: string | null
  payment_proof_path: string | null; status: string; requested_at: string; checked_out_at: string | null
  due_date: string | null; returned_at: string | null; receipt_number: string | null
  reservation_expires_at: string | null
}
type LoanHistory = {
  id: number; student_id: string; book_id: number; copy_id: number; duration_days: number
  fee_amount: number; payment_method: string; payment_status: string; status: string
  checked_out_at: string; due_date: string; returned_at: string | null
  return_condition: string | null; receipt_number: string | null
}
type Profile = { id: string; email: string; full_name: string | null }

const panel = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900'
const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950'

export default function PhysicalCirculationAdminPage() {
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [copies, setCopies] = useState<Copy[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [loanHistory, setLoanHistory] = useState<LoanHistory[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [qrImages, setQrImages] = useState<Record<string, string>>({})
  const [copyForm, setCopyForm] = useState({ bookId: '', quantity: '1', prefix: '', location: '' })
  const [newPhysicalBook, setNewPhysicalBook] = useState({
    title: '', author: '', category: '', isbn: '', description: '', quantity: '1', prefix: '', location: '',
  })
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [optionForm, setOptionForm] = useState({ bookId: '', fees: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string> })
  const [returnConditions, setReturnConditions] = useState<Record<number, 'available' | 'damaged' | 'lost'>>({})
  const [lostResolution, setLostResolution] = useState<Record<number, 'available' | 'damaged' | 'withdrawn'>>({})
  const [historyBookId, setHistoryBookId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<{ type: 'checkout' | 'close' | 'reject' | 'resolve'; id: number } | null>(null)

  const load = async () => {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError || profile?.role !== 'admin') { router.replace('/unauthorized'); return }
    const [bookResult, copyResult, optionResult, loanResult, historyResult, memberResult] = await Promise.all([
      supabase.from('books').select('id,title,catalog_type,cover_image_url').order('title'),
      supabase.from('physical_book_copies').select('id,book_id,copy_code,qr_token,status,location').order('copy_code'),
      supabase.from('physical_loan_options').select('id,book_id,duration_days,fee_amount,is_active').order('book_id').order('duration_days'),
      supabase.from('physical_book_requests').select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,transaction_reference,payment_proof_path,status,requested_at,checked_out_at,due_date,returned_at,receipt_number,reservation_expires_at').order('requested_at', { ascending: false }),
      supabase.from('physical_book_loan_history').select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,status,checked_out_at,due_date,returned_at,return_condition,receipt_number').order('checked_out_at', { ascending: false }),
      supabase.from('profiles').select('id,email,full_name').in('role', ['student', 'faculty']),
    ])
    const failed = [bookResult, copyResult, optionResult, loanResult, historyResult, memberResult].find((result) => result.error)
    if (failed?.error) setError(`Unable to load physical circulation: ${failed.error.message}`)
    setBooks((bookResult.data ?? []) as Book[])
    setCopies((copyResult.data ?? []) as Copy[])
    setOptions((optionResult.data ?? []) as Option[])
    setLoans((loanResult.data ?? []) as Loan[])
    setLoanHistory((historyResult.data ?? []) as LoanHistory[])
    setProfiles((memberResult.data ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [router])

  useEffect(() => {
    let active = true
    const createCodes = async () => {
      const entries = await Promise.all(copies.map(async (copy) => {
        const url = `${window.location.origin}/dashboard/student?copy=${encodeURIComponent(copy.qr_token)}#explore`
        return [copy.qr_token, await QRCode.toDataURL(url, { width: 180, margin: 1 })] as const
      }))
      if (active) setQrImages(Object.fromEntries(entries))
    }
    if (copies.length) void createCodes().catch((reason: unknown) => setError(reason instanceof Error ? `Unable to create QR labels: ${reason.message}` : 'Unable to create QR labels.'))
    return () => { active = false }
  }, [copies])

  const submitCopyForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    const { error: saveError } = await getSupabase().rpc('admin_add_physical_copies', {
      p_book_id: Number(copyForm.bookId), p_quantity: Number(copyForm.quantity),
      p_code_prefix: copyForm.prefix.trim(), p_location: copyForm.location.trim() || null,
    })
    if (saveError) setError(saveError.message)
    else {
      setCopyForm({ ...copyForm, quantity: '1', location: '' })
      await load()
      setMessage('Copies and their QR sticker links were created.')
    }
    setBusy(false)
  }

  const submitPhysicalBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    setBusy(true); setError(''); setMessage('')
    const supabase = getSupabase()
    let coverUrl: string | null = null
    let coverPath: string | null = null
    if (coverFile) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(coverFile.type) || coverFile.size > 5 * 1024 * 1024) {
        setError('Cover must be a JPG, PNG, or WebP image no larger than 5 MB.')
        setBusy(false)
        return
      }
      const extension = coverFile.type === 'image/jpeg' ? 'jpg' : coverFile.type.split('/')[1]
      coverPath = `covers/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('physical-book-covers').upload(coverPath, coverFile, {
        contentType: coverFile.type, upsert: false,
      })
      if (uploadError) {
        setError(`Cover upload failed: ${uploadError.message}`)
        setBusy(false)
        return
      }
      coverUrl = supabase.storage.from('physical-book-covers').getPublicUrl(coverPath).data.publicUrl
    }

    const { error: saveError } = await supabase.rpc('admin_create_physical_book', {
      p_title: newPhysicalBook.title.trim(),
      p_author: newPhysicalBook.author.trim(),
      p_category: newPhysicalBook.category.trim(),
      p_isbn: newPhysicalBook.isbn.trim() || null,
      p_description: newPhysicalBook.description.trim() || null,
      p_cover_image_url: coverUrl,
      p_quantity: Number(newPhysicalBook.quantity),
      p_code_prefix: newPhysicalBook.prefix.trim(),
      p_location: newPhysicalBook.location.trim() || null,
    })
    if (saveError) {
      if (coverPath) {
        const { error: cleanupError } = await supabase.storage.from('physical-book-covers').remove([coverPath])
        if (cleanupError) setError(`${saveError.message} Cover cleanup also failed: ${cleanupError.message}`)
        else setError(saveError.message)
      } else setError(saveError.message)
    } else {
      setNewPhysicalBook({ title: '', author: '', category: '', isbn: '', description: '', quantity: '1', prefix: '', location: '' })
      setCoverFile(null)
      formElement.reset()
      await load()
      setMessage('Physical book and copy QR records added to the public catalog.')
    }
    setBusy(false)
  }

  const submitOptionForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    const invalidFee = DIGITAL_ACCESS_DURATION_OPTIONS.some((days) => !Number.isFinite(Number(optionForm.fees[String(days)])) || Number(optionForm.fees[String(days)]) < 0)
    if (invalidFee) {
      setError('Each physical-book fee must be a valid non-negative amount.')
      setBusy(false)
      return
    }
    const results = await Promise.all(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => getSupabase().rpc('admin_set_physical_loan_option', {
      p_book_id: Number(optionForm.bookId), p_duration_days: days,
      p_fee_amount: Number(optionForm.fees[String(days)]), p_is_active: true,
    })))
    const saveError = results.find((result) => result.error)?.error
    if (saveError) setError(saveError.message)
    else { await load(); setMessage('Physical-book fees for all access periods were saved.') }
    setBusy(false)
  }

  const executeCheckout = async (loanId: number) => {
    setBusy(true); setError(''); setMessage('')
    const { error: actionError } = await getSupabase().rpc('admin_confirm_physical_checkout', { p_request_id: loanId })
    if (actionError) setError(actionError.message)
    else { await load(); setMessage('Payment confirmed and physical checkout recorded. Digital receipt issued to the borrower.') }
    setBusy(false)
  }

  const executeCloseLoan = async (loanId: number) => {
    setBusy(true); setError(''); setMessage('')
    const { error: actionError } = await getSupabase().rpc('admin_close_physical_loan', {
      p_request_id: loanId, p_copy_condition: returnConditions[loanId] ?? 'available',
    })
    if (actionError) setError(actionError.message)
    else { await load(); setMessage('Return condition recorded and loan closed.') }
    setBusy(false)
  }

  const executeRejectRequest = async (loanId: number) => {
    setBusy(true); setError(''); setMessage('')
    const { error: actionError } = await getSupabase().rpc('admin_decide_physical_request', {
      p_request_id: loanId, p_decision: 'rejected',
    })
    if (actionError) setError(actionError.message)
    else { await load(); setMessage('Request rejected and its reserved copy released.') }
    setBusy(false)
  }

  const executeResolveLostLoan = async (loanId: number) => {
    setBusy(true); setError(''); setMessage('')
    const { error: actionError } = await getSupabase().rpc('admin_resolve_lost_physical_loan', {
      p_request_id: loanId, p_copy_condition: lostResolution[loanId] ?? 'available',
    })
    if (actionError) setError(actionError.message)
    else { await load(); setMessage('Lost-book record resolved and the library-only hold lifted.') }
    setBusy(false)
  }

  const checkout = (loanId: number) => setPendingAction({ type: 'checkout', id: loanId })
  const closeLoan = (loanId: number) => setPendingAction({ type: 'close', id: loanId })
  const rejectRequest = (loanId: number) => setPendingAction({ type: 'reject', id: loanId })
  const resolveLostLoan = (loanId: number) => setPendingAction({ type: 'resolve', id: loanId })

  const openProof = async (path: string) => {
    const { data, error: proofError } = await getSupabase().storage.from('physical-payment-proofs').createSignedUrl(path, 60)
    if (proofError) setError(`Unable to open payment proof: ${proofError.message}`)
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <AdminPhysicalSkeleton />
  const waitingLoans = loans.filter((loan) => ['pending', 'waitlisted'].includes(loan.status))
  const activeLoans = loans.filter((loan) => loan.status === 'checked_out')
  const lostLoans = loans.filter((loan) => loan.status === 'lost')
  const historyLoans = loanHistory.filter((loan) => !historyBookId || String(loan.book_id) === historyBookId)
  const bookName = (bookId: number) => books.find((book) => book.id === bookId)?.title ?? `Book #${bookId}`
  const copyCode = (copyId: number | null) => copies.find((copy) => copy.id === copyId)?.copy_code ?? 'Copy unavailable'
  const memberName = (memberId: string) => {
    const person = profiles.find((profile) => profile.id === memberId)
    return person ? `${person.full_name || person.email} (${person.email})` : 'Unknown borrower'
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className={panel}>
        <div className="flex flex-wrap justify-between gap-3"><button type="button" onClick={() => router.push('/dashboard/admin')} className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">← Admin dashboard</button><button type="button" onClick={() => router.push('/dashboard/admin/ebook-payments')} className="text-xs font-semibold text-sky-700 underline dark:text-sky-300">Review e-book payments</button></div>
        <h1 className="mt-4 text-3xl font-semibold">Physical circulation</h1>
        <p className="mt-2 text-sm text-slate-500">Manage copy-level inventory, QR stickers, book-specific loan prices, payment verification, checkout, and returns.</p>
      </header>
      <ResultModal
        open={Boolean(error || message)}
        status={error ? 'error' : 'success'}
        message={error || message}
        onClose={() => { setError(''); setMessage('') }}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={(event) => void submitPhysicalBook(event)} className={`${panel} space-y-3 lg:col-span-2`}>
          <h2 className="text-lg font-semibold">Add a physical book to the public catalog</h2>
          <p className="text-sm text-slate-500">Add its catalog details and cover, then register the copies and QR codes together. Students can check availability online before visiting the library.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium">Title<input required maxLength={300} value={newPhysicalBook.title} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, title: event.target.value })} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Author<input required maxLength={200} value={newPhysicalBook.author} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, author: event.target.value })} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Category<input required maxLength={120} value={newPhysicalBook.category} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, category: event.target.value })} placeholder="e.g. Biology" className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">ISBN (optional)<input maxLength={32} value={newPhysicalBook.isbn} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, isbn: event.target.value })} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Copy-code prefix<input required maxLength={32} pattern="[A-Za-z0-9_-]+" value={newPhysicalBook.prefix} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, prefix: event.target.value })} placeholder="e.g. BIO101" className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Number of copies<input required type="number" min="1" max="100" value={newPhysicalBook.quantity} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, quantity: event.target.value })} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Shelf / location (optional)<input maxLength={120} value={newPhysicalBook.location} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, location: event.target.value })} placeholder="e.g. Science shelf B" className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium">Front cover (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => setCoverFile(event.target.files?.[0] ?? null)} className={`${input} mt-1`} /><span className="mt-1 block text-xs font-normal text-slate-500">JPG, PNG, or WebP · up to 5 MB</span></label>
          </div>
          <label className="block text-sm font-medium">Description (optional)<textarea maxLength={3000} rows={3} value={newPhysicalBook.description} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, description: event.target.value })} className={`${input} mt-1`} /></label>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Saving...' : 'Add book and copies'}</button>
        </form>
        <form onSubmit={(event) => void submitCopyForm(event)} className={`${panel} space-y-3`}>
          <h2 className="text-lg font-semibold">Add copies to an existing title</h2>
          <select required value={copyForm.bookId} onChange={(event) => setCopyForm({ ...copyForm, bookId: event.target.value })} className={input}><option value="">Choose a book</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select>
          <div className="grid gap-3 sm:grid-cols-2"><input required value={copyForm.prefix} onChange={(event) => setCopyForm({ ...copyForm, prefix: event.target.value })} maxLength={32} placeholder="Copy-code prefix, e.g. BIO101" className={input} /><input required type="number" min="1" max="100" value={copyForm.quantity} onChange={(event) => setCopyForm({ ...copyForm, quantity: event.target.value })} className={input} /></div>
          <input value={copyForm.location} onChange={(event) => setCopyForm({ ...copyForm, location: event.target.value })} maxLength={120} placeholder="Shelf / location (optional)" className={input} />
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Saving...' : 'Create copies'}</button>
        </form>
        <form onSubmit={(event) => void submitOptionForm(event)} className={`${panel} space-y-3`}>
          <h2 className="text-lg font-semibold">Set book-specific loan fee</h2>
          <select required value={optionForm.bookId} onChange={(event) => {
            const bookId = event.target.value
            const existing = options.filter((option) => option.book_id === Number(bookId))
            setOptionForm({
              bookId,
              fees: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, String(existing.find((option) => option.duration_days === days)?.fee_amount ?? 0)])),
            })
          }} className={input}><option value="">Choose a book</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => <label key={days} className="text-sm">{days} {days === 1 ? 'day' : 'days'} fee (₱)<input required type="number" min="0" step="0.01" value={optionForm.fees[String(days)] ?? '0'} onChange={(event) => setOptionForm({ ...optionForm, fees: { ...optionForm.fees, [days]: event.target.value } })} className={`${input} mt-1`} /></label>)}
          </div>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Save physical-book fees</button>
        </form>
      </div>

      <section className={panel}>
        <h2 className="text-xl font-semibold">Copy inventory and printable QR stickers</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copies.map((copy) => <article key={copy.id} className="rounded-2xl border border-slate-200 p-4 text-center dark:border-slate-700">
            {qrImages[copy.qr_token] ? <img src={qrImages[copy.qr_token]} alt={`QR sticker for copy ${copy.copy_code}`} className="mx-auto h-36 w-36" /> : <div className="mx-auto h-36 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />}
            <strong className="mt-2 block">{copy.copy_code}</strong><p className="mt-1 text-xs capitalize text-slate-500">{copy.status}{copy.location ? ` · ${copy.location}` : ''}</p>
            {qrImages[copy.qr_token] ? <a href={qrImages[copy.qr_token]} download={`${copy.copy_code}-qr.png`} className="mt-2 inline-block text-xs font-semibold text-sky-700 underline dark:text-sky-300">Download sticker</a> : null}
          </article>)}
          {copies.length === 0 ? <p className="text-sm text-slate-500">No physical copies registered yet.</p> : null}
        </div>
        <div className="mt-6 space-y-2">{options.map((option) => <p key={option.id} className="text-sm text-slate-600 dark:text-slate-300">{bookName(option.book_id)} · {option.duration_days} days · ₱{Number(option.fee_amount).toFixed(2)}{option.is_active ? '' : ' · inactive'}</p>)}</div>
      </section>

      <section className={panel}>
        <h2 className="text-xl font-semibold">Requests and payment verification</h2>
        <div className="mt-4 space-y-3">
          {waitingLoans.map((loan) => <article key={loan.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><strong>{bookName(loan.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(loan.student_id)}</p><p className="mt-1 text-xs capitalize text-slate-500">{loan.status} · {copyCode(loan.copy_id)} · {loan.duration_days} days · ₱{Number(loan.fee_amount).toFixed(2)} · {loan.payment_method}</p>{loan.reservation_expires_at ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Copy held until {new Date(loan.reservation_expires_at).toLocaleString()}</p> : null}{loan.transaction_reference ? <p className="mt-1 text-xs text-slate-500">Transaction reference: {loan.transaction_reference}</p> : null}{loan.payment_proof_path ? <button type="button" onClick={() => void openProof(loan.payment_proof_path!)} className="mt-1 text-xs font-semibold text-sky-700 underline dark:text-sky-300">View uploaded payment proof</button> : null}</div>
              {loan.status === 'pending' ? <div className="flex flex-wrap gap-2"><button disabled={busy} type="button" onClick={() => void checkout(loan.id)} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{loan.payment_method === 'gcash' ? 'Verify payment & check out' : 'Confirm cash & check out'}</button><button disabled={busy} type="button" onClick={() => void rejectRequest(loan.id)} className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Reject & release copy</button></div> : <span className="text-xs text-amber-700 dark:text-amber-300">Notify borrower when a copy is available.</span>}
            </div>
          </article>)}
          {waitingLoans.length === 0 ? <p className="text-sm text-slate-500">No requests are waiting for action.</p> : null}
        </div>
      </section>

      <section className={panel}>
        <h2 className="text-xl font-semibold">Checked-out copies</h2>
        <div className="mt-4 space-y-3">
          {activeLoans.map((loan) => <article key={loan.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div><strong>{bookName(loan.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(loan.student_id)}</p><p className="mt-1 text-xs text-slate-500">Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'} · Receipt {loan.receipt_number ?? '—'}{loan.due_date && new Date(loan.due_date) < new Date() ? ' · OVERDUE' : ''}</p></div>
            <div className="flex items-end gap-2"><label className="text-xs">Returned condition<select value={returnConditions[loan.id] ?? 'available'} onChange={(event) => setReturnConditions({ ...returnConditions, [loan.id]: event.target.value as 'available' | 'damaged' | 'lost' })} className={`${input} mt-1`}><option value="available">Good / available</option><option value="damaged">Damaged</option><option value="lost">Lost / not returned</option></select></label><button disabled={busy} type="button" onClick={() => void closeLoan(loan.id)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Record</button></div>
          </article>)}
          {activeLoans.length === 0 ? <p className="text-sm text-slate-500">No books are currently checked out.</p> : null}
        </div>
      </section>

      <section className={panel}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Circulation history</h2>
            <p className="mt-1 text-sm text-slate-500">A permanent checkout and return history for each physical title.</p>
          </div>
          <label className="text-sm font-medium">Book
            <select value={historyBookId} onChange={(event) => setHistoryBookId(event.target.value)} className={`${input} mt-1 min-w-64`}>
              <option value="">All physical books</option>
              {books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700">
              <tr><th className="px-3 py-3">Book / copy</th><th className="px-3 py-3">Borrower</th><th className="px-3 py-3">Borrowed</th><th className="px-3 py-3">Due</th><th className="px-3 py-3">Returned</th><th className="px-3 py-3">Duration</th><th className="px-3 py-3">Status</th></tr>
            </thead>
            <tbody>
              {historyLoans.map((loan) => <tr key={loan.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-3 py-3"><strong>{bookName(loan.book_id)}</strong><p className="text-xs text-slate-500">{copyCode(loan.copy_id)} · Receipt {loan.receipt_number ?? '—'}</p></td>
                <td className="px-3 py-3">{memberName(loan.student_id)}</td>
                <td className="px-3 py-3">{loan.checked_out_at ? new Date(loan.checked_out_at).toLocaleString() : '—'}</td>
                <td className="px-3 py-3">{loan.due_date ? new Date(loan.due_date).toLocaleString() : '—'}</td>
                <td className="px-3 py-3">{loan.returned_at ? new Date(loan.returned_at).toLocaleString() : '—'}</td>
                <td className="px-3 py-3">{loan.duration_days} days</td>
                <td className="px-3 py-3 capitalize">{loan.status.replace('_', ' ')}{loan.return_condition ? <span className="block text-xs text-slate-500">Condition: {loan.return_condition}</span> : null}</td>
              </tr>)}
            </tbody>
          </table>
          {historyLoans.length === 0 ? <p className="py-6 text-sm text-slate-500">No circulation history for this selection.</p> : null}
        </div>
      </section>
      <section className={panel}>
        <h2 className="text-xl font-semibold">Lost items and holds</h2>
        <p className="mt-1 text-sm text-slate-500">Resolve a lost-book record when the book is found or the library formally closes the case. This clears the borrower&apos;s physical-loan hold.</p>
        <div className="mt-4 space-y-3">
          {lostLoans.map((loan) => <article key={loan.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 p-4 dark:border-rose-900">
            <div><strong>{bookName(loan.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(loan.student_id)} · {copyCode(loan.copy_id)}</p></div>
            <div className="flex items-end gap-2"><label className="text-xs">Resolution<select value={lostResolution[loan.id] ?? 'available'} onChange={(event) => setLostResolution({ ...lostResolution, [loan.id]: event.target.value as 'available' | 'damaged' | 'withdrawn' })} className={`${input} mt-1`}><option value="available">Found / good</option><option value="damaged">Found / damaged</option><option value="withdrawn">Lost case closed; copy unavailable</option></select></label><button disabled={busy} type="button" onClick={() => void resolveLostLoan(loan.id)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Resolve hold</button></div>
          </article>)}
          {lostLoans.length === 0 ? <p className="text-sm text-slate-500">No unresolved lost items.</p> : null}
        </div>
      </section>
    </div>
      <ActionModal
        open={pendingAction !== null}
        title={pendingAction?.type === 'checkout' ? 'Confirm physical checkout?' : pendingAction?.type === 'close' ? 'Record physical-book return?' : pendingAction?.type === 'reject' ? 'Reject physical-book request?' : 'Resolve lost-book hold?'}
        description={pendingAction?.type === 'close' ? `The selected condition (${returnConditions[pendingAction.id] ?? 'available'}) will be recorded.` : undefined}
        confirmLabel={pendingAction?.type === 'checkout' ? 'Confirm checkout' : pendingAction?.type === 'close' ? 'Record return' : pendingAction?.type === 'reject' ? 'Reject request' : 'Resolve hold'}
        tone={pendingAction?.type === 'checkout' || pendingAction?.type === 'close' ? 'default' : 'danger'}
        busy={busy}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction
          setPendingAction(null)
          if (action?.type === 'checkout') void executeCheckout(action.id)
          else if (action?.type === 'close') void executeCloseLoan(action.id)
          else if (action?.type === 'reject') void executeRejectRequest(action.id)
          else if (action?.type === 'resolve') void executeResolveLostLoan(action.id)
        }}
      />
  </main>
}
