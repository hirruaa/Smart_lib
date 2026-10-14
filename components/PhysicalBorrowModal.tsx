'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import BaseModal from '@/components/BaseModal'
import ActionModal from '@/components/ActionModal'
import ResultModal from '@/components/ResultModal'
import { getSupabase } from '@/utils/supabase/client'

type PhysicalBook = { id: number; title: string; author: string; category: string; catalog_type: 'physical' | 'hybrid' }
type LoanOption = { id: number; duration_days: number; fee_amount: number; is_active: boolean }
type PhysicalRequest = { id: number; status: string; payment_status: string; duration_days: number; fee_amount: number; requested_at: string }
type PhysicalCopyLocation = { id: number; section: string | null; shelf_number: string | null; row_number: string | null; position_number: string | null; location: string | null }
type ActionResult = { status: 'success' | 'error'; title: string; message: string }

type Props = {
  open: boolean
  book: PhysicalBook | null
  userId: string | null
  copyId?: number | null
  onClose: () => void
  onComplete: () => void
}

const input = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100'

export default function PhysicalBorrowModal({ open, book, userId, copyId = null, onClose, onComplete }: Props) {
  const [options, setOptions] = useState<LoanOption[]>([])
  const [availableCopies, setAvailableCopies] = useState(0)
  const [availableCopyLocations, setAvailableCopyLocations] = useState<PhysicalCopyLocation[]>([])
  const [selectedOption, setSelectedOption] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash'>('cash')
  const [reference, setReference] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [request, setRequest] = useState<PhysicalRequest | null>(null)
  const [waitlisted, setWaitlisted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [confirmAction, setConfirmAction] = useState<'submit' | 'cancel' | 'join' | 'leave' | null>(null)

  useEffect(() => {
    if (!open || !book || !userId) return
    let active = true
    setLoading(true)
    setError('')
    setResult(null)
    void (async () => {
      const supabase = getSupabase()
      const [optionsResult, copiesResult, requestResult, waitlistResult] = await Promise.all([
        supabase.from('physical_loan_options').select('id,duration_days,fee_amount,is_active').eq('book_id', book.id).eq('is_active', true).order('duration_days'),
        supabase.from('physical_book_copies').select('id,section,shelf_number,row_number,position_number,location').eq('book_id', book.id).eq('status', 'available'),
        supabase.from('physical_book_requests').select('id,status,payment_status,duration_days,fee_amount,requested_at').eq('student_id', userId).eq('book_id', book.id).in('status', ['pending', 'checked_out']).order('requested_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('physical_book_waitlist').select('book_id').eq('student_id', userId).eq('book_id', book.id).maybeSingle(),
      ])
      if (!active) return
      const failed = [optionsResult, copiesResult, requestResult, waitlistResult].find((result) => result.error)
      if (failed?.error) setError(`Unable to load physical-book availability: ${failed.error.message}`)
      const nextOptions = (optionsResult.data ?? []) as LoanOption[]
      setOptions(nextOptions)
      setSelectedOption(String(nextOptions[0]?.id ?? ''))
      const availableCopiesData = (copiesResult.data ?? []) as PhysicalCopyLocation[]
      setAvailableCopyLocations(availableCopiesData)
      setAvailableCopies(availableCopiesData.length)
      setRequest((requestResult.data ?? null) as PhysicalRequest | null)
      setWaitlisted(Boolean(waitlistResult.data))
      setAvailableCopies(availableCopiesData.length)
      setLoading(false)
    })()
    return () => { active = false }
  }, [open, book, userId])

  const executeSubmitRequest = async () => {
    if (!book || !userId || !selectedOption) return
    const option = options.find((item) => item.id === Number(selectedOption))
    if (!option) return
    if (paymentMethod === 'gcash' && (!proofFile || !reference.trim())) {
      setError('Upload the GCash receipt and enter its transaction reference.')
      return
    }
    setSaving(true)
    setError('')
    let proofPath: string | null = null
    const supabase = getSupabase()
    try {
      if (paymentMethod === 'gcash' && proofFile) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(proofFile.type) || proofFile.size > 5 * 1024 * 1024) {
          throw new Error('Payment proof must be JPG, PNG, or WebP and no larger than 5 MB.')
        }
        const extension = proofFile.type === 'image/jpeg' ? 'jpg' : proofFile.type.split('/')[1]
        proofPath = `${userId}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('physical-payment-proofs').upload(proofPath, proofFile, { contentType: proofFile.type, upsert: false })
        if (uploadError) throw new Error(`Payment proof upload failed: ${uploadError.message}`)
      }
      const { data, error: requestError } = await supabase.rpc('request_physical_book', {
        p_book_id: book.id,
        p_copy_id: copyId ?? null,
        p_duration_days: option.duration_days,
        p_payment_method: paymentMethod,
        p_transaction_reference: paymentMethod === 'gcash' ? reference.trim() : null,
        p_payment_proof_path: proofPath,
      })
      if (requestError) throw new Error(requestError.message)
      setRequest(data as PhysicalRequest)
      setWaitlisted(false)
      setProofFile(null)
      onComplete()
      setResult({
        status: 'success',
        title: 'Borrow request submitted',
        message: `Your request for ${book.title} (${option.duration_days} days) was submitted successfully. Library staff will confirm checkout and assign a copy; this request does not reserve a copy.`,
      })
    } catch (cause) {
      let failureMessage = cause instanceof Error ? cause.message : 'Unable to submit the physical-book request.'
      if (proofPath) {
        try {
          const { error: cleanupError } = await supabase.storage.from('physical-payment-proofs').remove([proofPath])
          if (cleanupError) failureMessage += ` Payment proof cleanup also failed: ${cleanupError.message}`
        } catch (cleanupCause) {
          failureMessage += ` Payment proof cleanup also failed: ${cleanupCause instanceof Error ? cleanupCause.message : 'unknown error'}`
        }
      }
      setResult({
        status: 'error',
        title: 'Borrow request not submitted',
        message: failureMessage,
      })
    } finally {
      setSaving(false)
    }
  }

  const submitRequest = () => setConfirmAction('submit')

  const cancelRequest = async () => {
    if (!request) return
    setSaving(true)
    setError('')
    try {
      const { error: cancelError } = await getSupabase().rpc('cancel_physical_book_request', { p_request_id: request.id })
      if (cancelError) throw new Error(cancelError.message)
      setRequest(null)
      onComplete()
      setResult({ status: 'success', title: 'Borrow request cancelled', message: 'Your pending borrow request was cancelled. It did not hold a copy.' })
    } catch (cause) {
      setResult({ status: 'error', title: 'Request not cancelled', message: cause instanceof Error ? cause.message : 'Unable to cancel the borrow request.' })
    } finally {
      setSaving(false)
    }
  }

  const confirmCancelRequest = () => setConfirmAction('cancel')

  const joinWaitlist = async () => {
    if (!book) return
    setSaving(true)
    setError('')
    try {
      const { error: waitlistError } = await getSupabase().rpc('join_physical_book_waitlist', { p_book_id: book.id })
      if (waitlistError) throw new Error(waitlistError.message)
      setWaitlisted(true)
      onComplete()
      setResult({ status: 'success', title: 'Added to availability queue', message: `You joined the queue for ${book.title}. We will notify you when a copy becomes available.` })
    } catch (cause) {
      setResult({ status: 'error', title: 'Could not join the queue', message: cause instanceof Error ? cause.message : 'Unable to join the availability queue.' })
    } finally {
      setSaving(false)
    }
  }

  const confirmJoinWaitlist = () => setConfirmAction('join')

  const leaveWaitlist = async () => {
    if (!book) return
    setSaving(true)
    setError('')
    try {
      const { error: leaveError } = await getSupabase().rpc('leave_physical_book_waitlist', { p_book_id: book.id })
      if (leaveError) throw new Error(leaveError.message)
      setWaitlisted(false)
      onComplete()
      setResult({ status: 'success', title: 'Removed from availability queue', message: `You left the queue for ${book.title}.` })
    } catch (cause) {
      setResult({ status: 'error', title: 'Could not leave the queue', message: cause instanceof Error ? cause.message : 'Unable to leave the availability queue.' })
    } finally {
      setSaving(false)
    }
  }

  const confirmLeaveWaitlist = () => setConfirmAction('leave')

  const requestAvailable = availableCopies > 0
  const availabilityLabel = availableCopies > 0
    ? `${availableCopies} copy${availableCopies === 1 ? '' : 'ies'} available now`
    : 'No copy currently available'

  return (
    <BaseModal open={open && Boolean(book)} title={book ? `${book.title} · Physical copy` : 'Physical copy'} description="Check copy locations and submit a borrow request. Library staff confirms checkout." onClose={onClose} size="lg">
      {loading ? <p className="text-sm text-slate-500">Checking availability...</p> : <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/60"><p className="font-semibold">{availabilityLabel}</p><p className="mt-1 text-xs text-slate-500">{copyId ? 'The QR code identifies a copy; it does not hold it. ' : ''}A copy is assigned only when library staff confirms checkout.</p>{availableCopyLocations.length ? <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Available locations: {availableCopyLocations.map((copy) => [copy.section, copy.shelf_number && `Shelf ${copy.shelf_number}`, copy.row_number && `Row ${copy.row_number}`, copy.position_number && `Position ${copy.position_number}`].filter(Boolean).join(' · ') || copy.location || 'Location not set').join(', ')}</p> : null}</div>
        {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
        {request ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>Your request is <strong className="capitalize">{request.status.replace('_', ' ')}</strong>.</p>{request.status === 'pending' ? <button type="button" disabled={saving} onClick={confirmCancelRequest} className="mt-3 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">Cancel request</button> : null}</div> : requestAvailable && options.length > 0 ? <>
          <label className="block text-sm font-medium">Loan period and fee<select value={selectedOption} onChange={(event) => setSelectedOption(event.target.value)} className={input}>{options.map((option) => <option key={option.id} value={option.id}>{option.duration_days} days · ₱{Number(option.fee_amount).toFixed(2)}</option>)}</select></label>
          <label className="block text-sm font-medium">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'gcash')} className={input}><option value="cash">Cash at library desk</option><option value="gcash">GCash</option></select></label>
          {paymentMethod === 'gcash' ? <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><label className="block text-sm font-medium">GCash reference<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100} className={input} /></label><label className="block text-sm font-medium">Receipt image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => setProofFile(event.target.files?.[0] ?? null)} className={input} /></label></div> : null}
          <button type="button" disabled={saving} onClick={submitRequest} className="pine-action w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Submitting...' : 'Submit borrow request'}</button>
        </> : !requestAvailable ? <div>{waitlisted ? <div className="space-y-3"><p className="text-sm text-slate-600 dark:text-slate-300">You are already on the availability queue.</p><button type="button" disabled={saving} onClick={confirmLeaveWaitlist} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-600">{saving ? 'Leaving...' : 'Leave availability queue'}</button></div> : <button type="button" disabled={saving} onClick={confirmJoinWaitlist} className="pine-action w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Joining...' : 'Join availability queue'}</button>}</div> : <p className="text-sm text-slate-500">Loan periods are not configured for this title yet.</p>}
      </div>}
      <ActionModal
        open={confirmAction !== null}
        title={confirmAction === 'cancel' ? 'Cancel borrow request?' : confirmAction === 'leave' ? 'Leave availability queue?' : confirmAction === 'join' ? 'Join availability queue?' : 'Submit borrow request?'}
        description={confirmAction === 'cancel' ? 'Your pending request will be cancelled. It does not hold a copy.' : confirmAction === 'submit' && book ? `Submit a borrow request for “${book.title}”. Staff confirms checkout and assigns a copy at the library desk.` : undefined}
        confirmLabel={confirmAction === 'cancel' ? 'Cancel request' : confirmAction === 'leave' ? 'Leave queue' : confirmAction === 'join' ? 'Join queue' : 'Submit request'}
        tone={confirmAction === 'cancel' || confirmAction === 'leave' ? 'danger' : 'default'}
        busy={saving}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => {
          const action = confirmAction
          setConfirmAction(null)
          if (action === 'submit') void executeSubmitRequest()
          else if (action === 'cancel') void cancelRequest()
          else if (action === 'join') void joinWaitlist()
          else if (action === 'leave') void leaveWaitlist()
        }}
      />
      <ResultModal
        open={result !== null}
        status={result?.status ?? 'success'}
        successTitle={result?.title}
        message={result?.message ?? ''}
        onClose={() => setResult(null)}
      />
    </BaseModal>
  )
}
