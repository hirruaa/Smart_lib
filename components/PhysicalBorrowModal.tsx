'use client'

import { useEffect, useState } from 'react'
import BaseModal from '@/components/BaseModal'
import ActionModal from '@/components/ActionModal'
import { getSupabase } from '@/utils/supabase/client'

type PhysicalBook = { id: number; title: string; author: string; category: string; catalog_type: 'physical' | 'hybrid'; related_book_ids?: number[] }
type LoanOption = { id: number; book_id: number; duration_days: number; fee_amount: number; is_active: boolean }
type PhysicalRequest = { id: number; status: string; payment_status: string; duration_days: number; fee_amount: number; requested_at: string; receipt_number: string | null; checked_out_at: string | null; due_date: string | null }
type PhysicalCopyLocation = { id: number; book_id: number; status: string; section: string | null; shelf_number: string | null; row_number: string | null; position_number: string | null; location: string | null }

type Props = {
  open: boolean
  book: PhysicalBook | null
  userId: string | null
  activeLoanCount: number
  loanLimit: number
  copyId?: number | null
  onClose: () => void
  onComplete: () => void
  onViewReceipt: (request: PhysicalRequest) => void
}

const input = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

export default function PhysicalBorrowModal({ open, book, userId, activeLoanCount, loanLimit, copyId = null, onClose, onComplete, onViewReceipt }: Props) {
  const [options, setOptions] = useState<LoanOption[]>([])
  const [availableCopies, setAvailableCopies] = useState(0)
  const [availableCopyLocations, setAvailableCopyLocations] = useState<PhysicalCopyLocation[]>([])
  const [borrowedBookIds, setBorrowedBookIds] = useState<number[]>([])
  const [alertBookIds, setAlertBookIds] = useState<number[]>([])
  const [selectedOption, setSelectedOption] = useState('')
  const [request, setRequest] = useState<PhysicalRequest | null>(null)
  const [availabilityAlertEnabled, setAvailabilityAlertEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmAction, setConfirmAction] = useState<'submit' | 'cancel' | 'join' | 'leave' | null>(null)

  useEffect(() => {
    if (!open || !book || !userId) return
    let active = true
    setLoading(true)
    setMessage('')
    setError('')
    void (async () => {
      const supabase = getSupabase()
      const bookIds = Array.from(new Set(book.related_book_ids?.length ? book.related_book_ids : [book.id]))
      const preferredBookIds = [book.id, ...bookIds.filter((id) => id !== book.id)]
      const [optionsResult, copiesResult, requestResult, alertSubscriptionResult] = await Promise.all([
        supabase.from('physical_loan_options').select('id,book_id,duration_days,fee_amount,is_active').in('book_id', bookIds).eq('is_active', true).order('duration_days'),
        supabase.from('physical_book_copies').select('id,book_id,status,section,shelf_number,row_number,position_number,location').in('book_id', bookIds),
        supabase.from('physical_book_requests').select('id,status,payment_status,duration_days,fee_amount,requested_at,receipt_number,checked_out_at,due_date').eq('student_id', userId).in('book_id', bookIds).in('status', ['pending', 'checked_out']).order('requested_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('physical_book_waitlist').select('book_id').eq('student_id', userId).in('book_id', bookIds),
      ])
      if (!active) return
      const failed = [optionsResult, copiesResult, requestResult, alertSubscriptionResult].find((result) => result.error)
      if (failed?.error) setError(`Unable to load physical-book availability: ${failed.error.message}`)
      const allOptions = (optionsResult.data ?? []) as LoanOption[]
      const allCopies = (copiesResult.data ?? []) as PhysicalCopyLocation[]
      const availableCounts = new Map<number, number>()
      for (const copy of allCopies.filter((item) => item.status === 'available')) availableCounts.set(copy.book_id, (availableCounts.get(copy.book_id) ?? 0) + 1)
      const preferredRank = new Map(preferredBookIds.map((id, index) => [id, index]))
      const nextOptions = allOptions
        .filter((option) => (availableCounts.get(option.book_id) ?? 0) > 0)
        .sort((left, right) => (preferredRank.get(left.book_id) ?? 999) - (preferredRank.get(right.book_id) ?? 999) || left.duration_days - right.duration_days)
        .filter((option, index, list) => list.findIndex((candidate) => candidate.duration_days === option.duration_days) === index)
      setOptions(nextOptions)
      setSelectedOption(String(nextOptions[0]?.id ?? ''))
      const availableCopiesData = allCopies.filter((item) => item.status === 'available')
      setAvailableCopyLocations(availableCopiesData)
      setAvailableCopies(availableCopiesData.length)
      setBorrowedBookIds(Array.from(new Set(allCopies.filter((item) => item.status === 'borrowed').map((item) => item.book_id))))
      setAlertBookIds((alertSubscriptionResult.data ?? []).map((entry: { book_id: number }) => entry.book_id))
      setRequest((requestResult.data ?? null) as PhysicalRequest | null)
      setAvailabilityAlertEnabled((alertSubscriptionResult.data ?? []).length > 0)
      setLoading(false)
    })()
    return () => { active = false }
  }, [open, book, userId])

  useEffect(() => {
    if (!open || !request?.id) return
    const requestId = request.id
    let active = true
    const supabase = getSupabase()
    const refreshRequest = () => {
      void supabase.from('physical_book_requests').select('id,status,payment_status,duration_days,fee_amount,requested_at,receipt_number,checked_out_at,due_date').eq('id', requestId).single().then(({ data }) => {
        if (active && data) {
          const updatedRequest = data as PhysicalRequest
          setRequest(updatedRequest)
          if (updatedRequest.status === 'checked_out') setMessage('')
        }
      })
    }
    const channel = supabase
      .channel(`physical-borrow-request-${requestId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'physical_book_requests', filter: `id=eq.${requestId}` }, refreshRequest)
      .subscribe()
    refreshRequest()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [open, request?.id])

  const executeSubmitRequest = async () => {
    if (!book || !userId || !selectedOption) return
    const option = options.find((item) => item.id === Number(selectedOption))
    if (!option) return
    setSaving(true)
    setError('')
    const supabase = getSupabase()
    try {
      const { data, error: requestError } = await supabase.rpc('request_physical_book', {
        p_book_id: option.book_id,
        p_copy_id: copyId ?? null,
        p_duration_days: option.duration_days,
        p_payment_method: 'cash',
        p_transaction_reference: null,
        p_payment_proof_path: null,
      })
      if (requestError) throw new Error(requestError.message)
      setRequest(data as PhysicalRequest)
      setAvailabilityAlertEnabled(false)
      setMessage('Borrow request submitted. The librarian assigns a copy when checkout is confirmed; this request does not hold a copy.')
      onComplete()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to submit the physical-book request.'
      setError(message.replace(/join (the )?(waitlist|availability queue) instead/i, 'turn on an availability alert from the book card instead'))
    } finally {
      setSaving(false)
    }
  }

  const submitRequest = () => setConfirmAction('submit')

  const cancelRequest = async () => {
    if (!request) return
    setSaving(true)
    const { error: cancelError } = await getSupabase().rpc('cancel_physical_book_request', { p_request_id: request.id })
    if (cancelError) setError(cancelError.message)
    else { setRequest(null); setMessage('Your borrow request was cancelled. It did not hold a copy.'); onComplete() }
    setSaving(false)
  }

  const confirmCancelRequest = () => setConfirmAction('cancel')

  const enableAvailabilityAlert = async () => {
    if (!book) return
    if (borrowedBookIds.length === 0) {
      setError('There are no borrowed copies to track right now. Contact the library for availability information.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const results = await Promise.all(borrowedBookIds.map((bookId) => getSupabase().rpc('join_physical_book_waitlist', { p_book_id: bookId })))
      const failure = results.find((result) => result.error)
      if (failure?.error && results.every((result) => result.error)) setError(failure.error.message.replace('availability queue', 'availability alerts'))
      else {
        setAvailabilityAlertEnabled(true)
        setAlertBookIds(borrowedBookIds)
        setMessage('You will be notified when a copy is available. The alert does not reserve a copy; borrowing is first come, first served.')
        onComplete()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to turn on the availability alert.')
    } finally {
      setSaving(false)
    }
  }

  const confirmEnableAvailabilityAlert = () => setConfirmAction('join')

  const disableAvailabilityAlert = async () => {
    if (!book) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const results = await Promise.all(alertBookIds.map((bookId) => getSupabase().rpc('leave_physical_book_waitlist', { p_book_id: bookId })))
      const failure = results.find((result) => result.error)
      if (failure?.error) setError(failure.error.message)
      else {
        setAvailabilityAlertEnabled(false)
        setAlertBookIds([])
        setMessage('Availability alert turned off.')
        onComplete()
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to turn off the availability alert.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDisableAvailabilityAlert = () => setConfirmAction('leave')

  const requestAvailable = availableCopies > 0
  const loanLimitReached = activeLoanCount >= loanLimit
  const availabilityLabel = availableCopies > 0
    ? `${availableCopies} copy${availableCopies === 1 ? '' : 'ies'} available now`
    : 'No copy currently available'

  return (
    <BaseModal open={open && Boolean(book)} title={book ? `${book.title} · Physical copy` : 'Physical copy'} description="Check copy locations and submit a borrow request. Library staff confirms checkout." onClose={onClose} size="lg">
      {loading ? <p className="text-sm text-slate-500">Checking availability...</p> : <div className="space-y-4">
        {!request ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/60"><p className="font-semibold">{availabilityLabel}</p><p className="mt-1 text-xs text-slate-500">{copyId ? 'The QR code identifies a copy; it does not hold it. ' : ''}A copy is assigned only when library staff confirms checkout.</p>{availableCopyLocations.length ? <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Available locations: {availableCopyLocations.map((copy) => [copy.section, copy.shelf_number && `Shelf ${copy.shelf_number}`, copy.row_number && `Row ${copy.row_number}`, copy.position_number && `Position ${copy.position_number}`].filter(Boolean).join(' · ') || copy.location || 'Location not set').join(', ')}</p> : null}</div> : null}
        {message ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">{message}</p> : null}
        {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
        {loanLimitReached && !request ? <div id="physical-loan-limit-note" role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">Active loan limit reached ({activeLoanCount}/{loanLimit})</p><p className="mt-1">A book awaiting staff return inspection still counts as active. Ask the librarian to complete a return before requesting another book.</p></div> : null}
        {request ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${request.status === 'checked_out' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`} aria-hidden="true">{request.status === 'checked_out' ? '✓' : <span className="request-pending-indicator" />}</span>
            <div><p className="font-semibold text-slate-900 dark:text-slate-100">{request.status === 'checked_out' ? 'Checkout confirmed' : 'Next step: visit the library desk'}</p><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{request.status === 'checked_out' ? 'Your book has been checked out. Your receipt is ready below.' : 'Show the librarian this request to confirm payment and complete checkout. They will assign an available copy, and your receipt will appear here. A request does not reserve a copy.'}</p></div>
          </div>
          {request.status === 'pending' && loanLimitReached ? <p role="status" className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-200">You already have three active loans. This pending request does not reserve a copy, and staff cannot check it out until your active loan count is below the limit.</p> : null}
          {request.status === 'checked_out' ? <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-950"><p className="flex justify-between gap-3"><span className="text-slate-500">Amount paid</span><strong>₱{Number(request.fee_amount).toFixed(2)}</strong></p>{request.receipt_number ? <p className="mt-2 flex justify-between gap-3"><span className="text-slate-500">Receipt number</span><strong className="font-mono">{request.receipt_number}</strong></p> : null}{request.due_date ? <p className="mt-2 flex justify-between gap-3"><span className="text-slate-500">Due date</span><strong>{new Date(request.due_date).toLocaleDateString()}</strong></p> : null}</div> : null}
          {request.status === 'checked_out' && request.receipt_number ? <button type="button" onClick={() => onViewReceipt(request)} className="pine-action mt-3 w-full rounded-xl px-4 py-2.5 text-sm font-semibold">View / print receipt</button> : request.status === 'pending' ? <button type="button" disabled={saving} onClick={confirmCancelRequest} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200">Remove request</button> : null}
        </div> : requestAvailable && loanLimitReached ? <button type="button" disabled aria-describedby="physical-loan-limit-note" className="pine-action w-full cursor-not-allowed rounded-xl px-4 py-3 text-sm font-semibold opacity-60">Active loan limit reached</button> : requestAvailable && options.length > 0 ? <>
          <label className="block text-sm font-medium">Loan period<select required value={selectedOption} onChange={(event) => setSelectedOption(event.target.value)} className={input}>{options.map((option) => <option key={option.id} value={option.id}>{option.duration_days} days</option>)}</select></label>
          <label className="block text-sm font-medium">Amount / cost (₱)<input readOnly aria-readonly="true" value={Number(options.find((option) => option.id === Number(selectedOption))?.fee_amount ?? 0).toFixed(2)} className={`${input} cursor-not-allowed border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300`} /><span className="mt-1 block text-xs text-slate-500">Set by the library; members cannot change this amount.</span></label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900/60"><span className="font-medium">Payment method</span><span className="ml-2 text-slate-600 dark:text-slate-300">Cash at library desk</span></div>
          <button type="button" disabled={saving} onClick={submitRequest} className="pine-action w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Submitting...' : 'Submit borrow request'}</button>
        </> : !requestAvailable ? <div>{availabilityAlertEnabled ? <div className="space-y-3"><p className="text-sm text-slate-600 dark:text-slate-300">You will be notified when a copy becomes available. The alert does not reserve a copy; borrowing is first come, first served.</p><button type="button" disabled={saving} onClick={confirmDisableAvailabilityAlert} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-600">{saving ? 'Saving...' : 'Turn off alerts'}</button></div> : <button type="button" disabled={saving} onClick={confirmEnableAvailabilityAlert} className="pine-action w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Saving...' : 'Notify me when available'}</button>}</div> : <p className="text-sm text-slate-500">Loan periods are not configured for this title yet.</p>}
      </div>}
      <ActionModal
        open={confirmAction !== null}
        title={confirmAction === 'cancel' ? 'Remove borrow request?' : confirmAction === 'leave' ? 'Turn off availability alerts?' : confirmAction === 'join' ? 'Turn on availability alerts?' : 'Submit borrow request?'}
        description={confirmAction === 'cancel' ? 'Your pending request will be cancelled. It does not hold a copy.' : confirmAction === 'submit' && book ? `Submit a borrow request for “${book.title}”. Staff confirms checkout and assigns a copy at the library desk.` : undefined}
        confirmLabel={confirmAction === 'cancel' ? 'Remove request' : confirmAction === 'leave' ? 'Turn off alerts' : confirmAction === 'join' ? 'Notify me' : 'Submit request'}
        tone={confirmAction === 'cancel' || confirmAction === 'leave' ? 'danger' : 'default'}
        busy={saving}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction
          setConfirmAction(null)
          if (action === 'submit') void executeSubmitRequest()
          else if (action === 'cancel') void cancelRequest()
          else if (action === 'join') void enableAvailabilityAlert()
          else if (action === 'leave') void disableAvailabilityAlert()
        }}
      />
    </BaseModal>
  )
}
