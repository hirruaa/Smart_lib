'use client'

import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { getSupabase } from '@/utils/supabase/client'
import { AdminPhysicalSkeleton } from '@/components/skeletons/AdminDashboardSkeleton'

type Book = { id: number; title: string; catalog_type: string; cover_image_url: string | null }
type Copy = { id: number; book_id: number; copy_code: string; qr_token: string; status: string; location: string | null }
type Option = { id: number; book_id: number; duration_days: number; fee_amount: number; is_active: boolean }
type Loan = {
  id: number; student_id: string; book_id: number; copy_id: number | null; duration_days: number
  fee_amount: number; payment_method: string; payment_status: string; transaction_reference: string | null
  payment_proof_path: string | null; status: string; requested_at: string; due_date: string | null
  receipt_number: string | null; reservation_expires_at: string | null
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
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [qrImages, setQrImages] = useState<Record<string, string>>({})
  const [copyForm, setCopyForm] = useState({ bookId: '', quantity: '1', prefix: '', location: '' })
  const [newPhysicalBook, setNewPhysicalBook] = useState({
    title: '', author: '', category: '', isbn: '', description: '', quantity: '1', prefix: '', location: '',
  })
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [optionForm, setOptionForm] = useState({ bookId: '', durationDays: '14', feeAmount: '20' })
  const [returnConditions, setReturnConditions] = useState<Record<number, 'available' | 'damaged' | 'lost'>>({})
  const [lostResolution, setLostResolution] = useState<Record<number, 'available' | 'damaged' | 'withdrawn'>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError || profile?.role !== 'admin') { router.replace('/unauthorized'); return }
    const [bookResult, copyResult, optionResult, loanResult, memberResult] = await Promise.all([
      supabase.from('books').select('id,title,catalog_type,cover_image_url').order('title'),
      supabase.from('physical_book_copies').select('id,book_id,copy_code,qr_token,status,location').order('copy_code'),
      supabase.from('physical_loan_options').select('id,book_id,duration_days,fee_amount,is_active').order('book_id').order('duration_days'),
      supabase.from('physical_book_requests').select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,transaction_reference,payment_proof_path,status,requested_at,due_date,receipt_number,reservation_expires_at').order('requested_at', { ascending: false }),
      supabase.from('profiles').select('id,email,full_name').in('role', ['student', 'faculty']),
    ])
    const failed = [bookResult, copyResult, optionResult, loanResult, memberResult].find((result) => result.error)
    if (failed?.error) setError(`Unable to load physical circulation: ${failed.error.message}`)
    setBooks((bookResult.data ?? []) as Book[])
    setCopies((copyResult.data ?? []) as Copy[])
    setOptions((optionResult.data ?? []) as Option[])
    setLoans((loanResult.data ?? []) as Loan[])
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
    const { error: saveError } = await getSupabase().rpc('admin_set_physical_loan_option', {
      p_book_id: Number(optionForm.bookId), p_duration_days: Number(optionForm.durationDays),
      p_fee_amount: Number(optionForm.feeAmount), p_is_active: true,
    })
    if (saveError) setError(saveError.message)
    else { await load(); setMessage('Physical loan period and fee saved.') }
    setBusy(false)
  }

  const checkout = async (loanId: number) => {
    setBusy(true); setError(''); setMessage('')
    const { error: actionError } = await getSupabase().rpc('admin_confirm_physical_checkout', { p_request_id: loanId })
    if (actionError) setError(actionError.message)
    else { await load(); setMessage('Payment confirmed and physical checkout recorded. Digital receipt issued to the borrower.') }
    setBusy(false)
  }

  const closeLoan = async (loanId: number) => {
    setBusy(true); setError(''); setMessage('')
    const { error: actionError } = await getSupabase().rpc('admin_close_physical_loan', {
      p_request_id: loanId, p_copy_condition: returnConditions[loanId] ?? 'available',
    })
    if (actionError) setError(actionError.message)
    else { await load(); setMessage('Return condition recorded and loan closed.') }
    setBusy(false)
  }

  const rejectRequest = async (loanId: number) => {
    setBusy(true); setError(''); setMessage('')
    const { error: actionError } = await getSupabase().rpc('admin_decide_physical_request', {
      p_request_id: loanId, p_decision: 'rejected',
    })
    if (actionError) setError(actionError.message)
    else { await load(); setMessage('Request rejected and its reserved copy released.') }
    setBusy(false)
  }

  const resolveLostLoan = async (loanId: number) => {
    setBusy(true); setError(''); setMessage('')
    const { error: actionError } = await getSupabase().rpc('admin_resolve_lost_physical_loan', {
      p_request_id: loanId, p_copy_condition: lostResolution[loanId] ?? 'available',
    })
    if (actionError) setError(actionError.message)
    else { await load(); setMessage('Lost-book record resolved and the library-only hold lifted.') }
    setBusy(false)
  }

  const openProof = async (path: string) => {
    const { data, error: proofError } = await getSupabase().storage.from('physical-payment-proofs').createSignedUrl(path, 60)
    if (proofError) setError(`Unable to open payment proof: ${proofError.message}`)
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <AdminPhysicalSkeleton />
  const waitingLoans = loans.filter((loan) => ['pending', 'waitlisted'].includes(loan.status))
  const activeLoans = loans.filter((loan) => loan.status === 'checked_out')
  const lostLoans = loans.filter((loan) => loan.status === 'lost')
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
      {error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : null}
      {message ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p> : null}

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
          <select required value={optionForm.bookId} onChange={(event) => setOptionForm({ ...optionForm, bookId: event.target.value })} className={input}><option value="">Choose a book</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Loan days<input required type="number" min="1" max="365" value={optionForm.durationDays} onChange={(event) => setOptionForm({ ...optionForm, durationDays: event.target.value })} className={`${input} mt-1`} /></label><label className="text-sm">Fee (₱)<input required type="number" min="0" step="0.01" value={optionForm.feeAmount} onChange={(event) => setOptionForm({ ...optionForm, feeAmount: event.target.value })} className={`${input} mt-1`} /></label></div>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Save loan option</button>
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
  </main>
}
