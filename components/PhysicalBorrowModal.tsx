'use client'

import { ChangeEvent, useEffect, useState } from 'react'
import BaseModal from '@/components/BaseModal'
import ActionModal from '@/components/ActionModal'
import { getSupabase } from '@/utils/supabase/client'

type PhysicalBook = { id: number; title: string; author: string; category: string; catalog_type: 'physical' | 'hybrid' }
type LoanOption = { id: number; duration_days: number; fee_amount: number; is_active: boolean }
type PhysicalRequest = { id: number; status: string; payment_status: string; duration_days: number; fee_amount: number; requested_at: string }
type WaitlistOffer = { offered_copy_id: number | null; offer_expires_at: string | null }

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
  const [selectedOption, setSelectedOption] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash'>('cash')
  const [reference, setReference] = useState('')
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [request, setRequest] = useState<PhysicalRequest | null>(null)
  const [waitlistOffer, setWaitlistOffer] = useState<WaitlistOffer | null>(null)
  const [waitlisted, setWaitlisted] = useState(false)
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
      const [optionsResult, copiesResult, requestResult, waitlistResult] = await Promise.all([
        supabase.from('physical_loan_options').select('id,duration_days,fee_amount,is_active').eq('book_id', book.id).eq('is_active', true).order('duration_days'),
        supabase.from('physical_book_copies').select('id').eq('book_id', book.id).eq('status', 'available'),
        supabase.from('physical_book_requests').select('id,status,payment_status,duration_days,fee_amount,requested_at').eq('student_id', userId).eq('book_id', book.id).in('status', ['pending', 'checked_out']).order('requested_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('physical_book_waitlist').select('offered_copy_id,offer_expires_at').eq('student_id', userId).eq('book_id', book.id).maybeSingle(),
      ])
      if (!active) return
      const failed = [optionsResult, copiesResult, requestResult, waitlistResult].find((result) => result.error)
      if (failed?.error) setError(`Unable to load physical-book availability: ${failed.error.message}`)
      const nextOptions = (optionsResult.data ?? []) as LoanOption[]
      setOptions(nextOptions)
      setSelectedOption(String(nextOptions[0]?.id ?? ''))
      setAvailableCopies(copiesResult.data?.length ?? 0)
      setRequest((requestResult.data ?? null) as PhysicalRequest | null)
      const offer = (waitlistResult.data ?? null) as WaitlistOffer | null
      const offerIsActive = Boolean(offer?.offered_copy_id && offer.offer_expires_at && new Date(offer.offer_expires_at) > new Date())
      setWaitlistOffer(offerIsActive ? offer : null)
      setWaitlisted(Boolean(waitlistResult.data))
      setAvailableCopies(Math.max(copiesResult.data?.length ?? 0, offerIsActive ? 1 : 0))
      if (offerIsActive) setMessage(`A copy is reserved for you until ${new Date(offer?.offer_expires_at as string).toLocaleString()}.`)
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
      const { data, error: requestError } = await supabase.rpc(waitlistOffer ? 'accept_physical_waitlist_offer' : 'request_physical_book', waitlistOffer ? {
        p_book_id: book.id,
        p_duration_days: option.duration_days,
        p_payment_method: paymentMethod,
        p_transaction_reference: paymentMethod === 'gcash' ? reference.trim() : null,
        p_payment_proof_path: proofPath,
      } : {
        p_book_id: book.id,
        p_copy_id: copyId,
        p_duration_days: option.duration_days,
        p_payment_method: paymentMethod,
        p_transaction_reference: paymentMethod === 'gcash' ? reference.trim() : null,
        p_payment_proof_path: proofPath,
      })
      if (requestError) throw new Error(requestError.message)
      setRequest(data as PhysicalRequest)
      setMessage(waitlistOffer ? 'Waitlist offer accepted. Visit the librarian to confirm payment and checkout.' : 'Request submitted. Visit the librarian to confirm payment and checkout.')
      setWaitlistOffer(null)
      setProofFile(null)
      onComplete()
    } catch (cause) {
      if (proofPath) await supabase.storage.from('physical-payment-proofs').remove([proofPath])
      setError(cause instanceof Error ? cause.message : 'Unable to submit the physical-book request.')
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
    else { setRequest(null); setMessage('Your physical-book request was cancelled.'); onComplete() }
    setSaving(false)
  }

  const confirmCancelRequest = () => setConfirmAction('cancel')

  const joinWaitlist = async () => {
    if (!book) return
    setSaving(true)
    const { error: waitlistError } = await getSupabase().rpc('join_physical_book_waitlist', { p_book_id: book.id })
    if (waitlistError) setError(waitlistError.message)
    else { setWaitlisted(true); setMessage('You joined the availability queue. We will notify you when a copy is available.'); onComplete() }
    setSaving(false)
  }

  const confirmJoinWaitlist = () => setConfirmAction('join')

  const leaveWaitlist = async () => {
    if (!book) return
    setSaving(true)
    const { error: leaveError } = await getSupabase().rpc('leave_physical_book_waitlist', { p_book_id: book.id })
    if (leaveError) setError(leaveError.message)
    else { setWaitlisted(false); setWaitlistOffer(null); setMessage('You left the availability queue.'); onComplete() }
    setSaving(false)
  }

  const confirmLeaveWaitlist = () => setConfirmAction('leave')

  const requestAvailable = Boolean(waitlistOffer) || availableCopies > 0
  const availabilityLabel = waitlistOffer
    ? 'A copy is reserved for you'
    : availableCopies > 0
      ? `${availableCopies} copy${availableCopies === 1 ? '' : 'ies'} available`
      : 'No copy currently available'
  const requestActionLabel = waitlistOffer ? 'Accept reserved copy' : 'Request this copy'

  return (
    <BaseModal open={open && Boolean(book)} title={book ? `${book.title} · Physical copy` : 'Physical copy'} description="Reserve a library copy, choose a loan period, and submit payment details." onClose={onClose} size="lg">
      {loading ? <p className="text-sm text-slate-500">Checking availability...</p> : <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/60"><p className="font-semibold">{availabilityLabel}</p><p className="mt-1 text-xs text-slate-500">{waitlistOffer ? `Accept before ${new Date(waitlistOffer.offer_expires_at as string).toLocaleString()}. ` : copyId ? 'The scanned copy will be requested when available. ' : ''}Payment and final checkout are confirmed by library staff.</p></div>
        {message ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">{message}</p> : null}
        {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
        {request ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>Your request is <strong className="capitalize">{request.status.replace('_', ' ')}</strong>.</p>{request.status === 'pending' ? <button type="button" disabled={saving} onClick={confirmCancelRequest} className="mt-3 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">Cancel request</button> : null}</div> : requestAvailable && options.length > 0 ? <>
          <label className="block text-sm font-medium">Loan period and fee<select value={selectedOption} onChange={(event) => setSelectedOption(event.target.value)} className={input}>{options.map((option) => <option key={option.id} value={option.id}>{option.duration_days} days · ₱{Number(option.fee_amount).toFixed(2)}</option>)}</select></label>
          <label className="block text-sm font-medium">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as 'cash' | 'gcash')} className={input}><option value="cash">Cash at library desk</option><option value="gcash">GCash</option></select></label>
          {paymentMethod === 'gcash' ? <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><label className="block text-sm font-medium">GCash reference<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100} className={input} /></label><label className="block text-sm font-medium">Receipt image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => setProofFile(event.target.files?.[0] ?? null)} className={input} /></label></div> : null}
          <button type="button" disabled={saving} onClick={submitRequest} className="pine-action w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Submitting...' : requestActionLabel}</button>
        </> : !requestAvailable ? <div>{waitlisted ? <div className="space-y-3"><p className="text-sm text-slate-600 dark:text-slate-300">You are already on the availability queue.</p><button type="button" disabled={saving} onClick={confirmLeaveWaitlist} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-600">{saving ? 'Leaving...' : 'Leave availability queue'}</button></div> : <button type="button" disabled={saving} onClick={confirmJoinWaitlist} className="pine-action w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Joining...' : 'Join availability queue'}</button>}</div> : <p className="text-sm text-slate-500">Loan periods are not configured for this title yet.</p>}
      </div>}
      <ActionModal
        open={confirmAction !== null}
        title={confirmAction === 'cancel' ? 'Cancel physical-book request?' : confirmAction === 'leave' ? 'Leave availability queue?' : confirmAction === 'join' ? 'Join availability queue?' : waitlistOffer ? 'Accept reserved physical copy?' : 'Submit physical-book request?'}
        description={confirmAction === 'cancel' ? 'The reserved copy will be released.' : confirmAction === 'submit' && book ? `Confirm this physical-book request for “${book.title}”.` : undefined}
        confirmLabel={confirmAction === 'cancel' ? 'Cancel request' : confirmAction === 'leave' ? 'Leave queue' : confirmAction === 'join' ? 'Join queue' : waitlistOffer ? 'Accept copy' : 'Submit request'}
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
    </BaseModal>
  )
}
