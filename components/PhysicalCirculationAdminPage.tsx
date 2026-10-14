'use client'

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { getSupabase } from '@/utils/supabase/client'
import { AdminPhysicalSkeleton } from '@/components/skeletons/AdminDashboardSkeleton'
import ResultModal from '@/components/ResultModal'
import ActionModal from '@/components/ActionModal'
import BaseModal from '@/components/BaseModal'
import { DIGITAL_ACCESS_DURATION_OPTIONS } from '@/utils/libraryContracts'
import { isStaffRole } from '@/utils/roles'

type Book = { id: number; title: string; author: string; category: string; isbn: string | null; description?: string | null; catalog_type: string; cover_image_url: string | null; is_archived: boolean }
type Copy = { id: number; book_id: number; copy_code: string; qr_token: string; status: string; location: string | null; section: string | null; shelf_number: string | null; row_number: string | null; position_number: string | null }
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
type WaitlistEntry = { student_id: string; book_id: number; created_at: string }
type RequestQueueFilter = 'all' | 'pending' | 'awaiting_payment' | 'ready' | 'checked_out' | 'overdue' | 'return_pending' | 'waitlisted'

const panel = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900'
const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950'
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)


export default function PhysicalCirculationAdminPage({ initialPanel, requestsOnly = false, onClose }: { initialPanel?: 'requests' | 'checkedOut' | 'history' | 'lost'; requestsOnly?: boolean; onClose?: () => void }) {
  const router = useRouter()
  const [books, setBooks] = useState<Book[]>([])
  const [copies, setCopies] = useState<Copy[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [loanHistory, setLoanHistory] = useState<LoanHistory[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [waitlists, setWaitlists] = useState<WaitlistEntry[]>([])
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
  const [historySearch, setHistorySearch] = useState('')
  const [historyDetailBookId, setHistoryDetailBookId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [openPanel, setOpenPanel] = useState<'requests' | 'checkedOut' | 'history' | 'lost' | null>(null)
  const [newPhysicalBookOpen, setNewPhysicalBookOpen] = useState(false)
  const [copyFormOpen, setCopyFormOpen] = useState(false)
  const [optionFormOpen, setOptionFormOpen] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [showArchivedBooks, setShowArchivedBooks] = useState(false)
  const [catalogFormat, setCatalogFormat] = useState<'all' | 'physical' | 'hybrid'>('all')
  const [catalogSort, setCatalogSort] = useState<'title' | 'author' | 'available'>('title')
  const [catalogPage, setCatalogPage] = useState(1)
  const [requestSearch, setRequestSearch] = useState('')
  const [requestStatus, setRequestStatus] = useState<RequestQueueFilter>('all')
  const [requestPage, setRequestPage] = useState(1)
  const [copyDetailsBookId, setCopyDetailsBookId] = useState<number | null>(null)
  const [manageBook, setManageBook] = useState<Book | null>(null)
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [editBookForm, setEditBookForm] = useState({ title: '', author: '', category: '', isbn: '', description: '' })
  const [locationDrafts, setLocationDrafts] = useState<Record<number, { section: string; shelf: string; row: string; position: string }>>({})
  const [pendingAction, setPendingAction] = useState<{ type: 'checkout' | 'close' | 'reject' | 'resolve'; id: number } | { type: 'archiveBook'; id: number; title: string; archived: boolean } | null>(null)
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null)
  const [checkoutLoan, setCheckoutLoan] = useState<Loan | null>(null)
  const [checkoutPaidAmount, setCheckoutPaidAmount] = useState('')
  const [checkoutNotes, setCheckoutNotes] = useState('')

  const load = async () => {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError || !isStaffRole(profile?.role)) { router.replace('/unauthorized'); return }
    const copyResultPromise = (async () => {
      const structured = await supabase.from('physical_book_copies').select('id,book_id,copy_code,qr_token,status,location,section,shelf_number,row_number,position_number').order('copy_code')
      if (!structured.error) return structured
      const legacy = await supabase.from('physical_book_copies').select('id,book_id,copy_code,qr_token,status,location').order('copy_code')
      if (legacy.error) return structured
      return {
        ...legacy,
        data: (legacy.data ?? []).map((copy) => ({ ...copy, section: null, shelf_number: null, row_number: null, position_number: null })),
        error: null,
      }
    })()
    const [bookResult, copyResult, optionResult, loanResult, historyResult, memberResult, waitlistResult] = await Promise.all([
      supabase.from('books').select('id,title,author,category,isbn,description,catalog_type,cover_image_url,is_archived').order('title'),
      copyResultPromise,
      supabase.from('physical_loan_options').select('id,book_id,duration_days,fee_amount,is_active').order('book_id').order('duration_days'),
      supabase.from('physical_book_requests').select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,transaction_reference,payment_proof_path,status,requested_at,checked_out_at,due_date,returned_at,receipt_number,reservation_expires_at').order('requested_at', { ascending: false }),
      supabase.from('physical_book_loan_history').select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,status,checked_out_at,due_date,returned_at,return_condition,receipt_number').order('checked_out_at', { ascending: false }),
      supabase.from('profiles').select('id,email,full_name').in('role', ['student', 'faculty', 'librarian']),
      supabase.from('physical_book_waitlist').select('student_id,book_id,created_at').order('created_at', { ascending: true }),
    ])
    const failed = [bookResult, copyResult, optionResult, loanResult, historyResult, memberResult, waitlistResult].find((result) => result.error)
    if (failed?.error) setError(`Unable to load physical circulation: ${failed.error.message}`)
    setBooks((bookResult.data ?? []) as Book[])
    setCopies((copyResult.data ?? []) as Copy[])
    setOptions((optionResult.data ?? []) as Option[])
    setLoans((loanResult.data ?? []) as Loan[])
    setLoanHistory((historyResult.data ?? []) as LoanHistory[])
    setProfiles((memberResult.data ?? []) as Profile[])
    setWaitlists((waitlistResult.data ?? []) as WaitlistEntry[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [router])

  useEffect(() => {
    const supabase = getSupabase()
    let disposed = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    const refreshRequests = async () => {
      const { data, error: refreshError } = await supabase.from('physical_book_requests')
        .select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,transaction_reference,payment_proof_path,status,requested_at,checked_out_at,due_date,returned_at,receipt_number,reservation_expires_at')
        .order('requested_at', { ascending: false })
      if (refreshError) setError(`Unable to refresh physical requests: ${refreshError.message}`)
      else setLoans((data ?? []) as Loan[])
    }
    const refreshHistory = async () => {
      const { data, error: refreshError } = await supabase.from('physical_book_loan_history')
        .select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,status,checked_out_at,due_date,returned_at,return_condition,receipt_number')
        .order('checked_out_at', { ascending: false })
      if (refreshError) setError(`Unable to refresh physical loan history: ${refreshError.message}`)
      else setLoanHistory((data ?? []) as LoanHistory[])
    }
    const refreshCopies = async () => {
      const structured = await supabase.from('physical_book_copies')
        .select('id,book_id,copy_code,qr_token,status,location,section,shelf_number,row_number,position_number')
        .order('copy_code')
      if (!structured.error) {
        setCopies((structured.data ?? []) as Copy[])
        return
      }
      const legacy = await supabase.from('physical_book_copies')
        .select('id,book_id,copy_code,qr_token,status,location')
        .order('copy_code')
      if (legacy.error) {
        setError(`Unable to refresh physical copies: ${legacy.error.message}`)
        return
      }
      setCopies((legacy.data ?? []).map((copy) => ({ ...copy, section: null, shelf_number: null, row_number: null, position_number: null })) as Copy[])
    }
    const refreshWaitlists = async () => {
      const { data, error: refreshError } = await supabase.from('physical_book_waitlist').select('student_id,book_id,created_at').order('created_at', { ascending: true })
      if (refreshError) setError(`Unable to refresh availability queue: ${refreshError.message}`)
      else setWaitlists((data ?? []) as WaitlistEntry[])
    }

    const setupChannel = async () => {
      // React Strict Mode and Fast Refresh can run this effect again before a
      // previous channel has finished leaving. Remove stale same-topic
      // channels before registering callbacks on the new channel.
      const staleChannels = supabase.getChannels().filter((item) => item.topic === 'realtime:admin-physical-circulation')
      if (staleChannels.length) await Promise.all(staleChannels.map((item) => supabase.removeChannel(item)))
      if (disposed) return

      channel = supabase.channel('admin-physical-circulation')
      // Register every postgres_changes callback before starting the channel.
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'physical_book_requests' }, () => { void refreshRequests(); void refreshHistory() })
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'physical_book_copies' }, () => { void refreshCopies() })
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'physical_book_waitlist' }, () => { void refreshWaitlists() })
      channel.subscribe()
    }
    void setupChannel()
    return () => {
      disposed = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [router])

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

  useEffect(() => {
    if (!openPanel) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (historyDetailBookId !== null) setHistoryDetailBookId(null)
      else setOpenPanel(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [openPanel, historyDetailBookId])

  useEffect(() => {
    if (initialPanel) setOpenPanel(initialPanel)
  }, [initialPanel])

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
      setCopyFormOpen(false)
      setMessage('Copies and their QR sticker links were created.')
    }
    setBusy(false)
  }

  const setBookArchived = async (bookId: number, title: string, archived: boolean) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: archiveError } = await getSupabase()
        .from('books')
        .update({ is_archived: archived })
        .eq('id', bookId)
      if (archiveError) {
        setError(archiveError.message)
      } else {
        setBooks((current) => current.map((book) => book.id === bookId ? { ...book, is_archived: archived } : book))
        setCatalogPage(1)
        setMessage(archived
          ? `"${title}" was removed from the active catalog. Its loan history and records are preserved.`
          : `"${title}" was restored to the active catalog.`)
      }
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Unable to update the catalog status.')
    } finally {
      setBusy(false)
    }
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
      setNewPhysicalBookOpen(false)
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
    else { await load(); setOptionFormOpen(false); setMessage('Physical-book fees for all access periods were saved.') }
    setBusy(false)
  }

  const executeCheckout = async (loanId: number, paidAmount = Number(loans.find((loan) => loan.id === loanId)?.fee_amount ?? 0), notes = '') => {
    setProcessingRequestId(loanId)
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: actionError } = await getSupabase().rpc('admin_confirm_physical_checkout', { p_request_id: loanId, p_amount_paid: paidAmount, p_payment_notes: notes.trim() || null })
      if (actionError) throw new Error(actionError.message)
      await load()
      setMessage('Payment confirmed and physical checkout recorded. Digital receipt issued to the borrower.')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to confirm the physical-book checkout.')
    } finally {
      setProcessingRequestId(null)
      setBusy(false)
    }
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
    setProcessingRequestId(loanId)
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: actionError } = await getSupabase().rpc('admin_decide_physical_request', {
        p_request_id: loanId, p_decision: 'rejected',
      })
      if (actionError) throw new Error(actionError.message)
      await load()
      setMessage('Physical-book request rejected.')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to reject the physical-book request.')
    } finally {
      setProcessingRequestId(null)
      setBusy(false)
    }
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

  const checkout = (loanId: number) => {
    const loan = loans.find((item) => item.id === loanId)
    if (!loan) return
    setCheckoutLoan(loan)
    setCheckoutPaidAmount(Number(loan.fee_amount).toFixed(2))
    setCheckoutNotes('')
  }
  const closeLoan = (loanId: number) => setPendingAction({ type: 'close', id: loanId })
  const rejectRequest = (loanId: number) => setPendingAction({ type: 'reject', id: loanId })
  const resolveLostLoan = (loanId: number) => setPendingAction({ type: 'resolve', id: loanId })

  const openProof = async (path: string) => {
    const { data, error: proofError } = await getSupabase().storage.from('physical-payment-proofs').createSignedUrl(path, 60)
    if (proofError) setError(`Unable to open payment proof: ${proofError.message}`)
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const saveBookDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingBook) return
    setBusy(true); setError(''); setMessage('')
    const { error: saveError } = await getSupabase().rpc('admin_update_physical_book', {
      p_book_id: editingBook.id, p_title: editBookForm.title, p_author: editBookForm.author,
      p_category: editBookForm.category, p_isbn: editBookForm.isbn || null, p_description: editBookForm.description || null,
    })
    if (saveError) setError(saveError.message)
    else { setEditingBook(null); await load(); setMessage('Physical book details updated.') }
    setBusy(false)
  }

  const saveCopyLocation = async (copy: Copy) => {
    const draft = locationDrafts[copy.id] ?? { section: copy.section ?? '', shelf: copy.shelf_number ?? '', row: copy.row_number ?? '', position: copy.position_number ?? '' }
    setBusy(true); setError(''); setMessage('')
    const { error: saveError } = await getSupabase().rpc('admin_update_physical_copy_location', {
      p_copy_id: copy.id, p_section: draft.section || null, p_shelf_number: draft.shelf || null,
      p_row_number: draft.row || null, p_position_number: draft.position || null,
    })
    if (saveError) setError(saveError.message)
    else { await load(); setMessage(`Location updated for ${copy.copy_code}.`) }
    setBusy(false)
  }

  const printQrLabels = (copiesToPrint: Copy[]) => {
    const printableCopies = copiesToPrint.filter((copy) => qrImages[copy.qr_token])
    if (!printableCopies.length) {
      setError('QR labels are still generating. Try again in a moment.')
      return
    }
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      setError('Allow pop-ups for this site to print QR labels.')
      return
    }
    const labels = printableCopies.map((copy) => `<article><img src="${qrImages[copy.qr_token]}" alt="QR code for ${escapeHtml(copy.copy_code)}"><strong>${escapeHtml(copy.copy_code)}</strong></article>`).join('')
    printWindow.onload = () => { printWindow.focus(); printWindow.print() }
    printWindow.document.write(`<!doctype html><html><head><title>Physical book QR labels</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;color:#111;margin:0}main{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}article{border:1px solid #aaa;break-inside:avoid;display:grid;justify-items:center;gap:3mm;padding:5mm}img{width:38mm;height:38mm}strong{font-size:12pt}</style></head><body><main>${labels}</main></body></html>`)
    printWindow.document.close()
  }

  const queueLoans = loans.filter((loan) => ['pending', 'waitlisted', 'checked_out', 'return_pending', 'lost'].includes(loan.status))
  const waitingLoans = loans.filter((loan) => loan.status === 'pending')
  const visibleWaitlists = waitlists.filter((entry) => {
    const query = requestSearch.trim().toLowerCase()
    const searchable = [bookName(entry.book_id), memberName(entry.student_id), String(entry.book_id)].join(' ').toLowerCase()
    return (!query || searchable.includes(query)) && (requestStatus === 'all' || requestStatus === 'waitlisted')
  })
  const bookName = (bookId: number) => books.find((book) => book.id === bookId)?.title ?? `Book #${bookId}`
  const copyCode = (copyId: number | null) => copies.find((copy) => copy.id === copyId)?.copy_code ?? 'Copy unavailable'
  const memberName = (memberId: string) => {
    const person = profiles.find((profile) => profile.id === memberId)
    return person?.full_name?.trim() || 'Unknown borrower'
  }
  const filteredWaitingLoans = useMemo(() => {
    const query = requestSearch.trim().toLowerCase()
    const now = Date.now()
    return queueLoans.filter((loan) => {
      const overdue = loan.status === 'checked_out' && Boolean(loan.due_date && new Date(loan.due_date).getTime() < now)
      const awaitingPayment = loan.status === 'pending' && loan.payment_status !== 'paid'
      const ready = loan.status === 'pending' && loan.payment_status === 'paid'
      const matchesStatus = requestStatus === 'all'
        || requestStatus === loan.status
        || (requestStatus === 'awaiting_payment' && awaitingPayment)
        || (requestStatus === 'ready' && ready)
        || (requestStatus === 'overdue' && overdue)
      const searchable = [bookName(loan.book_id), memberName(loan.student_id), loan.payment_method, loan.payment_status, loan.transaction_reference, String(loan.id)]
        .filter(Boolean).join(' ').toLowerCase()
      return matchesStatus && (!query || searchable.includes(query))
    }).sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())
  }, [queueLoans, requestSearch, requestStatus, books, profiles])
  const requestPageSize = 10
  const requestPageCount = Math.max(1, Math.ceil(filteredWaitingLoans.length / requestPageSize))
  const visibleWaitingLoans = useMemo(() => {
    const page = Math.min(requestPage, requestPageCount)
    const start = (page - 1) * requestPageSize
    return filteredWaitingLoans.slice(start, start + requestPageSize)
  }, [filteredWaitingLoans, requestPage, requestPageCount])
  useEffect(() => {
    setRequestPage(1)
  }, [requestSearch, requestStatus])
  const activeLoans = loans.filter((loan) => loan.status === 'checked_out' || loan.status === 'return_pending')
  const lostLoans = loans.filter((loan) => loan.status === 'lost')
  const confirmingReturnRequest = pendingAction?.type === 'close'
    && loans.some((loan) => loan.id === pendingAction.id && loan.status === 'return_pending')
  const historyLoans = loanHistory.filter((loan) => !historyBookId || String(loan.book_id) === historyBookId)
  const catalogRows = useMemo(() => {
    const copiesByBook = new Map<number, Copy[]>()
    for (const copy of copies) {
      const bookCopies = copiesByBook.get(copy.book_id) ?? []
      bookCopies.push(copy)
      copiesByBook.set(copy.book_id, bookCopies)
    }

    const query = catalogSearch.trim().toLowerCase()
    return books
      .filter((book) => book.is_archived === showArchivedBooks && (book.catalog_type === 'physical' || book.catalog_type === 'hybrid'))
      .map((book) => {
        const bookCopies = copiesByBook.get(book.id) ?? []
        return {
          book,
          copies: bookCopies,
          total: bookCopies.length,
          available: bookCopies.filter((copy) => copy.status === 'available').length,
          borrowed: bookCopies.filter((copy) => copy.status === 'borrowed').length,
          locations: Array.from(new Set(bookCopies.map((copy) => [copy.section, copy.shelf_number, copy.row_number].filter(Boolean).join(' · ')).filter(Boolean))).join(', '),
        }
      })
      .filter((row) => (!query || [row.book.title, row.book.author, row.book.isbn, row.book.category].some((value) => value?.toLowerCase().includes(query)))
        && (catalogFormat === 'all' || row.book.catalog_type === catalogFormat))
      .sort((a, b) => catalogSort === 'author' ? a.book.author.localeCompare(b.book.author) : catalogSort === 'available' ? b.available - a.available : a.book.title.localeCompare(b.book.title))
  }, [books, copies, catalogSearch, catalogFormat, catalogSort, showArchivedBooks])
  const catalogPageSize = 10
  const catalogPageCount = Math.max(1, Math.ceil(catalogRows.length / catalogPageSize))
  const visibleCatalogRows = catalogRows.slice((catalogPage - 1) * catalogPageSize, catalogPage * catalogPageSize)
  const detailCopies = copies.filter((copy) => copy.book_id === copyDetailsBookId)
  const historyBookRows = useMemo(() => {
    const query = historySearch.trim().toLowerCase()
    return books
      .filter((book) => book.catalog_type === 'physical' || book.catalog_type === 'hybrid')
      .map((book) => {
        const records = loanHistory.filter((loan) => loan.book_id === book.id)
        const bookCopies = copies.filter((copy) => copy.book_id === book.id)
        return {
          book,
          records,
          copies: bookCopies,
          active: records.filter((record) => record.status === 'checked_out').length,
          returned: records.filter((record) => record.status === 'returned').length,
          available: bookCopies.filter((copy) => copy.status === 'available').length,
        }
      })
      .filter(({ book }) => !query || [book.title, book.author, book.isbn, book.category].some((value) => value?.toLowerCase().includes(query)))
      .sort((a, b) => a.book.title.localeCompare(b.book.title))
  }, [books, copies, loanHistory, historySearch])
  const selectedHistoryBook = historyDetailBookId === null ? null : books.find((book) => book.id === historyDetailBookId) ?? null
  const selectedHistoryRows = historyDetailBookId === null ? [] : loanHistory.filter((loan) => loan.book_id === historyDetailBookId)
  const openOptionEditor = (bookId: number) => {
    const existing = options.filter((option) => option.book_id === bookId)
    setOptionForm({
      bookId: String(bookId),
      fees: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, String(existing.find((option) => option.duration_days === days)?.fee_amount ?? 0)])),
    })
    setOptionFormOpen(true)
  }
  if (loading) return <AdminPhysicalSkeleton />

  return <main className={requestsOnly ? 'physical-requests-only contents' : 'min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8'}>
    <div className="mx-auto max-w-6xl space-y-6">
      <div className={requestsOnly ? 'physical-requests-result' : undefined}>
        <ResultModal
          open={Boolean(error || message)}
          status={error ? 'error' : 'success'}
          message={error || message}
          onClose={() => { setError(''); setMessage('') }}
        />
      </div>

      {newPhysicalBookOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setNewPhysicalBookOpen(false) }}><form onSubmit={(event) => void submitPhysicalBook(event)} className={`${panel} max-h-[90vh] w-full max-w-4xl space-y-3 overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="add-physical-book-title">
        <div className="flex items-start justify-between gap-4"><div><h2 id="add-physical-book-title" className="text-lg font-semibold">Add a physical book to the catalog</h2><p className="text-sm text-slate-500">Create the title, initial copies, and QR labels together.</p></div><button type="button" disabled={busy} onClick={() => setNewPhysicalBookOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
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
      </form></div> : null}

      {copyFormOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCopyFormOpen(false) }}>
        <form onSubmit={(event) => void submitCopyForm(event)} className={`${panel} w-full max-w-xl space-y-4`} role="dialog" aria-modal="true" aria-labelledby="add-copies-title">
          <div className="flex items-start justify-between gap-4"><div><h2 id="add-copies-title" className="text-lg font-semibold">Add copies to an existing title</h2><p className="mt-1 text-sm text-slate-500">New copies receive unique IDs and QR labels.</p></div><button type="button" disabled={busy} onClick={() => setCopyFormOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <label className="block text-sm font-medium">Book<select required value={copyForm.bookId} onChange={(event) => setCopyForm({ ...copyForm, bookId: event.target.value })} className={`${input} mt-1`}><option value="">Choose a book</option>{books.filter((book) => !book.is_archived).map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Copy-code prefix<input required value={copyForm.prefix} onChange={(event) => setCopyForm({ ...copyForm, prefix: event.target.value })} maxLength={32} pattern="[A-Za-z0-9_-]+" placeholder="e.g. BIO101" className={`${input} mt-1`} /></label><label className="text-sm font-medium">Quantity<input required type="number" min="1" max="100" value={copyForm.quantity} onChange={(event) => setCopyForm({ ...copyForm, quantity: event.target.value })} className={`${input} mt-1`} /></label></div>
          <label className="block text-sm font-medium">Shelf / location (optional)<input value={copyForm.location} onChange={(event) => setCopyForm({ ...copyForm, location: event.target.value })} maxLength={120} placeholder="e.g. Science · Shelf 2" className={`${input} mt-1`} /></label>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Creating...' : 'Create copies'}</button>
        </form>
      </div> : null}

      {optionFormOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOptionFormOpen(false) }}>
        <form onSubmit={(event) => void submitOptionForm(event)} className={`${panel} w-full max-w-3xl space-y-4`} role="dialog" aria-modal="true" aria-labelledby="loan-fees-title">
          <div className="flex items-start justify-between gap-4"><div><h2 id="loan-fees-title" className="text-lg font-semibold">Set book-specific loan fees</h2><p className="mt-1 text-sm text-slate-500">Choose a physical title and set the fee for each loan period.</p></div><button type="button" disabled={busy} onClick={() => setOptionFormOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <label className="block text-sm font-medium">Book<select required value={optionForm.bookId} onChange={(event) => {
            const bookId = event.target.value
            const existing = options.filter((option) => option.book_id === Number(bookId))
            setOptionForm({ bookId, fees: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, String(existing.find((option) => option.duration_days === days)?.fee_amount ?? 0)])) })
          }} className={`${input} mt-1`}><option value="">Choose a book</option>{books.filter((book) => !book.is_archived).map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => <label key={days} className="text-sm">{days} {days === 1 ? 'day' : 'days'} fee (₱)<input required type="number" min="0" step="0.01" value={optionForm.fees[String(days)] ?? '0'} onChange={(event) => setOptionForm({ ...optionForm, fees: { ...optionForm.fees, [days]: event.target.value } })} className={`${input} mt-1`} /></label>)}
          </div>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Saving...' : 'Save fees'}</button>
        </form>
      </div> : null}

      <section className={panel}>
        <div className="physical-catalog-heading flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="physical-catalog" className="scroll-mt-6 text-xl font-semibold">Physical book catalog</h2>
            <p className="mt-1 text-sm text-slate-500">Search titles, inspect copy-level inventory, and monitor availability.</p>
          </div>
        </div>
        <div className="physical-catalog-toolbar mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto_auto]">
          <input value={catalogSearch} onChange={(event) => { setCatalogSearch(event.target.value); setCatalogPage(1) }} placeholder="Search title, author, ISBN..." className={`${input} min-w-0`} />
          <select value={catalogFormat} onChange={(event) => { setCatalogFormat(event.target.value as typeof catalogFormat); setCatalogPage(1) }} className={`${input} min-w-0`}>
            <option value="all">All formats</option><option value="physical">Physical</option><option value="hybrid">Hybrid</option>
          </select>
          <select value={catalogSort} onChange={(event) => { setCatalogSort(event.target.value as typeof catalogSort); setCatalogPage(1) }} className={`${input} min-w-0`}>
            <option value="title">Sort: title</option><option value="author">Sort: author</option><option value="available">Sort: availability</option>
          </select>
          <button type="button" onClick={() => { setShowArchivedBooks((current) => !current); setCatalogPage(1) }} className="whitespace-nowrap rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">
            {showArchivedBooks ? 'View active' : 'View archived'}
          </button>
          <button type="button" onClick={() => setNewPhysicalBookOpen(true)} className="whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Add book</button>
          <button type="button" onClick={() => setCopyFormOpen(true)} className="whitespace-nowrap rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Add copies</button>
        </div>
        <div className="mt-4">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700">
              <tr><th className="w-[36%] px-2 py-3 sm:px-3">Book</th><th className="w-[16%] px-2 py-3 sm:px-3">Copies</th><th className="w-[20%] px-2 py-3 sm:px-3">Shelf location</th><th className="w-[28%] px-2 py-3 sm:px-3">Actions</th></tr>
            </thead>
            <tbody>
              {visibleCatalogRows.map((row) => <tr key={row.book.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                <td className="break-words px-2 py-3 sm:px-3"><strong>{row.book.title}</strong>{row.book.is_archived ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Archived</span> : null}<span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{row.book.author} · {row.book.category}</span><span className="mt-1 block text-xs capitalize text-slate-500">{row.book.isbn ? `ISBN ${row.book.isbn} · ` : ''}{row.book.catalog_type}</span></td>
                <td className="px-2 py-3 sm:px-3"><strong className="block text-emerald-700 dark:text-emerald-300">{row.available} available</strong><span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{row.total} total · {row.borrowed} borrowed</span></td>
                <td className="break-words px-2 py-3 text-xs text-slate-600 dark:text-slate-400 sm:px-3">{row.locations || 'Location not set'}</td>
                <td className="physical-catalog-actions px-2 py-3 sm:px-3"><button type="button" disabled={busy} onClick={() => setManageBook(row.book)} className="whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">Manage book</button></td>
              </tr>)}
            </tbody>
          </table>
          {visibleCatalogRows.length === 0 ? <p className="py-6 text-sm text-slate-500">No physical titles match this search.</p> : null}
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>Showing {visibleCatalogRows.length} of {catalogRows.length} titles</span>
          <div className="flex gap-2"><button type="button" disabled={catalogPage <= 1} onClick={() => setCatalogPage((page) => Math.max(1, page - 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40 dark:border-slate-700">Previous</button><span className="px-2 py-1.5">Page {Math.min(catalogPage, catalogPageCount)} of {catalogPageCount}</span><button type="button" disabled={catalogPage >= catalogPageCount} onClick={() => setCatalogPage((page) => Math.min(catalogPageCount, page + 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40 dark:border-slate-700">Next</button></div>
        </div>
      </section>

      <BaseModal
        open={manageBook !== null}
        title="Manage physical book"
        description={manageBook ? `${manageBook.title} · ${manageBook.author}` : undefined}
        onClose={() => setManageBook(null)}
        size="md"
      >
        {manageBook ? <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Copies</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{catalogRows.find((row) => row.book.id === manageBook.id)?.total ?? 0} registered</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">Shelf location</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{catalogRows.find((row) => row.book.id === manageBook.id)?.locations || 'Not set'}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => { const book = manageBook; setManageBook(null); setCopyDetailsBookId(book.id) }} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">Copies &amp; QR</button>
            <button type="button" onClick={() => { const book = manageBook; setManageBook(null); openOptionEditor(book.id) }} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">Loan fees</button>
            <button type="button" onClick={() => { const book = manageBook; setManageBook(null); setEditingBook(book); setEditBookForm({ title: book.title, author: book.author, category: book.category, isbn: book.isbn ?? '', description: book.description ?? '' }) }} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">Edit details</button>
            <button type="button" onClick={() => { const book = manageBook; setManageBook(null); setPendingAction({ type: 'archiveBook', id: book.id, title: book.title, archived: !book.is_archived }) }} className="rounded-xl border border-rose-300 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30">{manageBook.is_archived ? 'Restore to catalog' : 'Remove from catalog'}</button>
          </div>
        </> : null}
      </BaseModal>

      {false && <section className={panel}>
        <h2 className="text-xl font-semibold">Copy inventory and printable QR stickers</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {copies.map((copy) => <article key={copy.id} className="rounded-2xl border border-slate-200 p-4 text-center dark:border-slate-700">
            {qrImages[copy.qr_token] ? <img src={qrImages[copy.qr_token]} alt={`QR sticker for copy ${copy.copy_code}`} className="mx-auto h-36 w-36" /> : <div className="mx-auto h-36 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />}
            <strong className="mt-2 block">{copy.copy_code}</strong><p className="mt-1 text-xs capitalize text-slate-500">{copy.status}{copy.location ? ` · ${copy.location}` : ''}</p><p className="mt-1 text-xs text-slate-500">{[copy.section, copy.shelf_number && `Shelf ${copy.shelf_number}`, copy.row_number && `Row ${copy.row_number}`, copy.position_number && `Position ${copy.position_number}`].filter(Boolean).join(' · ') || 'Location not set'}</p>
            {qrImages[copy.qr_token] ? <a href={qrImages[copy.qr_token]} download={`${copy.copy_code}-qr.png`} className="mt-2 inline-block text-xs font-semibold text-sky-700 underline dark:text-sky-300">Download sticker</a> : null}
          </article>)}
          {copies.length === 0 ? <p className="text-sm text-slate-500">No physical copies registered yet.</p> : null}
        </div>
        <div className="mt-6 space-y-2">{options.map((option) => <p key={option.id} className="text-sm text-slate-600 dark:text-slate-300">{bookName(option.book_id)} · {option.duration_days} days · ₱{Number(option.fee_amount).toFixed(2)}{option.is_active ? '' : ' · inactive'}</p>)}</div>
      </section>}

      <div className="physical-queue-nav mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
        <div className="mr-2 min-w-[12rem]"><p className="text-sm font-semibold">Circulation queue</p><p className="text-xs text-slate-500">Review requests, active loans, history, and exceptions.</p></div>
        <button type="button" onClick={() => setOpenPanel('requests')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Requests <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">{waitingLoans.length}</span></button>
        <button id="checked-out-copies" type="button" onClick={() => setOpenPanel('checkedOut')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Checked out <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{activeLoans.length}</span></button>
        <button type="button" onClick={() => setOpenPanel('history')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Loan history</button>
        <button type="button" onClick={() => setOpenPanel('lost')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Lost items <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800 dark:bg-rose-950 dark:text-rose-200">{lostLoans.length}</span></button>
      </div>

      {openPanel === 'requests' ? <div className={requestsOnly ? 'physical-requests-inline' : 'physical-requests-modal fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4'} role={requestsOnly ? undefined : 'presentation'} onMouseDown={(event) => { if (!requestsOnly && event.target === event.currentTarget) { setOpenPanel(null); onClose?.() } }}>
        <section className={`${panel} ${requestsOnly ? 'w-full' : 'max-h-[90vh] w-full max-w-5xl overflow-y-auto'}`} role={requestsOnly ? undefined : 'dialog'} aria-modal={requestsOnly ? undefined : true} aria-labelledby="physical-requests-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="physical-requests-title" className="text-xl font-semibold">Requests and payment verification</h2>
              <p className="mt-1 text-sm text-slate-500">Review payment details and confirm or reject pending requests. A copy is assigned only at checkout.</p>
            </div>
            <button type="button" onClick={() => { setOpenPanel(null); onClose?.() }} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">{requestsOnly ? 'Back to overview' : 'Close'}</button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Showing {filteredWaitingLoans.length} of {queueLoans.length} queue items.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Search member, book, or request ID..." aria-label="Search physical requests" className={`${input} sm:min-w-80`} />
              <select value={requestStatus} onChange={(event) => setRequestStatus(event.target.value as RequestQueueFilter)} aria-label="Filter physical requests by operational state" className={input}>
                <option value="all">All queue items</option><option value="pending">Pending requests</option><option value="awaiting_payment">Awaiting payment</option><option value="ready">Ready for checkout</option><option value="checked_out">Checked out</option><option value="overdue">Overdue</option><option value="return_pending">Return requests</option><option value="waitlisted">Waitlisted</option>
              </select>
            </div>
          </div>
        <div className="mt-4 space-y-3">
          {visibleWaitingLoans.map((loan) => <article key={loan.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><strong>{bookName(loan.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(loan.student_id)}</p><p className="mt-1 text-xs text-slate-500">{loan.status === 'return_pending' ? 'Return request · awaiting confirmation' : loan.status.replace('_', ' ')} · {loan.copy_id ? copyCode(loan.copy_id) : 'Copy assigned at checkout'} · {loan.duration_days} days · ₱{Number(loan.fee_amount).toFixed(2)} · {loan.payment_method} · {loan.payment_status.replace('_', ' ')}</p>{loan.due_date && loan.status === 'checked_out' ? <p className={`mt-1 text-xs ${new Date(loan.due_date) < new Date() ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-slate-500'}`}>{new Date(loan.due_date) < new Date() ? 'Overdue' : 'Due'} {new Date(loan.due_date).toLocaleDateString()}</p> : null}{loan.transaction_reference ? <p className="mt-1 text-xs text-slate-500">Transaction reference: {loan.transaction_reference}</p> : null}{loan.payment_proof_path ? <button type="button" onClick={() => void openProof(loan.payment_proof_path!)} className="mt-1 text-xs font-semibold text-sky-700 underline dark:text-sky-300">View uploaded payment proof</button> : null}</div>
              {loan.status === 'pending' ? <div className="flex flex-wrap gap-2"><button disabled={processingRequestId !== null} type="button" onClick={() => checkout(loan.id)} className="physical-review-action rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50">{processingRequestId === loan.id ? 'Processing...' : 'Review & approve'}</button><button disabled={processingRequestId !== null} type="button" onClick={() => void rejectRequest(loan.id)} className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Reject request</button></div> : loan.status === 'checked_out' || loan.status === 'return_pending' ? <button type="button" onClick={() => setOpenPanel('checkedOut')} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">{loan.status === 'return_pending' ? 'Review return request' : 'Manage return'}</button> : <span className="text-xs text-amber-700 dark:text-amber-300">No checkout action</span>}
            </div>
          </article>)}
          {visibleWaitlists.map((entry) => <article key={`waitlist-${entry.student_id}-${entry.book_id}`} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"><div className="flex flex-wrap items-start justify-between gap-4"><div><strong>{bookName(entry.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(entry.student_id)}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Availability queue · joined {new Date(entry.created_at).toLocaleString()}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">Waitlisted</span></div></article>)}
          {filteredWaitingLoans.length === 0 && visibleWaitlists.length === 0 ? <p className="text-sm text-slate-500">{queueLoans.length === 0 && waitlists.length === 0 ? 'No physical queue items.' : 'No physical requests match the current search or filter.'}</p> : null}
          {filteredWaitingLoans.length > requestPageSize ? <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm"><span className="text-slate-500">Page {Math.min(requestPage, requestPageCount)} of {requestPageCount}</span><div className="flex gap-2"><button type="button" disabled={requestPage <= 1} onClick={() => setRequestPage((page) => Math.max(1, page - 1))} className="rounded-xl border border-slate-300 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Previous</button><button type="button" disabled={requestPage >= requestPageCount} onClick={() => setRequestPage((page) => Math.min(requestPageCount, page + 1))} className="rounded-xl border border-slate-300 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Next</button></div></div> : null}
        </div>
        </section>
      </div> : null}

      {openPanel === 'checkedOut' ? <div className="physical-checked-out-modal fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPanel(null) }}>
        <section className={`${panel} max-h-[90vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="checked-out-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="checked-out-title" className="text-xl font-semibold">Checked-out copies</h2>
              <p className="mt-1 text-sm text-slate-500">Record returns and update the condition of each physical copy.</p>
            </div>
            <button type="button" onClick={() => setOpenPanel(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button>
          </div>
        <div className="mt-4 space-y-3">
          {activeLoans.map((loan) => <article key={loan.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div><strong>{bookName(loan.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(loan.student_id)}</p><p className="mt-1 text-xs text-slate-500">{loan.status === 'return_pending' ? 'RETURN REQUEST · AWAITING LIBRARIAN CONFIRMATION · ' : ''}Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'} · Receipt {loan.receipt_number ?? '—'}{loan.due_date && new Date(loan.due_date) < new Date() ? ' · OVERDUE' : ''}</p></div>
            <div className="flex items-end gap-2"><label className="text-xs">Returned condition<select value={returnConditions[loan.id] ?? 'available'} onChange={(event) => setReturnConditions({ ...returnConditions, [loan.id]: event.target.value as 'available' | 'damaged' | 'lost' })} className={`${input} mt-1`}><option value="available">Good / available</option><option value="damaged">Damaged</option><option value="lost">Lost / not returned</option></select></label><button disabled={busy} type="button" onClick={() => void closeLoan(loan.id)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{loan.status === 'return_pending' ? 'Confirm return' : 'Record return'}</button></div>
          </article>)}
          {activeLoans.length === 0 ? <p className="text-sm text-slate-500">No books are currently checked out.</p> : null}
        </div>
        </section>
      </div> : null}

      {openPanel === 'history' ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPanel(null) }}>
        <section className={`${panel} max-h-[92vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="circulation-history-catalog-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="circulation-history-catalog-title" className="text-xl font-semibold">Physical loan history</h2><p className="mt-1 text-sm text-slate-500">Choose a title to inspect its complete circulation history.</p></div><button type="button" onClick={() => setOpenPanel(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <input type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search title, author, ISBN, or category..." aria-label="Search physical-book history" className={`${input} mt-4`} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {historyBookRows.map(({ book, records, active, returned, available }) => <button key={book.id} type="button" onClick={() => setHistoryDetailBookId(book.id)} className="rounded-2xl border border-slate-200 p-4 text-left text-slate-900 transition hover:border-emerald-600 hover:bg-emerald-50 dark:border-slate-700 dark:hover:border-emerald-400 dark:hover:bg-emerald-950/30"><div className="flex items-start justify-between gap-3"><div><strong className="block text-slate-900">{book.title}</strong><span className="mt-1 block text-xs text-slate-600">{book.author} · {book.category}</span></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">{records.length} records</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600"><span><strong className="block text-base text-slate-900">{active}</strong>Active</span><span><strong className="block text-base text-slate-900">{returned}</strong>Returned</span><span><strong className="block text-base text-slate-900">{available}</strong>Available</span></div><span className="mt-4 block text-xs font-semibold text-emerald-700 dark:text-emerald-300">Open history →</span></button>)}
          </div>
          {historyBookRows.length === 0 ? <p className="py-8 text-sm text-slate-500">No physical titles match your search.</p> : null}
        </section>
        {selectedHistoryBook ? <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryDetailBookId(null) }}><section className={`${panel} max-h-[92vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="book-history-title"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Book history</p><h2 id="book-history-title" className="mt-1 text-xl font-semibold">{selectedHistoryBook.title}</h2><p className="mt-1 text-sm text-slate-500">{selectedHistoryRows.length} circulation record{selectedHistoryRows.length === 1 ? '' : 's'} · {selectedHistoryBook.author}</p></div><button type="button" onClick={() => setHistoryDetailBookId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] table-fixed text-left text-xs sm:text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700"><tr><th className="w-[27%] px-2 py-3">Borrower / copy</th><th className="w-[24%] px-2 py-3">Checkout / due</th><th className="w-[24%] px-2 py-3">Return</th><th className="w-[25%] px-2 py-3">Status / receipt</th></tr></thead><tbody>{selectedHistoryRows.map((loan) => <tr key={loan.id} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="break-words px-2 py-3"><strong className="block">{memberName(loan.student_id)}</strong><span className="text-slate-500">{copyCode(loan.copy_id)}</span></td><td className="break-words px-2 py-3"><span className="block">{new Date(loan.checked_out_at).toLocaleString()}</span><span className="text-slate-500">Due {new Date(loan.due_date).toLocaleDateString()}</span></td><td className="break-words px-2 py-3"><span className="block">{loan.returned_at ? new Date(loan.returned_at).toLocaleString() : 'Not returned'}</span><span className="text-slate-500">{loan.return_condition ? `Condition: ${loan.return_condition}` : `${loan.duration_days} days`}</span></td><td className="break-words px-2 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${loan.status === 'returned' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : loan.status === 'lost' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'}`}>{loan.status.replace('_', ' ')}</span><span className="mt-1 block text-slate-500">Receipt {loan.receipt_number ?? '—'}</span></td></tr>)}</tbody></table></div>{selectedHistoryRows.length === 0 ? <p className="py-8 text-sm text-slate-500">This book has no completed checkout records yet.</p> : null}</section></div> : null}
        <section className={`${panel} hidden max-h-[92vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="circulation-history-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="circulation-history-title" className="text-xl font-semibold">Physical loan history</h2><p className="mt-1 text-sm text-slate-500">Completed checkouts, returns, due dates, and copy condition.</p></div><button type="button" onClick={() => setOpenPanel(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <label className="mt-4 block max-w-sm text-sm font-medium">Filter by book<select value={historyBookId} onChange={(event) => setHistoryBookId(event.target.value)} className={`${input} mt-1`}><option value="">All physical books</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
          <div className="mt-4">
            <table className="w-full table-fixed text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 text-left uppercase text-slate-500 dark:border-slate-700"><tr><th className="w-[30%] px-2 py-3 sm:px-3">Book / borrower</th><th className="w-[23%] px-2 py-3 sm:px-3">Checkout / due</th><th className="w-[25%] px-2 py-3 sm:px-3">Return / term</th><th className="w-[22%] px-2 py-3 sm:px-3">Status</th></tr></thead>
              <tbody>{historyLoans.map((loan) => <tr key={loan.id} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="break-words px-2 py-3 sm:px-3"><strong className="block">{bookName(loan.book_id)}</strong><span className="block text-slate-600 dark:text-slate-400">{copyCode(loan.copy_id)} · {memberName(loan.student_id)}</span><span className="block text-slate-500">Receipt {loan.receipt_number ?? '—'}</span></td><td className="break-words px-2 py-3 sm:px-3"><span className="block">{loan.checked_out_at ? new Date(loan.checked_out_at).toLocaleDateString() : '—'}</span><span className="block text-slate-500">Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</span></td><td className="break-words px-2 py-3 sm:px-3"><span className="block">{loan.returned_at ? new Date(loan.returned_at).toLocaleDateString() : 'Not returned'}</span><span className="block text-slate-500">{loan.duration_days} days{loan.return_condition ? ` · ${loan.return_condition}` : ''}</span></td><td className="break-words px-2 py-3 capitalize sm:px-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${loan.status === 'checked_out' ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200' : loan.status === 'returned' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : loan.status === 'lost' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{loan.status.replace('_', ' ')}</span></td></tr>)}</tbody>
            </table>
            {historyLoans.length === 0 ? <p className="py-6 text-sm text-slate-500">No circulation history for this selection.</p> : null}
          </div>
        </section>
      </div> : null}
      {copyDetailsBookId !== null ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCopyDetailsBookId(null) }}>
        <section className={`${panel} physical-copies-dialog max-h-[90vh] w-full max-w-4xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="copy-details-title">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="copy-details-title" className="text-xl font-semibold">Copies for {bookName(copyDetailsBookId)}</h2><p className="mt-1 text-sm text-slate-500">Open, download, or print a QR label for any copy.</p></div><div className="flex gap-2"><button type="button" disabled={!detailCopies.some((copy) => qrImages[copy.qr_token])} onClick={() => printQrLabels(detailCopies)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Print all labels</button><button type="button" onClick={() => setCopyDetailsBookId(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div></div>
          <div className="mt-4 overflow-hidden"><table className="w-full table-fixed text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700"><tr><th className="w-[14%] px-2 py-3 sm:px-3">Copy</th><th className="w-[18%] px-2 py-3 sm:px-3">QR label</th><th className="w-[34%] px-2 py-3 sm:px-3">Location</th><th className="w-[12%] px-2 py-3 sm:px-3">Status</th><th className="w-[22%] px-2 py-3 sm:px-3">Actions</th></tr></thead><tbody>{detailCopies.map((copy) => { const draft = locationDrafts[copy.id] ?? { section: copy.section ?? '', shelf: copy.shelf_number ?? '', row: copy.row_number ?? '', position: copy.position_number ?? '' }; return <tr key={copy.id} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="break-words px-2 py-3 font-semibold sm:px-3">{copy.copy_code}</td><td className="px-2 py-3 sm:px-3">{qrImages[copy.qr_token] ? <a href={qrImages[copy.qr_token]} target="_blank" rel="noreferrer" aria-label={`Open QR image for ${copy.copy_code}`}><img src={qrImages[copy.qr_token]} alt={`QR label for ${copy.copy_code}`} className="h-12 w-12 rounded border border-slate-200 bg-white p-1 sm:h-16 sm:w-16 dark:border-slate-700" /></a> : <span className="text-xs text-slate-500">Generating...</span>}</td><td className="px-2 py-3 sm:px-3"><div className="grid grid-cols-2 gap-1"><input aria-label={`${copy.copy_code} section`} placeholder="Section" value={draft.section} onChange={(event) => setLocationDrafts({ ...locationDrafts, [copy.id]: { ...draft, section: event.target.value } })} className={`${input} min-w-0`} /><input aria-label={`${copy.copy_code} shelf`} placeholder="Shelf" value={draft.shelf} onChange={(event) => setLocationDrafts({ ...locationDrafts, [copy.id]: { ...draft, shelf: event.target.value } })} className={`${input} min-w-0`} /><input aria-label={`${copy.copy_code} row`} placeholder="Row" value={draft.row} onChange={(event) => setLocationDrafts({ ...locationDrafts, [copy.id]: { ...draft, row: event.target.value } })} className={`${input} min-w-0`} /><input aria-label={`${copy.copy_code} position`} placeholder="Position" value={draft.position} onChange={(event) => setLocationDrafts({ ...locationDrafts, [copy.id]: { ...draft, position: event.target.value } })} className={`${input} min-w-0`} /></div></td><td className="break-words px-2 py-3 capitalize sm:px-3">{copy.status}</td><td className="px-2 py-3 sm:px-3"><div className="flex flex-col gap-2">{qrImages[copy.qr_token] ? <><a href={qrImages[copy.qr_token]} download={`${copy.copy_code}-qr.png`} className="text-xs font-semibold text-sky-700 underline dark:text-sky-300">Download QR</a><button type="button" onClick={() => printQrLabels([copy])} className="rounded-lg border border-slate-300 px-2 py-1 text-left text-xs font-semibold dark:border-slate-700">Print QR</button></> : <span className="text-xs text-slate-500">QR generating</span>}<button type="button" disabled={busy} onClick={() => void saveCopyLocation(copy)} className="rounded-lg border border-slate-300 px-2 py-1 text-left text-xs font-semibold disabled:opacity-50 dark:border-slate-700">Save location</button></div></td></tr> })}</tbody></table></div>
        </section>
      </div> : null}
      {editingBook ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingBook(null) }}>
        <form onSubmit={(event) => void saveBookDetails(event)} className={`${panel} max-h-[90vh] w-full max-w-2xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="edit-physical-book-title">
          <div className="flex items-start justify-between gap-4"><div><h2 id="edit-physical-book-title" className="text-xl font-semibold">Edit physical book</h2><p className="mt-1 text-sm text-slate-500">Update the catalog details connected to this title.</p></div><button type="button" onClick={() => setEditingBook(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Title<input required maxLength={300} value={editBookForm.title} onChange={(event) => setEditBookForm({ ...editBookForm, title: event.target.value })} className={`${input} mt-1`} /></label><label className="text-sm font-medium">Author<input required maxLength={200} value={editBookForm.author} onChange={(event) => setEditBookForm({ ...editBookForm, author: event.target.value })} className={`${input} mt-1`} /></label><label className="text-sm font-medium">Category<input required maxLength={120} value={editBookForm.category} onChange={(event) => setEditBookForm({ ...editBookForm, category: event.target.value })} className={`${input} mt-1`} /></label><label className="text-sm font-medium">ISBN<input maxLength={32} value={editBookForm.isbn} onChange={(event) => setEditBookForm({ ...editBookForm, isbn: event.target.value })} className={`${input} mt-1`} /></label></div>
          <label className="mt-3 block text-sm font-medium">Description<textarea maxLength={3000} rows={4} value={editBookForm.description} onChange={(event) => setEditBookForm({ ...editBookForm, description: event.target.value })} className={`${input} mt-1`} /></label>
          <button disabled={busy} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Saving...' : 'Save details'}</button>
        </form>
      </div> : null}
      {openPanel === 'lost' ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPanel(null) }}>
        <section className={`${panel} max-h-[92vh] w-full max-w-4xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="lost-items-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="lost-items-title" className="text-xl font-semibold">Lost items and holds</h2><p className="mt-1 text-sm text-slate-500">Resolve a lost copy when it is found or the library closes the case. This clears the borrower&apos;s circulation hold.</p></div><button type="button" onClick={() => setOpenPanel(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <div className="mt-4">
            <table className="w-full table-fixed text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 uppercase text-slate-500 dark:border-slate-700"><tr><th className="w-[42%] px-2 py-3 sm:px-3">Book / borrower</th><th className="w-[20%] px-2 py-3 sm:px-3">Due</th><th className="w-[38%] px-2 py-3 sm:px-3">Resolution</th></tr></thead>
              <tbody>{lostLoans.map((loan) => <tr key={loan.id} className="border-b border-rose-100 align-top dark:border-rose-900/60"><td className="break-words px-2 py-3 sm:px-3"><strong className="block">{bookName(loan.book_id)}</strong><span className="block text-slate-600 dark:text-slate-400">{memberName(loan.student_id)}</span><span className="block text-slate-500">{copyCode(loan.copy_id)}</span></td><td className="break-words px-2 py-3 sm:px-3">{loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</td><td className="px-2 py-3 sm:px-3"><select aria-label={`Resolution for ${copyCode(loan.copy_id)}`} value={lostResolution[loan.id] ?? 'available'} onChange={(event) => setLostResolution({ ...lostResolution, [loan.id]: event.target.value as 'available' | 'damaged' | 'withdrawn' })} className="mb-2 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950"><option value="available">Found · good</option><option value="damaged">Found · damaged</option><option value="withdrawn">Close as lost</option></select><button disabled={busy} type="button" onClick={() => void resolveLostLoan(loan.id)} className="w-full rounded-lg bg-slate-900 px-2 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Resolve hold</button></td></tr>)}</tbody>
            </table>
            {lostLoans.length === 0 ? <p className="py-6 text-sm text-slate-500">No unresolved lost items.</p> : null}
          </div>
        </section>
      </div> : null}
    </div>
    <ActionModal
      open={checkoutLoan !== null}
      title="Review physical-book request"
      description="Verify the payment, assign the next available copy, and issue the borrower’s receipt. Pending requests do not reserve a copy."
      confirmLabel="Verify payment & issue receipt"
      busy={checkoutLoan !== null && processingRequestId === checkoutLoan.id}
      onClose={() => setCheckoutLoan(null)}
      onConfirm={() => {
        if (!checkoutLoan) return
        if (!Number.isFinite(Number(checkoutPaidAmount)) || Number(checkoutPaidAmount) !== Number(checkoutLoan.fee_amount)) {
          setError(`Enter the exact configured payment amount: ₱${Number(checkoutLoan.fee_amount).toFixed(2)}.`)
          return
        }
        const loanId = checkoutLoan.id
        setCheckoutLoan(null)
        void executeCheckout(loanId, Number(checkoutPaidAmount), checkoutNotes)
      }}
    >
      {checkoutLoan ? (() => {
        const checkoutAt = new Date()
        const returnAt = new Date(checkoutAt)
        returnAt.setDate(returnAt.getDate() + checkoutLoan.duration_days)
        return <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Borrower
            <input readOnly value={memberName(checkoutLoan.student_id)} className={`${input} mt-1 bg-slate-100 dark:bg-slate-800`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Book
            <input readOnly value={bookName(checkoutLoan.book_id)} className={`${input} mt-1 bg-slate-100 dark:bg-slate-800`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Loan period
            <input readOnly value={`${checkoutLoan.duration_days} days`} className={`${input} mt-1 bg-slate-100 dark:bg-slate-800`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Amount paid (₱)
            <input type="number" min="0" step="0.01" value={checkoutPaidAmount} onChange={(event) => setCheckoutPaidAmount(event.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Payment method
            <input readOnly value={checkoutLoan.payment_method === 'gcash' ? 'GCash' : 'Cash'} className={`${input} mt-1 bg-slate-100 dark:bg-slate-800`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Payment notes (optional)
            <textarea maxLength={500} rows={2} value={checkoutNotes} onChange={(event) => setCheckoutNotes(event.target.value)} placeholder="Verification note or exception details" className={`${input} mt-1`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Checked out at
            <input readOnly value={checkoutAt.toLocaleString()} className={`${input} mt-1 bg-slate-100 dark:bg-slate-800`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Return date
            <input readOnly value={returnAt.toLocaleString()} className={`${input} mt-1 bg-slate-100 dark:bg-slate-800`} />
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:col-span-2">The database will assign an available copy, generate the receipt number, save the checkout timestamp and due date, and notify the borrower with the receipt in their physical lending history.</p>
        </div>
      })() : null}
    </ActionModal>
    <ActionModal
        open={pendingAction !== null}
        title={pendingAction?.type === 'checkout' ? 'Confirm physical checkout?' : pendingAction?.type === 'close' ? confirmingReturnRequest ? 'Confirm requested return?' : 'Record physical-book return?' : pendingAction?.type === 'reject' ? 'Reject physical-book request?' : pendingAction?.type === 'archiveBook' ? pendingAction.archived ? 'Remove this book from the catalog?' : 'Restore this book?' : 'Resolve lost-book hold?'}
        description={pendingAction?.type === 'close' ? `${confirmingReturnRequest ? 'The borrower’s return request will be completed. ' : ''}The selected condition (${returnConditions[pendingAction.id] ?? 'available'}) will be recorded.` : pendingAction?.type === 'archiveBook' ? pendingAction.archived ? `“${pendingAction.title}” will be hidden from members. Loan history and existing records will be preserved.` : `“${pendingAction.title}” will become available in the active catalog again.` : undefined}
        confirmLabel={pendingAction?.type === 'checkout' ? 'Confirm checkout' : pendingAction?.type === 'close' ? confirmingReturnRequest ? 'Confirm return' : 'Record return' : pendingAction?.type === 'reject' ? 'Reject request' : pendingAction?.type === 'archiveBook' ? pendingAction.archived ? 'Remove from catalog' : 'Restore book' : 'Resolve hold'}
        tone={pendingAction?.type === 'checkout' || pendingAction?.type === 'close' || (pendingAction?.type === 'archiveBook' && !pendingAction.archived) ? 'default' : 'danger'}
        busy={pendingAction?.type === 'archiveBook' ? busy : pendingAction !== null && processingRequestId === pendingAction.id}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction
          setPendingAction(null)
          if (action?.type === 'archiveBook') void setBookArchived(action.id, action.title, action.archived)
          else if (action?.type === 'checkout') void executeCheckout(action.id)
          else if (action?.type === 'close') void executeCloseLoan(action.id)
          else if (action?.type === 'reject') void executeRejectRequest(action.id)
          else if (action?.type === 'resolve') void executeResolveLostLoan(action.id)
        }}
      />
  </main>
}
