'use client'

export const dynamic = 'force-dynamic'

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import { PhysicalLibrarySkeleton } from '@/components/skeletons'

type Book = { id: number; title: string; author: string; category: string; description: string | null; isbn: string | null; cover_image_url: string | null; catalog_type: string }
type Copy = { id: number; book_id: number; copy_code: string; qr_token: string; status: string; due_date: string | null }
type PublicCatalogItem = Book & {
  registered_copies: number
  available_copies: number
  borrowed_copies: number
  next_due_date: string | null
}
type Option = { id: number; book_id: number; duration_days: number; fee_amount: number; is_active: boolean }
type WaitlistEntry = { book_id: number; offered_copy_id: number | null; offer_expires_at: string | null }
type Request = {
  id: number; book_id: number; duration_days: number; fee_amount: number; payment_method: string
  payment_status: string; transaction_reference: string | null; status: string; requested_at: string; checked_out_at: string | null
  due_date: string | null; receipt_number: string | null
}

const panel = 'rounded-3xl border border-paper-300 bg-white p-5 shadow-sm dark:border-forest-700 dark:bg-forest-900/60'
const control = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

export default function PhysicalLibraryPage() {
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [publicAvailability, setPublicAvailability] = useState<Record<number, PublicCatalogItem>>({})
  const [copies, setCopies] = useState<Copy[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [requests, setRequests] = useState<Request[]>([])
  const [waitlistEntries, setWaitlistEntries] = useState<Record<number, WaitlistEntry>>({})
  const [userId, setUserId] = useState('')
  const [borrowerName, setBorrowerName] = useState('')
  const [targetCopy, setTargetCopy] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number>>({})
  const [paymentMethod, setPaymentMethod] = useState<Record<number, 'cash' | 'gcash'>>({})
  const [proofFiles, setProofFiles] = useState<Record<number, File | null>>({})
  const [references, setReferences] = useState<Record<number, string>>({})
  const [busyBookId, setBusyBookId] = useState<number | null>(null)
  const [extractingBookId, setExtractingBookId] = useState<number | null>(null)
  const [receiptRequestId, setReceiptRequestId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [browseOnly, setBrowseOnly] = useState(false)
  const [qrLookupStatus, setQrLookupStatus] = useState<'idle' | 'loading' | 'found' | 'not-found' | 'error'>('idle')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const supabase = getSupabase()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError && authError.name !== 'AuthSessionMissingError') {
        throw new Error(`Unable to check your sign-in status: ${authError.message}`)
      }
      if (!user) {
        const { data, error: catalogError } = await supabase.rpc('get_public_physical_catalog')
        if (catalogError) throw new Error(`Unable to load the public physical catalog: ${catalogError.message}`)
        const items = (data ?? []) as PublicCatalogItem[]
        setBooks(items)
        setPublicAvailability(Object.fromEntries(items.map((item) => [item.id, item])))
        setBrowseOnly(true)
        return
      }
      setBrowseOnly(false)
      setUserId(user.id)
      const [profileResult, bookResult, copyResult, optionResult, requestResult, waitlistResult] = await Promise.all([
        supabase.from('profiles').select('full_name,email').eq('id', user.id).maybeSingle(),
        supabase.from('books').select('id,title,author,category,description,isbn,cover_image_url,catalog_type').in('catalog_type', ['physical', 'hybrid']).order('title'),
        supabase.from('physical_book_copies').select('id,book_id,copy_code,qr_token,status,due_date'),
        supabase.from('physical_loan_options').select('id,book_id,duration_days,fee_amount,is_active').eq('is_active', true).order('duration_days'),
        supabase.from('physical_book_requests').select('id,book_id,duration_days,fee_amount,payment_method,payment_status,transaction_reference,status,requested_at,checked_out_at,due_date,receipt_number').eq('student_id', user.id).order('requested_at', { ascending: false }),
        supabase.from('physical_book_waitlist').select('book_id,offered_copy_id,offer_expires_at').eq('student_id', user.id),
      ])
      const failed = [profileResult, bookResult, copyResult, optionResult, requestResult, waitlistResult].find((result) => result.error)
      if (failed?.error) throw new Error(`Unable to load physical library: ${failed.error.message}`)
      setBorrowerName(profileResult.data?.full_name || profileResult.data?.email || user.email || 'Library member')
      setBooks((bookResult.data ?? []) as Book[])
      setCopies((copyResult.data ?? []) as Copy[])
      setOptions((optionResult.data ?? []) as Option[])
      setRequests((requestResult.data ?? []) as Request[])
      setWaitlistEntries(Object.fromEntries((waitlistResult.data ?? []).map((row) => [
        row.book_id as number,
        row as WaitlistEntry,
      ])))
      setPublicAvailability({})
    } catch (cause: unknown) {
      setLoadError(cause instanceof Error ? cause.message : 'Unable to load the physical library.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { setTargetCopy(new URLSearchParams(window.location.search).get('copy')) }, [])
  useEffect(() => {
    if (!targetCopy) {
      setQrLookupStatus('idle')
      return
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetCopy)) {
      setQrLookupStatus('not-found')
      return
    }
    let active = true
    setQrLookupStatus('loading')
    void (async () => {
      try {
        const { data, error: copyError } = await getSupabase().rpc('get_public_physical_copy', { p_qr_token: targetCopy })
        if (!active) return
        if (copyError) {
          setQrLookupStatus('error')
          setError(`Unable to look up this QR label: ${copyError.message}`)
          return
        }
        const copy = Array.isArray(data) ? data[0] : data
        if (!copy) {
          setQrLookupStatus('not-found')
          return
        }
        setQrLookupStatus('found')
        setCopies((current) => current.some((item) => item.id === copy.copy_id) ? current : [
          ...current,
          { id: copy.copy_id, book_id: copy.book_id, copy_code: copy.copy_code, qr_token: targetCopy, status: copy.status, due_date: copy.due_date },
        ])
      } catch (cause: unknown) {
        if (active) {
          setQrLookupStatus('error')
          setError(cause instanceof Error ? `Unable to look up this QR label: ${cause.message}` : 'Unable to look up this QR label.')
        }
      }
    })()
    return () => { active = false }
  }, [targetCopy])

  const receipt = requests.find((request) => request.id === receiptRequestId)
  const receiptBook = receipt ? books.find((book) => book.id === receipt.book_id) : null
  const targetBookId = useMemo(() => copies.find((copy) => copy.qr_token === targetCopy)?.book_id, [copies, targetCopy])
  const targetCopyId = useMemo(() => copies.find((copy) => copy.qr_token === targetCopy)?.id, [copies, targetCopy])
  const shownBooks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return books.filter((book) => {
      if (targetBookId && book.id !== targetBookId) return false
      return !normalizedSearch || `${book.title} ${book.author} ${book.category}`.toLowerCase().includes(normalizedSearch)
    })
  }, [books, search, targetBookId])

  const extractPaymentReference = async (bookId: number, file: File | null) => {
    if (!file) { setError('Choose the GCash receipt image first.'); return }
    setExtractingBookId(bookId)
    setError('')
    const formData = new FormData()
    formData.append('image', file)
    const response = await fetch('/api/ai/extract-payment-reference', { method: 'POST', body: formData })
    const result = await response.json()
    if (!response.ok) setError(result.error || 'Unable to read the transaction reference.')
    else if (result.reference) {
      setReferences((current) => ({ ...current, [bookId]: result.reference }))
      setMessage(`Gemini found a possible reference (${Math.round(result.confidence * 100)}% confidence). Check it against your receipt; this does not verify payment.`)
    } else setError('No transaction reference was detected. Enter it manually from the receipt.')
    setExtractingBookId(null)
  }

  const cancelRequest = async (requestId: number) => {
    setBusyBookId(requestId)
    setError('')
    const { error: cancelError } = await getSupabase().rpc('cancel_physical_book_request', { p_request_id: requestId })
    if (cancelError) setError(cancelError.message)
    else { setMessage('Your request was cancelled and the copy released.'); await load() }
    setBusyBookId(null)
  }

  const leaveWaitlist = async (bookId: number) => {
    setBusyBookId(bookId)
    setError('')
    const { error: leaveError } = await getSupabase().rpc('leave_physical_book_waitlist', { p_book_id: bookId })
    if (leaveError) setError(leaveError.message)
    else { setMessage('You have left the waitlist.'); await load() }
    setBusyBookId(null)
  }

  const submitRequest = async (bookId: number) => {
    const optionId = selectedOptions[bookId] ?? options.find((option) => option.book_id === bookId)?.id
    const option = options.find((item) => item.id === optionId)
    if (!option) { setError('The librarian has not configured a physical loan period for this book yet.'); return }
    const method = paymentMethod[bookId] ?? 'cash'
    const file = proofFiles[bookId]
    const reference = (references[bookId] ?? '').trim()
    if (method === 'gcash' && (!file || !reference)) { setError('Upload the GCash receipt image and enter its transaction reference.'); return }

    setBusyBookId(bookId)
    setError('')
    setMessage('')
    const supabase = getSupabase()
    let proofPath: string | null = null
    if (method === 'gcash' && file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        setError('Payment proof must be a JPG, PNG, or WebP image no larger than 5 MB.')
        setBusyBookId(null)
        return
      }
      const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
      proofPath = `${userId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('physical-payment-proofs').upload(proofPath, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        setError(`Payment proof upload failed: ${uploadError.message}`)
        setBusyBookId(null)
        return
      }
    }

    const offer = waitlistEntries[bookId]
    const offerActive = Boolean(offer?.offered_copy_id && offer.offer_expires_at
      && new Date(offer.offer_expires_at).getTime() > Date.now())
    const { error: requestError } = offerActive
      ? await supabase.rpc('accept_physical_waitlist_offer', {
        p_book_id: bookId,
        p_duration_days: option.duration_days,
        p_payment_method: method,
        p_transaction_reference: method === 'gcash' ? reference : null,
        p_payment_proof_path: proofPath,
      })
      : await supabase.rpc('request_physical_book', {
        p_book_id: bookId,
        p_copy_id: targetBookId === bookId && copies.some((copy) => copy.id === targetCopyId && copy.status === 'available')
          ? targetCopyId
          : null,
        p_duration_days: option.duration_days,
        p_payment_method: method,
        p_transaction_reference: method === 'gcash' ? reference : null,
        p_payment_proof_path: proofPath,
      })
    if (requestError) {
      if (proofPath) await supabase.storage.from('physical-payment-proofs').remove([proofPath])
      setError(requestError.message)
    } else {
      setMessage('Request submitted. Visit the librarian to confirm the physical checkout and payment.')
      await load()
    }
    setBusyBookId(null)
  }

  const joinWaitlist = async (bookId: number) => {
    setBusyBookId(bookId)
    setError('')
    setMessage('')
    const { error: waitlistError } = await getSupabase().rpc('join_physical_book_waitlist', { p_book_id: bookId })
    if (waitlistError) setError(waitlistError.message)
    else {
      setMessage('You are on the waitlist. We will notify you when a copy becomes available.')
      await load()
    }
    setBusyBookId(null)
  }

  if (loading) return <main aria-label="Loading physical collection" className="surface-page min-h-screen px-4 py-6 sm:px-8"><div className="mx-auto max-w-6xl space-y-6"><div className={`${panel} animate-pulse space-y-4`}><div className="h-3 w-36 rounded bg-slate-200 dark:bg-slate-700" /><div className="h-8 w-64 max-w-full rounded bg-slate-200 dark:bg-slate-700" /><div className="h-4 w-full max-w-xl rounded bg-slate-200 dark:bg-slate-700" /></div><div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className={`${panel} flex animate-pulse gap-4`}><div className="h-36 w-24 shrink-0 rounded-lg bg-slate-200 dark:bg-slate-700" /><div className="flex-1 space-y-3 pt-2"><div className="h-5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" /><div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700" /><div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-700" /><div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-700" /></div></div>)}</div></div></main>

  return <main className="surface-page min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-8">
    <div className="print:hidden">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className={panel}>
        {!browseOnly ? <button type="button" onClick={() => router.push('/dashboard')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Member dashboard</button> : <button type="button" onClick={() => router.push('/')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Smart Lib home</button>}
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Physical collection</p><h1 className="mt-2 text-3xl font-semibold">Browse {browseOnly ? 'the collection' : 'and request books'}</h1><p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Check copy availability and expected returns before visiting. Borrower identities are never shown in this catalog.</p></div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, author, category" className={`${control} max-w-sm`} />
        </div>
      </header>

      {loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800"><span>{loadError}</span><button type="button" onClick={() => void load()} className="rounded-lg border border-rose-400 px-3 py-2 font-semibold">Retry</button></div> : null}
      {error ? <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : null}
      {message ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p> : null}
      {targetCopy && qrLookupStatus === 'loading' ? <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Looking up scanned copy…</p> : null}
      {targetCopy && qrLookupStatus === 'not-found' ? <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">This QR label is invalid or its copy was removed. Browse the catalog or ask the librarian for help.</p> : null}

      {loading ? (
        <PhysicalLibrarySkeleton />
      ) : (
      <section className="grid gap-4 md:grid-cols-2">
        {shownBooks.map((book) => {
          const bookCopies = copies.filter((copy) => copy.book_id === book.id)
          const summary = publicAvailability[book.id]
          const available = summary?.available_copies ?? bookCopies.filter((copy) => copy.status === 'available').length
          const registeredCopies = summary?.registered_copies ?? bookCopies.length
          const bookOptions = options.filter((option) => option.book_id === book.id)
          const borrowedCopies = bookCopies.filter((copy) => copy.status === 'borrowed' && copy.due_date)
          const borrowedCount = summary?.borrowed_copies ?? borrowedCopies.length
          const nextDueDateValue = summary?.next_due_date ?? borrowedCopies.map((copy) => copy.due_date).sort()[0] ?? null
          const nextDueDate = nextDueDateValue ? new Date(nextDueDateValue) : null
          const activeRequest = requests.find((request) => request.book_id === book.id && ['pending', 'checked_out'].includes(request.status))
          const selectedOption = bookOptions.find((option) => option.id === (selectedOptions[book.id] ?? bookOptions[0]?.id))
          const scannedCopy = bookCopies.find((copy) => copy.qr_token === targetCopy)
          const waitlistEntry = waitlistEntries[book.id]
          const offerExpiresAt = waitlistEntry?.offer_expires_at ? new Date(waitlistEntry.offer_expires_at) : null
          const offerActive = Boolean(waitlistEntry?.offered_copy_id && offerExpiresAt
            && offerExpiresAt.getTime() > Date.now())
          const offeredCopy = offerActive ? copies.find((copy) => copy.id === waitlistEntry.offered_copy_id) : null
          return <article key={book.id} className={panel}>
            <div className="flex gap-4">
              {book.cover_image_url ? <img src={book.cover_image_url} alt={`Cover of ${book.title}`} className="h-36 w-24 shrink-0 rounded-lg border border-slate-200 bg-white object-cover dark:border-slate-700" /> : <div aria-hidden="true" className="flex h-36 w-24 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-center text-xs text-slate-400 dark:bg-slate-800">No cover<br />available</div>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{book.title}</h2><p className="mt-1 text-sm text-slate-500">{book.author} · {book.category}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${available > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{available > 0 ? `${available} of ${registeredCopies} available` : registeredCopies ? 'No copies available now' : 'Not inventoried'}</span></div>
                {book.isbn ? <p className="mt-2 text-xs text-slate-500">ISBN: {book.isbn}</p> : null}
                {book.description ? <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{book.description}</p> : null}
              </div>
            </div>
            {available === 0 && registeredCopies ? <p className="mt-3 text-xs text-slate-500">{borrowedCount} {borrowedCount === 1 ? 'copy is' : 'copies are'} currently borrowed{nextDueDate ? ` · earliest expected return ${nextDueDate.toLocaleDateString()}` : ''}. Borrower identities are private.</p> : null}
            {scannedCopy ? <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">Scanned copy: {scannedCopy.copy_code} · {scannedCopy.status}</p> : null}
            {browseOnly ? <div className="mt-4 rounded-xl border border-paper-300 bg-paper-50 p-4 dark:border-forest-700 dark:bg-forest-800/60"><p className="text-sm text-slate-600 dark:text-slate-300">Sign in to request a copy or join the availability list. Checkout and any physical-book payment are confirmed by the librarian.</p><button type="button" onClick={() => router.push(`/login?next=${encodeURIComponent(`/physical-library${targetCopy ? `?copy=${targetCopy}` : ''}`)}`)} className="pine-action mt-3 rounded-xl px-4 py-2.5 text-sm font-semibold">Sign in to request</button></div> : bookOptions.length && (available > 0 || offerActive) ? <div className="mt-4 space-y-3">
              {offerActive && offerExpiresAt ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">A copy{offeredCopy ? ` (${offeredCopy.copy_code})` : ''} is reserved for you until {offerExpiresAt.toLocaleString()}.</p> : null}
              <label className="block text-sm font-medium">Loan period and fee
                <select className={`${control} mt-1.5`} value={selectedOption?.id ?? ''} onChange={(event) => setSelectedOptions({ ...selectedOptions, [book.id]: Number(event.target.value) })}>
                  {bookOptions.map((option) => <option key={option.id} value={option.id}>{option.duration_days} days · ₱{Number(option.fee_amount).toFixed(2)}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">Payment at the librarian desk
                <select className={`${control} mt-1.5`} value={paymentMethod[book.id] ?? 'cash'} onChange={(event) => setPaymentMethod({ ...paymentMethod, [book.id]: event.target.value as 'cash' | 'gcash' })}>
                  <option value="cash">Cash</option><option value="gcash">GCash</option>
                </select>
              </label>
              {paymentMethod[book.id] === 'gcash' ? <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <label className="block text-sm font-medium">GCash transaction reference<input required value={references[book.id] ?? ''} onChange={(event) => setReferences({ ...references, [book.id]: event.target.value })} maxLength={100} className={`${control} mt-1.5`} placeholder="Enter reference from GCash receipt" /></label>
                <label className="block text-sm font-medium">Upload payment receipt<input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => setProofFiles({ ...proofFiles, [book.id]: event.target.files?.[0] ?? null })} className={`${control} mt-1.5`} /></label>
                <p className="text-xs text-slate-500">Optional reference extraction sends this image to Google Gemini. Review the result manually; it cannot verify payment. The librarian still checks the proof and reference.</p>
                <button type="button" disabled={extractingBookId === book.id} onClick={() => void extractPaymentReference(book.id, proofFiles[book.id] ?? null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700">{extractingBookId === book.id ? 'Reading receipt...' : 'Extract reference with Gemini'}</button>
              </div> : null}
              {activeRequest ? <div className="space-y-2"><p className="rounded-xl bg-slate-100 p-3 text-sm capitalize dark:bg-slate-800">Your request: {activeRequest.status.replace('_', ' ')}</p>{activeRequest.status === 'pending' ? <button type="button" disabled={busyBookId === activeRequest.id} onClick={() => void cancelRequest(activeRequest.id)} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">Cancel request</button> : null}</div> : <button type="button" disabled={busyBookId === book.id} onClick={() => void submitRequest(book.id)} className="pine-action w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{busyBookId === book.id ? 'Submitting...' : offerActive ? 'Accept reserved copy' : scannedCopy?.status === 'available' ? `Request scanned copy ${scannedCopy.copy_code}` : scannedCopy && available > 0 ? 'Request another available copy' : 'Request this book'}</button>}
            </div> : available > 0 ? <p className="mt-4 text-sm text-slate-500">Loan periods and fees are not configured yet; ask the librarian.</p> : borrowedCount > 0 ? <div className="mt-4">{waitlistEntry ? <p className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">{waitlistEntry.offered_copy_id ? 'Your reservation is being refreshed.' : 'You are in the availability queue. A copy will be reserved for the next member in line.'}</p> : <button type="button" disabled={busyBookId === book.id} onClick={() => void joinWaitlist(book.id)} className="pine-action w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{busyBookId === book.id ? 'Joining...' : 'Join availability queue'}</button>}</div> : null}
            {!offerActive && waitlistEntry?.offered_copy_id ? <div className="mt-3 flex items-center justify-between gap-3 text-xs text-amber-800"><span>Your offer has expired or is being refreshed.</span><button type="button" onClick={() => void load()} className="font-semibold underline">Refresh</button></div> : null}
            {waitlistEntry ? <button type="button" disabled={busyBookId === book.id} onClick={() => void leaveWaitlist(book.id)} className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700">Leave waitlist</button> : null}
          </article>
        })}
        {shownBooks.length === 0 && !loadError ? <p className={`${panel} text-sm text-slate-500`}>No physical titles match your search.</p> : null}
      </section>
      )}

      {!browseOnly ? <section className={panel}>
        <h2 className="text-xl font-semibold">My physical requests and receipts</h2>
        <div className="mt-4 space-y-3">
          {requests.map((request) => {
            const book = books.find((item) => item.id === request.book_id)
            return <article key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-paper-300 p-4 dark:border-forest-700">
              <div><strong>{book?.title ?? `Book #${request.book_id}`}</strong><p className="mt-1 text-sm capitalize text-slate-500">{request.status.replace('_', ' ')} · {request.duration_days} days · ₱{Number(request.fee_amount).toFixed(2)} · {request.payment_method === 'gcash' ? `GCash (${request.transaction_reference ?? 'reference pending'})` : 'Cash'}</p>{request.due_date ? <p className="mt-1 text-xs text-slate-500">Due {new Date(request.due_date).toLocaleDateString()}</p> : null}</div>
              {request.receipt_number ? <button type="button" onClick={() => setReceiptRequestId(request.id)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">View / print receipt {request.receipt_number}</button> : null}
            </article>
          })}
          {requests.length === 0 ? <p className="text-sm text-slate-500">Your physical-book activity will appear here.</p> : null}
        </div>
      </section> : null}
    </div>
    </div>
    {receipt ? <section className="physical-receipt" aria-label="Physical book payment receipt">
      <p className="text-sm font-semibold uppercase tracking-widest">Smart Lib · Physical Book Receipt</p>
      <h1 className="mt-5 text-2xl font-bold">{receiptBook?.title ?? `Book #${receipt.book_id}`}</h1>
      <p className="mt-1">{receiptBook?.author ?? 'Library collection'}</p>
      <hr className="my-5" />
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt>Receipt number</dt><dd>{receipt.receipt_number}</dd>
        <dt>Borrower</dt><dd>{borrowerName}</dd>
        <dt>Loan period</dt><dd>{receipt.duration_days} days</dd>
        <dt>Amount paid</dt><dd>₱{Number(receipt.fee_amount).toFixed(2)}</dd>
        <dt>Payment method</dt><dd>{receipt.payment_method.toUpperCase()}</dd>
        {receipt.transaction_reference ? <><dt>Transaction reference</dt><dd>{receipt.transaction_reference}</dd></> : null}
        <dt>Checkout date</dt><dd>{receipt.checked_out_at ? new Date(receipt.checked_out_at).toLocaleDateString() : '—'}</dd>
        <dt>Due date</dt><dd>{receipt.due_date ? new Date(receipt.due_date).toLocaleDateString() : '—'}</dd>
      </dl>
      <p className="mt-8 text-xs text-slate-500">Checkout and payment were confirmed by the library staff.</p>
      <button type="button" className="mt-6 rounded-xl border border-slate-400 px-4 py-2 text-sm font-semibold print:hidden" onClick={() => window.print()}>Print receipt</button>
      <button type="button" className="ml-2 mt-6 rounded-xl border border-slate-400 px-4 py-2 text-sm font-semibold print:hidden" onClick={() => setReceiptRequestId(null)}>Close</button>
    </section> : null}
  </main>
}
