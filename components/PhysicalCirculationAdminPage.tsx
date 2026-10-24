'use client'

import { ChangeEvent, FormEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { getSupabase } from '@/utils/supabase/client'
import { AdminPhysicalSkeleton } from '@/components/skeletons/AdminDashboardSkeleton'
import ResultModal from '@/components/ResultModal'
import ActionModal from '@/components/ActionModal'
import BaseModal from '@/components/BaseModal'
import BookAssistant from '@/components/BookAssistant'
import SearchableMemberSelect from '@/components/SearchableMemberSelect'
import { generateCatalogIsbn } from '@/utils/isbn'
import { PHYSICAL_LOAN_DURATION_OPTIONS } from '@/utils/libraryContracts'
import { isAdminRole, isStaffRole } from '@/utils/roles'

type Book = { id: number; title: string; author: string; category: string; isbn: string | null; description?: string | null; catalog_type: string; cover_image_url: string | null; is_archived: boolean }
type Copy = { id: number; book_id: number; copy_code: string; qr_token: string; status: string; location: string | null; section: string | null; shelf_number: string | null; row_number: string | null; position_number: string | null }
type Option = { id: number; book_id: number; duration_days: number; fee_amount: number; is_active: boolean }
type Loan = {
  id: number; student_id: string; book_id: number; copy_id: number | null; duration_days: number
  fee_amount: number; payment_method: string; payment_status: string; transaction_reference: string | null
  payment_proof_path: string | null; status: string; requested_at: string; checked_out_at: string | null
  due_date: string | null; returned_at: string | null; receipt_number: string | null
  reservation_expires_at: string | null; incident_type: 'lost' | 'damage' | null; incident_status: 'open' | 'resolved' | 'withdrawn' | null
  incident_note: string | null; incident_assessed_amount: number | null; incident_assessed_at: string | null; incident_resolved_at: string | null; incident_resolved_by: string | null
}
type LoanHistory = {
  id: number; student_id: string; book_id: number; copy_id: number; duration_days: number
  fee_amount: number; payment_method: string; payment_status: string; status: string
  checked_out_at: string; due_date: string; returned_at: string | null
  return_condition: string | null; receipt_number: string | null
}
type Profile = { id: string; email: string; full_name: string | null; role: string }
type PrintPayment = { id: number; student_id: string; amount: number; description: string; receipt_number: string; created_at: string }
type AvailabilityAlertEntry = { student_id: string; book_id: number; created_at: string }
type PhysicalFine = { id: number; physical_book_request_id: number; student_id: string; amount: number; status: string; fine_type: 'late_fee' | 'lost_item' | 'damage' | 'other'; created_at: string; paid_at?: string | null; refunded_at?: string | null; refund_due_at?: string | null; refund_reason?: string | null; fine_reason?: string | null; waiver_reason?: string | null; receipt_number?: string | null }
type FinanceReceipt = { kind: 'fine'; fine: PhysicalFine } | { kind: 'checkout'; loan: LoanHistory } | { kind: 'print'; payment: PrintPayment }
type LibraryHoliday = { holiday_date: string; name: string }
type RequestQueueFilter = 'all' | 'pending' | 'awaiting_payment' | 'ready' | 'availability_alerts'

const panel = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900'
const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950'
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
const fineTypeLabel = (type: PhysicalFine['fine_type']) => type === 'late_fee' ? 'Late return' : type === 'lost_item' ? 'Lost item' : type === 'damage' ? 'Damage assessment' : 'Other charge'
const titleGroupKey = (book: Pick<Book, 'title' | 'author' | 'category'>) =>
  [book.title, book.author, book.category].map((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()).join('|')


type CirculationPanel = 'requests' | 'checkedOut' | 'history' | 'lost' | 'print' | 'addBook'
type CirculationActionRequest = { panel: CirculationPanel; token: number; caseId?: number; requestId?: number } | null

export default function PhysicalCirculationAdminPage({ initialPanel, requestsOnly = false, overviewOnly = false, catalogOnly = false, policyOnly = false, finesOnly = false, requestedPanel = null, active = true, onClose, onOpenLostCase, onOpenFines }: { initialPanel?: CirculationPanel; requestsOnly?: boolean; overviewOnly?: boolean; catalogOnly?: boolean; policyOnly?: boolean; finesOnly?: boolean; requestedPanel?: CirculationActionRequest; active?: boolean; onClose?: () => void; onOpenLostCase?: (caseId: number) => void; onOpenFines?: () => void }) {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [books, setBooks] = useState<Book[]>([])
  const [copies, setCopies] = useState<Copy[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [loanHistory, setLoanHistory] = useState<LoanHistory[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [availabilityAlerts, setAvailabilityAlerts] = useState<AvailabilityAlertEntry[]>([])
  const [physicalFines, setPhysicalFines] = useState<PhysicalFine[]>([])
  const [printPayments, setPrintPayments] = useState<PrintPayment[]>([])
  const [printReceiptForm, setPrintReceiptForm] = useState({ studentId: '', amount: '', description: '' })
  const [holidays, setHolidays] = useState<LibraryHoliday[]>([])
  const [qrImages, setQrImages] = useState<Record<string, string>>({})
  const [copyForm, setCopyForm] = useState({ bookId: '', quantity: '1', prefix: '', location: '' })
  const [newPhysicalBook, setNewPhysicalBook] = useState({
    title: '', author: '', category: '', isbn: '', description: '', quantity: '1', prefix: '', location: '', coverImageUrl: '',
  })
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [optionForm, setOptionForm] = useState({ bookId: '', fees: Object.fromEntries(PHYSICAL_LOAN_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string> })
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' })
  const [returnConditions, setReturnConditions] = useState<Record<number, 'available' | 'damaged' | 'lost'>>({})
  const [selectedLostCaseId, setSelectedLostCaseId] = useState<number | null>(null)
  const [lostResolution, setLostResolution] = useState<Record<number, 'available' | 'damaged' | 'withdrawn'>>({})
  const [lostSearch, setLostSearch] = useState('')
  const [lostCaseView, setLostCaseView] = useState<'open' | 'solved' | 'all'>('open')
  const [lostPage, setLostPage] = useState(1)
  const [recoveryDamageDrafts, setRecoveryDamageDrafts] = useState<Record<number, { amount: string; reason: string }>>({})
  const [historyBookId, setHistoryBookId] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historyDetailBookId, setHistoryDetailBookId] = useState<number | null>(null)
  const [expandedCatalogKey, setExpandedCatalogKey] = useState<string | null>(null)
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [fineWaiver, setFineWaiver] = useState<{ id: number; reason: string } | null>(null)
  const [finePaymentConfirmation, setFinePaymentConfirmation] = useState<PhysicalFine | null>(null)
  const [fineRefundConfirmation, setFineRefundConfirmation] = useState<{ fine: PhysicalFine; reason: string } | null>(null)
  const [fineSearch, setFineSearch] = useState('')
  const [fineStatusFilter, setFineStatusFilter] = useState<'all' | 'needs_action' | 'pending' | 'pending_verification' | 'unpaid' | 'paid' | 'waived' | 'refund_due' | 'refunded'>('all')
  const [financeSort, setFinanceSort] = useState<{ key: 'date' | 'amount'; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' })
  const [financeReceipt, setFinanceReceipt] = useState<FinanceReceipt | null>(null)
  const [lostFineDrafts, setLostFineDrafts] = useState<Record<number, { amount: string; reason: string }>>({})
  const [lostFineLoanId, setLostFineLoanId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [openPanel, setOpenPanel] = useState<CirculationPanel | null>(null)
  const [policyModalOpen, setPolicyModalOpen] = useState(false)
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
  const [pendingAction, setPendingAction] = useState<{ type: 'checkout' | 'close' | 'reject'; id: number } | { type: 'archiveBook' | 'deleteBook'; id: number; title: string; archived: boolean } | { type: 'archiveMany' | 'deleteMany'; ids: number[] } | null>(null)

  const generateNewBookIsbn = () => {
    try {
      setNewPhysicalBook((current) => ({ ...current, isbn: generateCatalogIsbn(books.map((book) => book.isbn)) }))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate a catalog identifier.')
    }
  }
  const generateEditBookIsbn = () => {
    try {
      setEditBookForm((current) => ({ ...current, isbn: generateCatalogIsbn(books.map((book) => book.isbn)) }))
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate a catalog identifier.')
    }
  }
  const [processingRequestId, setProcessingRequestId] = useState<number | null>(null)
  const [checkoutLoan, setCheckoutLoan] = useState<Loan | null>(null)
  const [checkoutNotes, setCheckoutNotes] = useState('')
  const lastLoadedAt = useRef<number | null>(null)

  const load = async () => {
    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError || !isStaffRole(profile?.role)) { router.replace('/unauthorized'); return }
    setIsAdmin(isAdminRole(profile?.role))
    if (!catalogOnly) {
      const { error: fineRefreshError } = await supabase.rpc('calculate_overdue_fines')
      if (fineRefreshError) {
        setError(`Unable to refresh overdue fines: ${fineRefreshError.message}`)
        setLoading(false)
        return
      }
    }
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
    const [bookResult, copyResult, optionResult, loanResult, historyResult, memberResult, availabilityAlertsResult, fineResult, holidayResult, printPaymentResult] = await Promise.all([
      supabase.from('books').select('id,title,author,category,isbn,description,catalog_type,cover_image_url,is_archived').order('title'),
      copyResultPromise,
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('physical_loan_options').select('id,book_id,duration_days,fee_amount,is_active').order('book_id').order('duration_days'),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('physical_book_requests').select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,transaction_reference,payment_proof_path,status,requested_at,checked_out_at,due_date,returned_at,receipt_number,reservation_expires_at,incident_type,incident_status,incident_note,incident_assessed_amount,incident_assessed_at,incident_resolved_at,incident_resolved_by').order('requested_at', { ascending: false }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('physical_book_loan_history').select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,status,checked_out_at,due_date,returned_at,return_condition,receipt_number').order('checked_out_at', { ascending: false }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('profiles').select('id,email,full_name,role').in('role', ['student', 'faculty']),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('physical_book_waitlist').select('student_id,book_id,created_at').order('created_at', { ascending: true }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('fines').select('id,physical_book_request_id,student_id,amount,status,fine_type,created_at,paid_at,refund_due_at,refunded_at,refund_reason,fine_reason,waiver_reason,receipt_number').not('physical_book_request_id', 'is', null).order('created_at', { ascending: false }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('library_holidays').select('holiday_date,name').order('holiday_date', { ascending: true }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('library_print_payments').select('id,student_id,amount,description,receipt_number,created_at').order('created_at', { ascending: false }),
    ])
    const failed = [bookResult, copyResult, optionResult, loanResult, historyResult, memberResult, availabilityAlertsResult, fineResult, holidayResult, printPaymentResult].find((result) => result.error)
    if (failed?.error) setError(`Unable to load physical circulation: ${failed.error.message}`)
    setBooks((bookResult.data ?? []) as Book[])
    setCopies((copyResult.data ?? []) as Copy[])
    setOptions((optionResult.data ?? []) as Option[])
    setLoans((loanResult.data ?? []) as Loan[])
    setLoanHistory((historyResult.data ?? []) as LoanHistory[])
    setProfiles((memberResult.data ?? []) as Profile[])
    setAvailabilityAlerts((availabilityAlertsResult.data ?? []) as AvailabilityAlertEntry[])
    setPhysicalFines((fineResult.data ?? []) as PhysicalFine[])
    setHolidays((holidayResult.data ?? []) as LibraryHoliday[])
    setPrintPayments((printPaymentResult.data ?? []) as PrintPayment[])
    lastLoadedAt.current = Date.now()
    setLoading(false)
  }

  useEffect(() => {
    if (!active) return
    if (lastLoadedAt.current === null || Date.now() - lastLoadedAt.current >= 60_000) void load()
  }, [active, router])

  useEffect(() => {
    if (!active) return
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
    const refreshAvailabilityAlerts = async () => {
      const { data, error: refreshError } = await supabase.from('physical_book_waitlist').select('student_id,book_id,created_at').order('created_at', { ascending: true })
      if (refreshError) setError(`Unable to refresh availability alerts: ${refreshError.message}`)
      else setAvailabilityAlerts((data ?? []) as AvailabilityAlertEntry[])
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
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'physical_book_waitlist' }, () => { void refreshAvailabilityAlerts() })
      channel.subscribe()
    }
    void setupChannel()
    return () => {
      disposed = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [active, router])

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
    if (!openPanel && !policyModalOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (policyModalOpen && !busy) setPolicyModalOpen(false)
      else if (selectedLostCaseId !== null) setSelectedLostCaseId(null)
      else if (historyDetailBookId !== null) setHistoryDetailBookId(null)
      else setOpenPanel(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [openPanel, policyModalOpen, selectedLostCaseId, historyDetailBookId, busy])

  useEffect(() => {
    if (!active) return
    if (requestedPanel?.panel === 'lost' && requestedPanel.caseId) setLostSearch(String(requestedPanel.caseId))
    if (requestedPanel?.panel === 'requests' && requestedPanel.requestId) setRequestSearch(String(requestedPanel.requestId))
    if (requestedPanel?.panel === 'addBook') {
      setNewPhysicalBookOpen(true)
      setOpenPanel(null)
    } else {
      setOpenPanel(requestedPanel?.panel ?? initialPanel ?? null)
    }
  }, [active, initialPanel, requestedPanel?.token, requestedPanel?.caseId, requestedPanel?.requestId])

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

  const submitHoliday = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setBusy(true); setError(''); setMessage('')
      const { data: { user } } = await getSupabase().auth.getUser()
      if (!user) {
        setError('Sign in again before adding a library holiday.')
        setBusy(false)
        return
      }
      const { error: saveError } = await getSupabase().from('library_holidays').insert({
        holiday_date: holidayForm.date,
        name: holidayForm.name.trim(),
        created_by: user.id,
      })
      if (saveError) setError(`Unable to add holiday: ${saveError.message}`)
      else {
        setHolidayForm({ date: '', name: '' })
        await load()
        setMessage('Public holiday added to the fine calendar.')
      }
      setBusy(false)
    }

  const deleteHoliday = async (holiday: LibraryHoliday) => {
      setBusy(true); setError(''); setMessage('')
      const { error: deleteError } = await getSupabase().from('library_holidays').delete().eq('holiday_date', holiday.holiday_date)
      if (deleteError) setError(`Unable to remove holiday: ${deleteError.message}`)
      else {
        await load()
        setMessage(`${holiday.name} removed from the fine calendar.`)
      }
      setBusy(false)
    }

  const recordFinePayment = async () => {
      if (!finePaymentConfirmation) return
      setBusy(true); setError(''); setMessage('')
      const { error: paymentError } = await getSupabase().rpc('admin_record_physical_fine_payment', { p_fine_id: finePaymentConfirmation.id })
      if (paymentError) setError(`Unable to record fine payment: ${paymentError.message}`)
      else {
        await load()
        setMessage('Physical-book fine payment recorded.')
      }
      setFinePaymentConfirmation(null)
      setBusy(false)
    }

  const recordFineRefund = async () => {
    if (!fineRefundConfirmation?.reason.trim()) return
    const { fine, reason } = fineRefundConfirmation
    setBusy(true); setError(''); setMessage('')
    const { error: refundError } = await getSupabase().rpc('admin_record_physical_fine_refund', {
      p_fine_id: fine.id,
      p_reason: reason.trim(),
    })
    if (refundError) setError(`Unable to record refund: ${refundError.message}`)
    else {
      await load()
      setMessage(`Replacement refund of PHP ${Number(fine.amount).toFixed(2)} recorded. The original receipt remains in transaction history.`)
    }
    setFineRefundConfirmation(null)
    setBusy(false)
  }

  const issuePrintReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(printReceiptForm.amount)
    const description = printReceiptForm.description.trim()
    if (!printReceiptForm.studentId || !Number.isFinite(amount) || amount <= 0 || !description) {
      setError('Choose a member and enter a valid amount and description.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    const { data, error: receiptError } = await getSupabase().rpc('admin_issue_print_payment_receipt', {
      p_student_id: printReceiptForm.studentId,
      p_amount: amount,
      p_description: description,
    })
    if (receiptError) setError(`Unable to issue print receipt: ${receiptError.message}`)
    else {
      setPrintReceiptForm({ studentId: '', amount: '', description: '' })
      await load()
      setMessage(`Print payment recorded. Receipt ${data?.receipt_number ?? ''}`)
    }
    setBusy(false)
  }

  const waivePhysicalFine = async () => {
    if (!fineWaiver || !fineWaiver.reason.trim()) return
    setBusy(true); setError(''); setMessage('')
    const { error: waiverError } = await getSupabase().rpc('admin_waive_physical_fine', {
      p_fine_id: fineWaiver.id,
      p_reason: fineWaiver.reason.trim(),
    })
    if (waiverError) setError(`Unable to waive physical fine: ${waiverError.message}`)
    else {
      await load()
      setMessage('Physical fine waived with the reason recorded in the audit history.')
      setFineWaiver(null)
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

  const archiveCatalogSelection = async (bookIds: number[]) => {
    setBusy(true); setError(''); setMessage('')
    const { error: archiveError } = await getSupabase().from('books').update({ is_archived: true }).in('id', bookIds)
    if (archiveError) setError(archiveError.message)
    else {
      setBooks((current) => current.map((book) => bookIds.includes(book.id) ? { ...book, is_archived: true } : book))
      setSelectedCatalogIds([]); setCatalogPage(1)
      setMessage(`${bookIds.length} physical catalog record${bookIds.length === 1 ? '' : 's'} archived. Existing loan history is preserved.`)
    }
    setBusy(false)
  }

  const deleteCatalogSelection = async (bookIds: number[]) => {
    setBusy(true); setError(''); setMessage('')
    const failures: string[] = []
    let deleted = 0
    for (const bookId of bookIds) {
      const { error: deleteError } = await getSupabase().rpc('admin_delete_catalog_book', { p_book_id: bookId })
      if (deleteError) failures.push(`#${bookId}: ${deleteError.message}`)
      else deleted += 1
    }
    if (deleted > 0) await load()
    setSelectedCatalogIds((current) => current.filter((id) => !bookIds.includes(id) || failures.some((failure) => failure.startsWith(`#${id}:`))))
    if (failures.length > 0) setError(`${deleted} title record${deleted === 1 ? '' : 's'} deleted. Some could not be deleted: ${failures.join(' · ')}`)
    else setMessage(`${deleted} archived title record${deleted === 1 ? '' : 's'} permanently deleted.`)
    setBusy(false)
  }

  const permanentlyDeleteBook = async (bookId: number, title: string) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: deleteError } = await getSupabase().rpc('admin_delete_catalog_book', { p_book_id: bookId })
      if (deleteError) throw new Error(deleteError.message)
      setBooks((current) => current.filter((book) => book.id !== bookId))
      setMessage(`“${title}” was permanently deleted.`)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to permanently delete this title.')
    } finally {
      setBusy(false)
    }
  }

  const submitPhysicalBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isAdmin) {
      setError('Only an administrator can add a new title to the physical catalog.')
      return
    }
    const formElement = event.currentTarget
    setBusy(true); setError(''); setMessage('')
    const supabase = getSupabase()
    let coverUrl: string | null = newPhysicalBook.coverImageUrl.trim() || null
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
      setNewPhysicalBook({ title: '', author: '', category: '', isbn: '', description: '', quantity: '1', prefix: '', location: '', coverImageUrl: '' })
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
    const selectedBook = books.find((book) => book.id === Number(optionForm.bookId))
    if (!selectedBook || !['physical', 'hybrid'].includes(selectedBook.catalog_type)) {
      setError('Open Loan fees from the physical book you want to manage, then try again.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    const invalidFee = PHYSICAL_LOAN_DURATION_OPTIONS.some((days) => !Number.isFinite(Number(optionForm.fees[String(days)])) || Number(optionForm.fees[String(days)]) < 0)
    if (invalidFee) {
      setError('Each physical-book fee must be a valid non-negative amount.')
      setBusy(false)
      return
    }
    const { error: saveError } = await getSupabase().rpc('admin_set_physical_loan_options', {
      p_book_id: Number(optionForm.bookId),
      p_options: PHYSICAL_LOAN_DURATION_OPTIONS.map((days) => ({ duration_days: days, fee_amount: Number(optionForm.fees[String(days)]) })),
    })
    if (saveError) setError(saveError.message)
    else { await load(); setOptionFormOpen(false); setMessage('Loan periods and fees were saved for this title.') }
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
    const condition = returnConditions[loanId] ?? 'available'
    if (condition === 'lost' || condition === 'damaged') {
      const draft = lostFineDrafts[loanId] ?? { amount: '', reason: '' }
      if ((condition === 'damaged' || condition === 'lost') && !draft.reason.trim()) {
        setError(condition === 'lost' ? 'Record an inspection note describing the lost item.' : 'Record an inspection note describing the damage.')
        setBusy(false)
        return
      }
      const { data, error: actionError } = await getSupabase().rpc('admin_inspect_physical_return', {
        p_request_id: loanId,
        p_copy_condition: condition,
        p_assessed_amount: 0,
        p_assessment_reason: condition === 'damaged' || condition === 'lost' ? draft.reason.trim() : null,
      })
      if (actionError) setError(actionError.message)
      else {
        setLostFineLoanId(null)
        setLostFineDrafts((current) => ({ ...current, [loanId]: { amount: '', reason: '' } }))
        await load()
        const saved = data as Loan
        setMessage(saved.status === 'lost' && condition !== 'lost'
          ? 'This loan reached the 30-day overdue threshold and was classified as lost. Review the open case to assess it.'
          : condition === 'lost'
            ? 'Book marked lost and an open case was created. Decide on a replacement assessment from the case.'
            : 'Return recorded as damaged. The copy is unavailable until staff resolves its damage assessment.')
      }
      setBusy(false)
      return
    }
    const { data, error: actionError } = await getSupabase().rpc('admin_inspect_physical_return', {
      p_request_id: loanId, p_copy_condition: condition, p_assessed_amount: 0, p_assessment_reason: null,
    })
    if (actionError) setError(actionError.message)
    else {
      await load()
      const saved = data as Loan
      setMessage(saved.status === 'lost'
        ? 'This loan reached the 30-day overdue threshold and was classified as lost. Review the open case to assess it.'
        : 'Return inspection recorded, copy availability updated, and loan closed.')
    }
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
    const condition = lostResolution[loanId] ?? 'available'
    const damageDraft = recoveryDamageDrafts[loanId] ?? { amount: '', reason: '' }
    const damageAmount = 0
    if (condition === 'damaged' && !damageDraft.reason.trim()) {
      setError('Record an inspection note before resolving the found copy.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    const { error: actionError } = await getSupabase().rpc('admin_resolve_lost_physical_loan', {
      p_request_id: loanId,
      p_copy_condition: condition,
      p_damage_amount: damageAmount,
      p_damage_reason: condition === 'damaged' ? damageDraft.reason.trim() : null,
    })
    if (actionError) setError(actionError.message)
    else {
      const paidReplacement = physicalFines.some((fine) => fine.physical_book_request_id === loanId && fine.fine_type === 'lost_item' && fine.status === 'paid')
      await load()
      setMessage(condition === 'withdrawn'
        ? 'Lost case closed as unresolved. Any replacement and late charges remain separate and due.'
        : `${condition === 'damaged' ? 'Recovered copy inspected and damage assessment recorded. ' : ''}Lost-book hold resolved; any unpaid replacement assessment was waived. Separate late charges remain due.${paidReplacement ? ' A previous replacement payment remains on record for cashier review.' : ''}`)
      setRecoveryDamageDrafts((current) => ({ ...current, [loanId]: { amount: '', reason: '' } }))
      setSelectedLostCaseId(null)
    }
    setBusy(false)
  }

  const assessPhysicalIncident = async (loanId: number) => {
    const loan = loans.find((item) => item.id === loanId)
    if (!loan?.incident_type || loan.incident_assessed_at) {
      setError('This incident has already been assessed or is no longer open.')
      return;
    }
    const draft = lostFineDrafts[loanId] ?? { amount: '', reason: '' }
    const amount = Number(draft.amount)
    if (!draft.amount.trim() || !Number.isFinite(amount) || amount < 0 || !draft.reason.trim()) {
      setError('Enter an amount from 0 upward and record the assessment reason.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    const { error: fineError } = await getSupabase().rpc('admin_assess_physical_incident', {
      p_request_id: loanId, p_amount: amount, p_reason: draft.reason.trim(),
    })
    if (fineError) setError(fineError.message)
    else {
      setLostFineDrafts((current) => ({ ...current, [loanId]: { amount: '', reason: '' } }))
      await load()
      setMessage(amount > 0 ? 'Incident assessment recorded as a separate charge.' : 'Incident reviewed with no charge. The decision is recorded in the loan history.')
    }
    setBusy(false)
  }

  const resolveDamageCase = async (loanId: number) => {
    const condition = lostResolution[loanId] ?? 'available'
    const note = recoveryDamageDrafts[loanId]?.reason?.trim() ?? ''
    if (!note) { setError('Describe the repair completed or why the copy is withdrawn.'); return }
    setBusy(true); setError(''); setMessage('')
    const { error: resolveError } = await getSupabase().rpc('admin_resolve_physical_damage_case', {
      p_request_id: loanId, p_copy_condition: condition, p_resolution_note: note,
    })
    if (resolveError) setError(resolveError.message)
    else { await load(); setSelectedLostCaseId(null); setMessage(condition === 'available' ? 'Copy marked repaired and returned to circulation.' : condition === 'withdrawn' ? 'Copy withdrawn from the collection and damage case closed.' : 'Damage review saved; copy remains unavailable pending repair.') }
    setBusy(false)
  }

  const checkout = (loanId: number) => {
    const loan = loans.find((item) => item.id === loanId)
    if (!loan) return
    setCheckoutLoan(loan)
    setCheckoutNotes('')
  }
  const closeLoan = (loanId: number) => {
    const condition = returnConditions[loanId] ?? 'available'
    if (condition === 'damaged' || condition === 'lost') {
      setLostFineDrafts((current) => ({ ...current, [loanId]: current[loanId] ?? { amount: '', reason: '' } }))
    }
    if (condition === 'damaged') {
      setLostFineLoanId(loanId)
      return
    }
    setPendingAction({ type: 'close', id: loanId })
  }
  const rejectRequest = (loanId: number) => setPendingAction({ type: 'reject', id: loanId })
  const resolveLostLoan = (loanId: number) => setSelectedLostCaseId(loanId)

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

  // Keep completed circulation cases in the checked-out and lost-item panels.
  const queueLoans = loans.filter((loan) => loan.status === 'pending')
  const visibleAvailabilityAlerts = availabilityAlerts.filter((entry) => {
    const query = requestSearch.trim().toLowerCase()
    const searchable = [bookName(entry.book_id), memberName(entry.student_id), String(entry.book_id)].join(' ').toLowerCase()
    return (!query || searchable.includes(query)) && (requestStatus === 'all' || requestStatus === 'availability_alerts')
  })
  const bookName = (bookId: number) => books.find((book) => book.id === bookId)?.title ?? `Book #${bookId}`
  const copyCode = (copyId: number | null) => copies.find((copy) => copy.id === copyId)?.copy_code ?? 'Copy unavailable'
  const memberName = (memberId: string) => {
    const person = profiles.find((profile) => profile.id === memberId)
    return person?.full_name?.trim() || 'Unknown borrower'
  }
  const filteredWaitingLoans = useMemo(() => {
    const query = requestSearch.trim().toLowerCase()
    return queueLoans.filter((loan) => {
      const awaitingPayment = loan.payment_status !== 'paid'
      const ready = loan.payment_status === 'paid'
      const matchesStatus = requestStatus === 'all'
        || requestStatus === loan.status
        || (requestStatus === 'awaiting_payment' && awaitingPayment)
        || (requestStatus === 'ready' && ready)
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
  const incidentCases = loans.filter((loan) => loan.incident_type !== null)
  const openIncidentCases = incidentCases.filter((loan) => loan.incident_status === 'open' || (loan.incident_status === null && (loan.status === 'lost' || loan.incident_type === 'damage')))
  const solvedIncidentCases = incidentCases.filter((loan) => loan.incident_status === 'resolved' || loan.incident_status === 'withdrawn')
  const filteredLostLoans = useMemo(() => {
    const query = lostSearch.trim().toLocaleLowerCase()
    const sourceCases = lostCaseView === 'open' ? openIncidentCases : lostCaseView === 'solved' ? solvedIncidentCases : incidentCases
    return sourceCases.filter((loan) => [bookName(loan.book_id), memberName(loan.student_id), copyCode(loan.copy_id), String(loan.id), loan.incident_type ?? '', loan.incident_status ?? ''].join(' ').toLocaleLowerCase().includes(query))
      .sort((a, b) => new Date(b.due_date ?? b.requested_at).getTime() - new Date(a.due_date ?? a.requested_at).getTime())
  }, [incidentCases, openIncidentCases, solvedIncidentCases, lostCaseView, lostSearch, books, profiles, copies])
  const selectedLostLoan = selectedLostCaseId === null ? null : loans.find((loan) => loan.id === selectedLostCaseId) ?? null
  const lostPageSize = 8
  const lostPageCount = Math.max(1, Math.ceil(filteredLostLoans.length / lostPageSize))
  const visibleLostLoans = filteredLostLoans.slice((Math.min(lostPage, lostPageCount) - 1) * lostPageSize, Math.min(lostPage, lostPageCount) * lostPageSize)
  useEffect(() => { setLostPage(1) }, [lostSearch, lostCaseView])
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
    const matchingBooks = books
      .filter((book) => book.is_archived === showArchivedBooks && (book.catalog_type === 'physical' || book.catalog_type === 'hybrid'))
    const groupedBooks = new Map<string, Book[]>()
    for (const book of matchingBooks) {
      const key = titleGroupKey(book)
      groupedBooks.set(key, [...(groupedBooks.get(key) ?? []), book])
    }

    return Array.from(groupedBooks, ([key, editions]) => {
        const orderedEditions = [...editions].sort((a, b) => a.id - b.id)
        const book = orderedEditions[0]
        const bookIds = orderedEditions.map((edition) => edition.id)
        const bookCopies = bookIds.flatMap((id) => copiesByBook.get(id) ?? [])
        const isbns = Array.from(new Set(orderedEditions.map((edition) => edition.isbn?.trim()).filter((isbn): isbn is string => Boolean(isbn))))
        return {
          key,
          book,
          bookIds,
          editions: orderedEditions,
          isbnConflict: isbns.length > 1,
          copies: bookCopies,
          total: bookCopies.length,
          available: bookCopies.filter((copy) => copy.status === 'available').length,
          borrowed: bookCopies.filter((copy) => copy.status === 'borrowed').length,
          locations: Array.from(new Set(bookCopies.map((copy) => [copy.section, copy.shelf_number, copy.row_number].filter(Boolean).join(' · ')).filter(Boolean))).join(', '),
        }
      })
      .filter((row) => (!query || [row.book.title, row.book.author, ...row.editions.map((edition) => edition.isbn), row.book.category].some((value) => value?.toLowerCase().includes(query)))
        && (catalogFormat === 'all' || row.book.catalog_type === catalogFormat))
      .sort((a, b) => catalogSort === 'author' ? a.book.author.localeCompare(b.book.author) : catalogSort === 'available' ? b.available - a.available : a.book.title.localeCompare(b.book.title))
  }, [books, copies, catalogSearch, catalogFormat, catalogSort, showArchivedBooks])
  const catalogPageSize = 10
  const catalogPageCount = Math.max(1, Math.ceil(catalogRows.length / catalogPageSize))
  const visibleCatalogRows = catalogRows.slice((catalogPage - 1) * catalogPageSize, catalogPage * catalogPageSize)
  const visibleCatalogIds = visibleCatalogRows.flatMap((row) => row.bookIds)
  const selectedActiveCatalogIds = selectedCatalogIds.filter((id) => books.some((book) => book.id === id && !book.is_archived))
  const selectedArchivedCatalogIds = selectedCatalogIds.filter((id) => books.some((book) => book.id === id && book.is_archived))
  const detailCopies = copies.filter((copy) => copy.book_id === copyDetailsBookId)
  const historyBookRows = useMemo(() => {
    const query = historySearch.trim().toLowerCase()
    const groupedBooks = new Map<string, Book[]>()
    for (const book of books.filter((item) => item.catalog_type === 'physical' || item.catalog_type === 'hybrid')) {
      const key = titleGroupKey(book)
      groupedBooks.set(key, [...(groupedBooks.get(key) ?? []), book])
    }
    return Array.from(groupedBooks, ([key, editions]) => {
        const orderedEditions = [...editions].sort((a, b) => a.id - b.id)
        const book = orderedEditions[0]
        const bookIds = orderedEditions.map((edition) => edition.id)
        const records = loanHistory.filter((loan) => bookIds.includes(loan.book_id))
        const bookCopies = copies.filter((copy) => bookIds.includes(copy.book_id))
        return {
          key,
          book,
          bookIds,
          editions: orderedEditions,
          records,
          copies: bookCopies,
          active: records.filter((record) => record.status === 'checked_out').length,
          returned: records.filter((record) => record.status === 'returned').length,
          available: bookCopies.filter((copy) => copy.status === 'available').length,
        }
      })
      .filter(({ book, editions }) => !query || [book.title, book.author, book.category, ...editions.map((edition) => edition.isbn)].some((value) => value?.toLowerCase().includes(query)))
      .sort((a, b) => a.book.title.localeCompare(b.book.title))
  }, [books, copies, loanHistory, historySearch])
  const selectedHistoryBook = historyDetailBookId === null ? null : books.find((book) => book.id === historyDetailBookId) ?? null
  const selectedHistoryRows = historyDetailBookId === null ? [] : (() => {
    const selectedBook = books.find((book) => book.id === historyDetailBookId)
    if (!selectedBook) return []
    const groupedBookIds = books.filter((book) => titleGroupKey(book) === titleGroupKey(selectedBook)).map((book) => book.id)
    return loanHistory.filter((loan) => groupedBookIds.includes(loan.book_id))
  })()
  const financeRows = useMemo(() => {
    const rows = [
      ...queueLoans.map((loan) => ({
        id: `request-${loan.id}`, date: loan.requested_at,
        member: profiles.find((item) => item.id === loan.student_id)?.full_name || profiles.find((item) => item.id === loan.student_id)?.email || 'Member',
        description: `Physical request - ${bookName(loan.book_id)} - ${loan.duration_days} days - ${loan.payment_method} - ${loan.payment_status.replace(/_/g, ' ')}${loan.transaction_reference ? ` - ref ${loan.transaction_reference}` : ''}`,
        amount: Number(loan.fee_amount), status: loan.payment_status === 'pending_verification' ? 'pending_verification' : 'pending', receiptNumber: null,
        source: { kind: 'request' as const, loan },
      })),
      ...physicalFines.map((fine) => {
        const loan = loans.find((item) => item.id === fine.physical_book_request_id)
        const member = profiles.find((item) => item.id === fine.student_id)
        return {
          id: `fine-${fine.id}`, date: fine.paid_at ?? fine.created_at, member: member?.full_name || member?.email || 'Member',
          description: `${fineTypeLabel(fine.fine_type)} · ${loan ? books.find((book) => book.id === loan.book_id)?.title ?? 'Physical book' : 'Physical book'}`,
          amount: Number(fine.amount), status: fine.status, receiptNumber: fine.receipt_number ?? null,
          source: { kind: 'fine' as const, fine },
        }
      }),
      ...loanHistory.filter((loan) => Boolean(loan.receipt_number)).map((loan) => ({
        id: `checkout-${loan.id}`, date: loan.checked_out_at, member: profiles.find((item) => item.id === loan.student_id)?.full_name || profiles.find((item) => item.id === loan.student_id)?.email || 'Member',
        description: `Physical checkout · ${books.find((book) => book.id === loan.book_id)?.title ?? 'Physical book'} · ${copyCode(loan.copy_id)}`,
        amount: Number(loan.fee_amount), status: loan.payment_status, receiptNumber: loan.receipt_number,
        source: { kind: 'checkout' as const, loan },
      })),
      ...printPayments.map((payment) => ({
        id: `print-${payment.id}`, date: payment.created_at, member: profiles.find((item) => item.id === payment.student_id)?.full_name || profiles.find((item) => item.id === payment.student_id)?.email || 'Member',
        description: `Print service · ${payment.description}`, amount: Number(payment.amount), status: 'paid', receiptNumber: payment.receipt_number,
        source: { kind: 'print' as const, payment },
      })),
    ]
    const query = fineSearch.trim().toLocaleLowerCase()
    return rows
      .filter((row) => fineStatusFilter === 'all'
        || (fineStatusFilter === 'needs_action' && (row.source.kind === 'request' || (row.source.kind === 'fine' && (row.source.fine.status === 'unpaid' || row.source.fine.status === 'refund_due'))))
        || row.status === fineStatusFilter)
      .filter((row) => !query || [row.member, row.description, row.receiptNumber, row.id].join(' ').toLocaleLowerCase().includes(query))
      .sort((a, b) => {
        const comparison = financeSort.key === 'date'
          ? new Date(a.date).getTime() - new Date(b.date).getTime()
          : a.amount - b.amount
        return financeSort.direction === 'asc' ? comparison : -comparison
      })
  }, [queueLoans, physicalFines, loans, loanHistory, printPayments, profiles, books, fineSearch, fineStatusFilter, copies, financeSort])
  const openOptionEditor = (bookId: number) => {
    const existing = options.filter((option) => option.book_id === bookId)
    setOptionForm({
      bookId: String(bookId),
      fees: Object.fromEntries(PHYSICAL_LOAN_DURATION_OPTIONS.map((days) => [days, String(existing.find((option) => option.duration_days === days)?.fee_amount ?? 0)])),
    })
    setOptionFormOpen(true)
  }
  if (loading && (overviewOnly || catalogOnly || policyOnly || finesOnly)) return null
  if (loading) return <AdminPhysicalSkeleton />

  return <main className={`physical-staff-shell ${requestsOnly ? 'physical-requests-only contents' : overviewOnly ? 'contents' : catalogOnly || policyOnly || finesOnly ? 'min-h-full px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-6' : 'min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8'}`}>
    <div className="mx-auto max-w-6xl space-y-6">
      <div className={requestsOnly ? 'physical-requests-result' : undefined}>
        <ResultModal
          open={Boolean(error || message)}
          status={error ? 'error' : 'success'}
          message={error || message}
          onClose={() => { setError(''); setMessage('') }}
        />
      </div>

      {!requestsOnly && !overviewOnly && !catalogOnly && !policyOnly && !finesOnly ? <>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Library desk</p><h1 className="mt-1 text-2xl font-semibold">Circulation overview</h1><p className="mt-1 text-sm text-slate-500">Review requests, active loans, exceptions, and receipts from here.</p></div>
          {isAdmin ? <button type="button" onClick={() => setNewPhysicalBookOpen(true)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-600">Add physical book</button> : null}
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Requests to review</p><strong className="mt-2 block text-2xl">{queueLoans.length}</strong></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Checked out</p><strong className="mt-2 block text-2xl">{activeLoans.length}</strong></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lost items</p><strong className="mt-2 block text-2xl">{lostLoans.length}</strong></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Unpaid fines</p><strong className="mt-2 block text-2xl">{physicalFines.filter((fine) => fine.status === 'unpaid').length}</strong></div>
        </div>
      </> : null}

      {!overviewOnly && !catalogOnly && !policyOnly && !finesOnly ? <div className="physical-queue-nav flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60" role="toolbar" aria-label="Physical circulation actions">
        {!requestsOnly ? <button type="button" onClick={() => setOpenPanel('requests')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Requests <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">{queueLoans.length}</span></button> : null}
        <button type="button" onClick={() => setOpenPanel('checkedOut')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Checked out <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{activeLoans.length}</span></button>
        <button type="button" onClick={() => setOpenPanel('history')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Loan history</button>
        <button type="button" onClick={() => setOpenPanel('lost')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Lost items <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800 dark:bg-rose-950 dark:text-rose-200">{openIncidentCases.length}</span></button>
        {!requestsOnly ? <button type="button" onClick={() => setOpenPanel('print')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Print payments &amp; receipts</button> : null}
        {!isAdmin && !requestsOnly ? <button type="button" onClick={() => setPolicyModalOpen(true)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Fine payments</button> : null}
      </div> : null}

      {newPhysicalBookOpen && isAdmin ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setNewPhysicalBookOpen(false) }}><form onSubmit={(event) => void submitPhysicalBook(event)} className={`${panel} max-h-[90vh] w-full max-w-4xl space-y-3 overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="add-physical-book-title">
        <div className="flex items-start justify-between gap-4"><div><h2 id="add-physical-book-title" className="text-lg font-semibold">Add a physical book to the catalog</h2><p className="text-sm text-slate-500">Create the title, initial copies, and QR labels together.</p></div><button type="button" disabled={busy} onClick={() => setNewPhysicalBookOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">Title<input required maxLength={300} value={newPhysicalBook.title} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, title: event.target.value })} className={`${input} mt-1`} /></label>
          <label className="text-sm font-medium">Author<input required maxLength={200} value={newPhysicalBook.author} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, author: event.target.value })} className={`${input} mt-1`} /></label>
          <label className="text-sm font-medium">Category<input required maxLength={120} value={newPhysicalBook.category} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, category: event.target.value })} placeholder="e.g. Biology" className={`${input} mt-1`} /></label>
          <div><label className="text-sm font-medium">ISBN (optional)<input maxLength={32} value={newPhysicalBook.isbn} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, isbn: event.target.value })} className={`${input} mt-1`} /></label><button type="button" onClick={generateNewBookIsbn} className="mt-2 text-xs font-semibold text-emerald-800 underline dark:text-emerald-300">Generate ISBN-13</button><p className="mt-1 text-[11px] text-slate-500">System-generated IDs are for internal catalog use; use the publisher”™s ISBN for official records.</p></div>
          <label className="text-sm font-medium">Copy-code prefix<input required maxLength={32} pattern="[A-Za-z0-9_-]+" value={newPhysicalBook.prefix} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, prefix: event.target.value })} placeholder="e.g. BIO101" className={`${input} mt-1`} /></label>
          <label className="text-sm font-medium">Number of copies<input required type="number" min="1" max="100" value={newPhysicalBook.quantity} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, quantity: event.target.value })} className={`${input} mt-1`} /></label>
          <label className="text-sm font-medium">Shelf / location (optional)<input maxLength={120} value={newPhysicalBook.location} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, location: event.target.value })} placeholder="e.g. Science shelf B" className={`${input} mt-1`} /></label>
          <label className="text-sm font-medium">Front cover (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => { setCoverFile(event.target.files?.[0] ?? null); if (event.target.files?.[0]) setNewPhysicalBook((current) => ({ ...current, coverImageUrl: '' })) }} className={`${input} mt-1`} /><span className="mt-1 block text-xs font-normal text-slate-500">JPG, PNG, or WebP · up to 5 MB{newPhysicalBook.coverImageUrl ? ' · reusing the existing cover' : ''}</span></label>
        </div>
        <label className="block text-sm font-medium">Description (optional)<textarea maxLength={3000} rows={3} value={newPhysicalBook.description} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, description: event.target.value })} className={`${input} mt-1`} /></label>
        <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Saving...' : 'Add book and copies'}</button>
      </form></div> : null}

      {copyFormOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCopyFormOpen(false) }}>
        <form onSubmit={(event) => void submitCopyForm(event)} className={`${panel} w-full max-w-xl space-y-4`} role="dialog" aria-modal="true" aria-labelledby="add-copies-title">
          <div className="flex items-start justify-between gap-4"><div><h2 id="add-copies-title" className="text-lg font-semibold">Add copies to an existing title</h2><p className="mt-1 text-sm text-slate-500">New copies receive unique IDs and QR labels.</p></div><button type="button" disabled={busy} onClick={() => setCopyFormOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <label className="block text-sm font-medium">Book<select required value={copyForm.bookId} onChange={(event) => setCopyForm({ ...copyForm, bookId: event.target.value })} className={`${input} mt-1`}><option value="">Choose a book</option>{books.filter((book) => !book.is_archived).map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">ISBN: {books.find((book) => book.id === Number(copyForm.bookId))?.isbn || 'Not set'} · Copies of the same edition share its ISBN; each copy receives its own barcode and QR code.</p>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Copy-code prefix<input required value={copyForm.prefix} onChange={(event) => setCopyForm({ ...copyForm, prefix: event.target.value })} maxLength={32} pattern="[A-Za-z0-9_-]+" placeholder="e.g. BIO101" className={`${input} mt-1`} /></label><label className="text-sm font-medium">Quantity<input required type="number" min="1" max="100" value={copyForm.quantity} onChange={(event) => setCopyForm({ ...copyForm, quantity: event.target.value })} className={`${input} mt-1`} /></label></div>
          <label className="block text-sm font-medium">Shelf / location (optional)<input value={copyForm.location} onChange={(event) => setCopyForm({ ...copyForm, location: event.target.value })} maxLength={120} placeholder="e.g. Science · Shelf 2" className={`${input} mt-1`} /></label>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Creating...' : 'Create copies'}</button>
        </form>
      </div> : null}

      {optionFormOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOptionFormOpen(false) }}>
        <form onSubmit={(event) => void submitOptionForm(event)} className={`${panel} w-full max-w-3xl space-y-4`} role="dialog" aria-modal="true" aria-labelledby="loan-fees-title">
          <div className="flex items-start justify-between gap-4"><div><h2 id="loan-fees-title" className="text-lg font-semibold">Loan fees · {books.find((book) => book.id === Number(optionForm.bookId))?.title ?? 'Selected book'}</h2><p className="mt-1 text-sm text-slate-500">Set the checkout fee for each loan period. To edit another title, close this window and choose Loan fees from that book”™s management menu.</p></div><button type="button" disabled={busy} onClick={() => setOptionFormOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Selected physical title</span><p className="mt-1 font-semibold">{books.find((book) => book.id === Number(optionForm.bookId))?.title ?? 'Book no longer available'}</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{PHYSICAL_LOAN_DURATION_OPTIONS.map((days) => <label key={days} className="text-sm font-medium">{days}-day checkout fee (₱)<input required type="number" min="0" max="100000" step="0.01" value={optionForm.fees[String(days)] ?? '0'} onChange={(event) => setOptionForm((current) => ({ ...current, fees: { ...current.fees, [days]: event.target.value } }))} className={`${input} mt-1`} /></label>)}</div>
          <button disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Saving...' : 'Save periods and fees'}</button>
        </form>
      </div> : null}

      {policyOnly && isAdmin ? <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-xl font-semibold">Borrowing policy &amp; fine calendar</h1><p className="mt-1 text-sm text-slate-500">Review the current rules and manage public holiday dates used by overdue calculations.</p></div>
          <button type="button" onClick={() => setPolicyModalOpen(true)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Edit policy &amp; holidays</button>
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Each physical title can offer 1, 3, 5, 7, 14, and 30-day loans with separate checkout fees. Overdue charges start after a 2-day grace period at ₱5 per chargeable day, capped at ₱500 per item. Sundays and listed holidays are excluded; items overdue for 30 consecutive days are marked lost.</p>
        <p className="mt-3 text-sm text-slate-500">{holidays.length} public holiday{holidays.length === 1 ? '' : 's'} configured. Physical payments, fines, and receipts are available in Transactions.</p>
      </section> : null}

      {(finesOnly || requestsOnly) && isAdmin ? <section id="physical-transactions" className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Library finance</p><h1 className="mt-1 text-xl font-semibold">Transactions</h1><p className="mt-1 text-sm text-slate-500">Review requests, payments, fines, and receipts together.</p></div>
          <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{physicalFines.filter((fine) => fine.status === 'unpaid').length} unpaid fines</span>
        </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row"><input type="search" value={fineSearch} onChange={(event) => setFineSearch(event.target.value)} placeholder="Search member, title, receipt, or transaction..." aria-label="Search transactions" className={`${input} sm:flex-1`} /><select value={fineStatusFilter} onChange={(event) => setFineStatusFilter(event.target.value as typeof fineStatusFilter)} aria-label="Filter transactions by status" className={`${input} sm:w-48`}><option value="all">All transactions</option><option value="needs_action">Needs action</option><option value="pending">Pending requests</option><option value="pending_verification">Payment verification</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="waived">Waived</option><option value="refund_due">Refund due</option><option value="refunded">Refunded</option></select></div>
        <p className="mt-3 text-xs text-slate-500">Showing {financeRows.length} transaction{financeRows.length === 1 ? '' : 's'}.</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-3"><button type="button" onClick={() => setFinanceSort((current) => ({ key: 'date', direction: current.key === 'date' && current.direction === 'desc' ? 'asc' : 'desc' }))}>Date {financeSort.key === 'date' ? (financeSort.direction === 'desc' ? '▼' : '▲') : '↕'}</button></th><th className="px-3 py-3">Member</th><th className="px-3 py-3">Transaction</th><th className="px-3 py-3"><button type="button" onClick={() => setFinanceSort((current) => ({ key: 'amount', direction: current.key === 'amount' && current.direction === 'desc' ? 'asc' : 'desc' }))}>Amount {financeSort.key === 'amount' ? (financeSort.direction === 'desc' ? '▼' : '▲') : '↕'}</button></th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Receipt / action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{financeRows.map((row) => { const source = row.source; const loan = source.kind === 'fine' ? loans.find((item) => item.id === source.fine.physical_book_request_id) : source.kind === 'request' ? source.loan : null; const canSettle = loan?.status === 'returned' || loan?.status === 'lost'; const needsAction = source.kind === 'request' || (source.kind === 'fine' && (source.fine.status === 'unpaid' || source.fine.status === 'refund_due')); const recent = Date.now() - new Date(row.date).getTime() <= 7 * 24 * 60 * 60 * 1000; return <tr key={row.id} className={needsAction ? 'bg-emerald-50 dark:bg-emerald-950/35' : recent ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-white dark:bg-slate-900'}><td className="whitespace-nowrap px-3 py-3">{new Date(row.date).toLocaleDateString()}</td><td className="px-3 py-3">{row.member}</td><td className="px-3 py-3">{row.description}</td><td className="whitespace-nowrap px-3 py-3">PHP {row.amount.toFixed(2)}</td><td className="px-3 py-3 capitalize">{row.status.replace(/_/g, ' ')}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-2">{row.receiptNumber && source.kind !== 'request' ? <button type="button" onClick={() => setFinanceReceipt(source)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700">View receipt</button> : null}{source.kind === 'fine' && source.fine.status === 'unpaid' ? <><button type="button" disabled={busy || !canSettle} title={canSettle ? 'Record cashier payment' : 'Return or resolve the lost item first'} onClick={() => setFinePaymentConfirmation(source.fine)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-slate-700">Record payment</button><button type="button" disabled={busy || !canSettle} onClick={() => setFineWaiver({ id: source.fine.id, reason: '' })} className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:text-amber-200">Waive</button></> : null}{source.kind === 'fine' && source.fine.status === 'refund_due' ? <button type="button" disabled={busy} onClick={() => setFineRefundConfirmation({ fine: source.fine, reason: '' })} className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:text-amber-200">Record refund</button> : null}{source.kind === 'request' ? <><button type="button" disabled={processingRequestId !== null} onClick={() => checkout(source.loan.id)} className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-40 dark:border-emerald-700 dark:text-emerald-200">Review &amp; approve</button><button type="button" disabled={processingRequestId !== null} onClick={() => void rejectRequest(source.loan.id)} className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-800 disabled:opacity-40 dark:border-rose-800 dark:text-rose-200">Reject</button>{source.loan.payment_proof_path ? <button type="button" onClick={() => void openProof(source.loan.payment_proof_path!)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700">View proof</button> : null}</> : null}</div></td></tr> })}{financeRows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">No transactions match your search.</td></tr> : null}</tbody></table></div>
      </section> : null}
      {!requestsOnly && !overviewOnly && !catalogOnly && !policyOnly && !finesOnly && isAdmin ? <>
        <section className={`${panel} flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <h2 className="text-xl font-semibold">Borrowing policy &amp; fine calendar</h2>
            <p className="mt-1 text-sm text-slate-500">Review the physical borrowing rules, maintain holiday dates, and record fine payments.</p>
          </div>
          <button type="button" onClick={() => setPolicyModalOpen(true)} className="shrink-0 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            Manage policy
          </button>
        </section>
        {policyModalOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPolicyModalOpen(false) }}>
          <section className={`${panel} max-h-[92vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="borrowing-policy-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="borrowing-policy-title" className="text-xl font-semibold">Borrowing policy &amp; fine calendar</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-500">Choose 1, 3, 5, 7, 14, or 30 days when requesting a physical book; each title has its own checkout fee for every period. Late fees use the configured grace period and daily cap. Sundays and listed holidays are excluded, and items overdue for 30 consecutive days are marked lost.</p>
              </div>
              <button type="button" disabled={busy} onClick={() => setPolicyModalOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">Close</button>
            </div>
            <div className={`mt-5 grid gap-6 ${isAdmin ? 'lg:grid-cols-2' : ''}`}>
              {isAdmin ? <div>
                <h3 className="font-semibold">Official public holidays</h3>
                <form onSubmit={(event) => void submitHoliday(event)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="text-xs font-medium">Date<input required type="date" value={holidayForm.date} onChange={(event) => setHolidayForm({ ...holidayForm, date: event.target.value })} className={`${input} mt-1`} /></label>
                  <label className="text-xs font-medium">Holiday name<input required maxLength={120} value={holidayForm.name} onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })} className={`${input} mt-1`} /></label>
                  <button disabled={busy} className="self-end rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">{busy ? 'Adding...' : 'Add date'}</button>
                </form>
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {holidays.map((holiday) => <li key={holiday.holiday_date} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>{new Date(`${holiday.holiday_date}T12:00:00`).toLocaleDateString()} · {holiday.name}</span>
                    <button type="button" disabled={busy} onClick={() => void deleteHoliday(holiday)} className="text-xs font-semibold text-rose-700 disabled:opacity-50 dark:text-rose-300">Remove</button>
                  </li>)}
                  {holidays.length === 0 ? <li className="py-3 text-sm text-slate-500">No public holidays entered yet.</li> : null}
                </ul>
              </div> : null}
              <div>
                <h3 className="font-semibold">Physical fines awaiting cashier settlement</h3>
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {physicalFines.filter((fine) => fine.status === 'unpaid').map((fine) => {
                    const loan = loans.find((item) => item.id === fine.physical_book_request_id)
                    const book = loan ? books.find((item) => item.id === loan.book_id) : null
                    const member = profiles.find((item) => item.id === fine.student_id)
                    const settledLoan = loan?.status === 'returned' || loan?.status === 'lost'
                    return <li key={fine.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <span><strong>{book?.title ?? 'Physical book'}</strong><span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{fineTypeLabel(fine.fine_type)}</span><span className="block text-xs text-slate-500">{member?.full_name || member?.email || 'Member'} · ₱{Number(fine.amount).toFixed(2)}</span>{fine.fine_reason ? <span className="block max-w-xl text-xs text-slate-500">{fine.fine_reason}</span> : null}</span>
                      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !settledLoan} title={settledLoan ? 'Record cashier payment' : 'Book must be returned or classified lost first'} onClick={() => setFinePaymentConfirmation(fine)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-40 dark:border-slate-700">Record payment</button><button type="button" disabled={busy || !settledLoan} onClick={() => setFineWaiver({ id: fine.id, reason: '' })} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:border-amber-800 dark:text-amber-200">Waive with reason</button></div>
                    </li>
                  })}
                  {physicalFines.filter((fine) => fine.status === 'unpaid').length === 0 ? <li className="py-3 text-sm text-slate-500">No unpaid physical fines.</li> : null}
                </ul>
                <h3 className="mt-6 font-semibold">Settled fines and issued receipts</h3>
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">{physicalFines.filter((fine) => fine.status === 'paid').map((fine) => <li key={fine.id} className="py-3 text-sm"><strong>₱{Number(fine.amount).toFixed(2)}</strong><span className="ml-2 text-slate-500">{fineTypeLabel(fine.fine_type)} · {profiles.find((member) => member.id === fine.student_id)?.full_name || 'Member'}</span>{fine.fine_reason ? <span className="mt-1 block text-xs text-slate-500">{fine.fine_reason}</span> : null}{fine.receipt_number ? <span className="mt-1 block font-mono text-xs text-pine-700 dark:text-pine-200">Receipt {fine.receipt_number}</span> : <span className="mt-1 block text-xs text-amber-700">Receipt not available for this legacy payment</span>}</li>)}{physicalFines.every((fine) => fine.status !== 'paid') ? <li className="py-3 text-sm text-slate-500">No settled fines yet.</li> : null}</ul>
              </div>
            </div>
          </section>
        </div> : null}
      </> : null}

      {!policyOnly && !overviewOnly && !finesOnly ? <section className={panel}>
        <div className="physical-catalog-heading flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="physical-catalog" className="scroll-mt-6 text-xl font-semibold">Physical book catalog</h2>
            <p className="mt-1 text-sm text-slate-500">Search titles, inspect copy-level inventory, and monitor availability.</p>
          </div>
          {catalogOnly && isAdmin ? <button type="button" onClick={() => setNewPhysicalBookOpen(true)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Add physical book</button> : null}
        </div>
        <div className="physical-catalog-toolbar mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
          <input value={catalogSearch} onChange={(event) => { setCatalogSearch(event.target.value); setCatalogPage(1) }} placeholder="Search title, author, ISBN..." className={`${input} min-w-0`} />
          <select value={catalogFormat} onChange={(event) => { setCatalogFormat(event.target.value as typeof catalogFormat); setCatalogPage(1) }} className={`${input} min-w-0`}>
            <option value="all">All formats</option><option value="physical">Physical</option><option value="hybrid">Hybrid</option>
          </select>
          <select value={catalogSort} onChange={(event) => { setCatalogSort(event.target.value as typeof catalogSort); setCatalogPage(1) }} className={`${input} min-w-0`}>
            <option value="title">Sort: title</option><option value="author">Sort: author</option><option value="available">Sort: availability</option>
          </select>
          <button type="button" onClick={() => { setShowArchivedBooks((current) => !current); setCatalogPage(1); setSelectedCatalogIds([]) }} className="whitespace-nowrap rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">
            {showArchivedBooks ? 'View active' : 'View archived'}
          </button>
        </div>
        {isAdmin && selectedCatalogIds.length > 0 ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/70"><span className="mr-auto font-medium">{selectedCatalogIds.length} catalog record{selectedCatalogIds.length === 1 ? '' : 's'} selected</span>{selectedActiveCatalogIds.length > 0 ? <button type="button" disabled={busy} onClick={() => setPendingAction({ type: 'archiveMany', ids: selectedActiveCatalogIds })} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50 dark:text-amber-200">Archive {selectedActiveCatalogIds.length} active</button> : null}{selectedArchivedCatalogIds.length > 0 ? <button type="button" disabled={busy} onClick={() => setPendingAction({ type: 'deleteMany', ids: selectedArchivedCatalogIds })} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50 dark:border-rose-900 dark:text-rose-200">Delete {selectedArchivedCatalogIds.length} archived</button> : null}<button type="button" onClick={() => setSelectedCatalogIds([])} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">Clear</button></div> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[850px] table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700">
              <tr><th className="w-[4%] px-2 py-3"><input type="checkbox" aria-label="Select all visible physical catalog records" checked={visibleCatalogIds.length > 0 && visibleCatalogIds.every((id) => selectedCatalogIds.includes(id))} onChange={(event) => setSelectedCatalogIds((current) => event.target.checked ? Array.from(new Set([...current, ...visibleCatalogIds])) : current.filter((id) => !visibleCatalogIds.includes(id)))} /></th><th className="w-[32%] px-2 py-3 sm:px-3">Book</th><th className="w-[16%] px-2 py-3 sm:px-3">Copies</th><th className="w-[20%] px-2 py-3 sm:px-3">Shelf location</th><th className="w-[28%] px-2 py-3 sm:px-3">Actions</th></tr>
            </thead>
            <tbody>
              {visibleCatalogRows.map((row) => <Fragment key={row.key}><tr className="border-b border-slate-100 align-top dark:border-slate-800">
                <td className="px-2 py-3"><input type="checkbox" aria-label={`Select ${row.book.title}`} checked={row.bookIds.every((id) => selectedCatalogIds.includes(id))} onChange={(event) => setSelectedCatalogIds((current) => event.target.checked ? Array.from(new Set([...current, ...row.bookIds])) : current.filter((id) => !row.bookIds.includes(id)))} /></td>
                <td className="break-words px-2 py-3 sm:px-3"><strong>{row.book.title}</strong>{row.book.is_archived ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Archived</span> : null}<span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{row.book.author} · {row.book.category}</span><span className="mt-1 block text-xs capitalize text-slate-500">{row.isbnConflict ? 'ISBN needs review · ' : row.book.isbn ? `ISBN ${row.book.isbn} · ` : ''}{row.book.catalog_type}</span></td>
                <td className="px-2 py-3 sm:px-3"><div className="flex items-baseline gap-2"><strong className="text-lg text-emerald-800 dark:text-emerald-300">{row.available}</strong><span className="text-xs text-slate-600 dark:text-slate-400">available</span></div><div className="mt-1 text-xs text-slate-600 dark:text-slate-400"><strong className="text-slate-800 dark:text-slate-200">{row.total}</strong> total <span className="mx-1 text-slate-400">·</span>{row.borrowed} borrowed</div></td>
                <td className="break-words px-2 py-3 text-xs text-slate-600 dark:text-slate-400 sm:px-3">{row.locations || 'Location not set'}</td>
                <td className="physical-catalog-actions px-2 py-3 sm:px-3"><div className="flex flex-wrap gap-2"><button type="button" aria-expanded={expandedCatalogKey === row.key} onClick={() => setExpandedCatalogKey((current) => current === row.key ? null : row.key)} className="whitespace-nowrap rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">{expandedCatalogKey === row.key ? 'Hide copies' : 'View copies'}</button><button type="button" disabled={busy} onClick={() => setManageBook(row.book)} className="whitespace-nowrap rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Manage title</button></div></td>
              </tr>{expandedCatalogKey === row.key ? <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/50"><td colSpan={5} className="px-3 py-3"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{row.copies.map((copy) => <article key={copy.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"><div><strong>{copy.copy_code}</strong><span className="block text-slate-500">{[copy.section, copy.shelf_number && `Shelf ${copy.shelf_number}`, copy.row_number && `Row ${copy.row_number}`, copy.position_number && `Position ${copy.position_number}`, copy.location].filter(Boolean).join(' · ') || 'Location not set'}</span></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">{copy.status}</span></article>)}{row.copies.length === 0 ? <p className="text-xs text-slate-500">No physical copies registered yet.</p> : null}</div></td></tr> : null}</Fragment>)}
            </tbody>
          </table>
          {visibleCatalogRows.length === 0 ? <p className="py-6 text-sm text-slate-500">No physical titles match this search.</p> : null}
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>Showing {visibleCatalogRows.length} of {catalogRows.length} titles</span>
          <div className="flex gap-2"><button type="button" disabled={catalogPage <= 1} onClick={() => setCatalogPage((page) => Math.max(1, page - 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40 dark:border-slate-700">Previous</button><span className="px-2 py-1.5">Page {Math.min(catalogPage, catalogPageCount)} of {catalogPageCount}</span><button type="button" disabled={catalogPage >= catalogPageCount} onClick={() => setCatalogPage((page) => Math.min(catalogPageCount, page + 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40 dark:border-slate-700">Next</button></div>
        </div>
      </section> : null}

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
            {isAdmin ? <button type="button" onClick={() => { const book = manageBook; const prefix = book.title.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part[0]).join('').toUpperCase().slice(0, 12) || 'BOOK'; setManageBook(null); setCopyForm({ bookId: String(book.id), quantity: '1', prefix, location: '' }); setCopyFormOpen(true) }} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">Add copies</button> : null}
            <button type="button" onClick={() => { const book = manageBook; setManageBook(null); openOptionEditor(book.id) }} className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">Loan fees</button>
            <button type="button" onClick={() => { const book = manageBook; setManageBook(null); setEditingBook(book); setEditBookForm({ title: book.title, author: book.author, category: book.category, isbn: book.isbn ?? '', description: book.description ?? '' }) }} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">Edit details</button>
            <button type="button" onClick={() => { const book = manageBook; setManageBook(null); setPendingAction({ type: 'archiveBook', id: book.id, title: book.title, archived: !book.is_archived }) }} className="rounded-xl border border-rose-300 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"><span>{manageBook.is_archived ? 'Restore to catalog' : 'Archive'}</span></button>
            {isAdmin && manageBook.is_archived ? <button type="button" onClick={() => { const book = manageBook; setManageBook(null); setPendingAction({ type: 'deleteBook', id: book.id, title: book.title, archived: true }) }} className="rounded-xl border border-rose-400 px-4 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300">Delete permanently</button> : null}
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

      {openPanel === 'print' ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPanel(null) }}>
        <section className={`${panel} max-h-[90vh] w-full max-w-4xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="print-payments-title">
          <div className="flex items-start justify-between gap-4"><div><h2 id="print-payments-title" className="text-xl font-semibold">Print payments and receipts</h2><p className="mt-1 text-sm text-slate-500">Record a print-service payment for a student or faculty member and issue a receipt.</p></div><button type="button" onClick={() => setOpenPanel(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <form onSubmit={(event) => void issuePrintReceipt(event)} className="mt-5 grid gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700 sm:grid-cols-2">
            <SearchableMemberSelect members={profiles.filter((profile) => profile.role === 'student' || profile.role === 'faculty')} value={printReceiptForm.studentId} onChange={(studentId) => setPrintReceiptForm((current) => ({ ...current, studentId }))} label="Member" placeholder="Search by name or email”¦" />
            <label className="text-sm font-medium">Amount (PHP)<input required type="number" min="0.01" max="100000" step="0.01" value={printReceiptForm.amount} onChange={(event) => setPrintReceiptForm((current) => ({ ...current, amount: event.target.value }))} className={`${input} mt-1`} /></label>
            <label className="text-sm font-medium sm:col-span-2">Description<input required maxLength={240} value={printReceiptForm.description} onChange={(event) => setPrintReceiptForm((current) => ({ ...current, description: event.target.value }))} placeholder="e.g. 20 pages, black and white" className={`${input} mt-1`} /></label>
            <div className="sm:col-span-2"><button type="submit" disabled={busy} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">{busy ? 'Saving”¦' : 'Record payment and issue receipt'}</button></div>
          </form>
          {error ? <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
          {message ? <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">{message}</p> : null}
          <h3 className="mt-6 font-semibold">Recent receipts</h3><div className="mt-3 space-y-2">{printPayments.map((payment) => { const member = profiles.find((profile) => profile.id === payment.student_id); return <article key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><div><strong>{member?.full_name || member?.email || 'Member'}</strong><p className="text-sm text-slate-500">{payment.description}</p><p className="font-mono text-xs text-emerald-700 dark:text-emerald-300">{payment.receipt_number}</p></div><div className="text-right"><strong>PHP {Number(payment.amount).toFixed(2)}</strong><p className="text-xs text-slate-500">{new Date(payment.created_at).toLocaleDateString()}</p></div></article> })}{printPayments.length === 0 ? <p className="text-sm text-slate-500">No print payments recorded yet.</p> : null}</div>
        </section>
      </div> : null}

      {openPanel === 'requests' ? <div className="physical-requests-modal fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setOpenPanel(null); if (!requestsOnly) onClose?.() } }}>
        <section className={`${panel} max-h-[90vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="physical-requests-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="physical-requests-title" className="text-xl font-semibold">Requests and payment verification</h2>
              <p className="mt-1 text-sm text-slate-500">Review pending requests, verify payments, and issue checkout receipts.</p>
            </div>
            <button type="button" onClick={() => { setOpenPanel(null); if (!requestsOnly) onClose?.() }} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close requests</button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Showing {filteredWaitingLoans.length} of {queueLoans.length} pending requests.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Search member, book, or request ID..." aria-label="Search physical requests" className={`${input} sm:min-w-80`} />
              <select value={requestStatus} onChange={(event) => setRequestStatus(event.target.value as RequestQueueFilter)} aria-label="Filter physical requests by operational state" className={input}>
                <option value="all">All pending requests</option><option value="pending">Pending requests</option><option value="awaiting_payment">Awaiting payment</option><option value="ready">Ready for checkout</option><option value="availability_alerts">Availability alerts</option>
              </select>
            </div>
          </div>
        <div className="mt-4 space-y-3">
          {visibleWaitingLoans.map((loan) => <article key={loan.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><strong>{bookName(loan.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(loan.student_id)}</p><p className="mt-1 text-xs text-slate-500">Pending request · {loan.duration_days} days · ₱{Number(loan.fee_amount).toFixed(2)} · {loan.payment_method} · {loan.payment_status.replace('_', ' ')}</p>{loan.transaction_reference ? <p className="mt-1 text-xs text-slate-500">Transaction reference: {loan.transaction_reference}</p> : null}{loan.payment_proof_path ? <button type="button" onClick={() => void openProof(loan.payment_proof_path!)} className="mt-1 text-xs font-semibold text-sky-700 underline dark:text-sky-300">View uploaded payment proof</button> : null}</div>
              <div className="flex flex-wrap gap-2"><button disabled={processingRequestId !== null} type="button" onClick={() => checkout(loan.id)} className="physical-review-action rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50">{processingRequestId === loan.id ? 'Processing...' : 'Review & approve'}</button><button disabled={processingRequestId !== null} type="button" onClick={() => void rejectRequest(loan.id)} className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Reject request</button></div>
            </div>
          </article>)}
          {visibleAvailabilityAlerts.map((entry) => <article key={`availability-alert-${entry.student_id}-${entry.book_id}`} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20"><div className="flex flex-wrap items-start justify-between gap-4"><div><strong>{bookName(entry.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(entry.student_id)}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Availability alert · enabled {new Date(entry.created_at).toLocaleString()}</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">Alerts on</span></div></article>)}
          {filteredWaitingLoans.length === 0 && visibleAvailabilityAlerts.length === 0 ? <p className="text-sm text-slate-500">{queueLoans.length === 0 && availabilityAlerts.length === 0 ? 'No pending physical requests or availability alerts.' : 'No physical requests match the current search or filter.'}</p> : null}
          {filteredWaitingLoans.length > requestPageSize ? <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm"><span className="text-slate-500">Page {Math.min(requestPage, requestPageCount)} of {requestPageCount}</span><div className="flex gap-2"><button type="button" disabled={requestPage <= 1} onClick={() => setRequestPage((page) => Math.max(1, page - 1))} className="rounded-xl border border-slate-300 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Previous</button><button type="button" disabled={requestPage >= requestPageCount} onClick={() => setRequestPage((page) => Math.min(requestPageCount, page + 1))} className="rounded-xl border border-slate-300 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700">Next</button></div></div> : null}
        </div>
        </section>
      </div> : null}

      {openPanel === 'checkedOut' ? <div className="physical-checked-out-modal fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPanel(null) }}>
        <section className={`${panel} max-h-[90vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="checked-out-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="checked-out-title" className="text-xl font-semibold">Checked-out copies</h2>
              <p className="mt-1 text-sm text-slate-500">Inspect and update currently checked-out copies. Use Lost items to review incidents and recovery.</p>
            </div>
            <button type="button" onClick={() => setOpenPanel(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button>
          </div>
        <div className="mt-4 space-y-3">
          {activeLoans.map((loan) => <article key={loan.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div><strong>{bookName(loan.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(loan.student_id)}</p><p className="mt-1 text-xs text-slate-500">{loan.status === 'return_pending' ? 'RETURN REQUEST · AWAITING LIBRARIAN CONFIRMATION · ' : ''}Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'} · Receipt {loan.receipt_number ?? '—'}{loan.due_date && new Date(loan.due_date) < new Date() ? ' · OVERDUE' : ''}</p></div>
            <div className="flex flex-wrap items-end gap-2"><label className="text-xs">Inspection result<select value={returnConditions[loan.id] ?? 'available'} onChange={(event) => setReturnConditions((current) => ({ ...current, [loan.id]: event.target.value as 'available' | 'damaged' | 'lost' }))} className={`${input} mt-1`}><option value="available">Returned · good</option><option value="damaged">Returned · damaged</option><option value="lost">Not returned · lost</option></select></label><button disabled={busy} type="button" onClick={() => void closeLoan(loan.id)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{returnConditions[loan.id] === 'lost' ? 'Assess lost item' : returnConditions[loan.id] === 'damaged' ? 'Inspect damage' : loan.status === 'return_pending' ? 'Confirm good return' : 'Record good return'}</button></div>
          </article>)}
          {activeLoans.length === 0 ? <p className="text-sm text-slate-500">No books are currently checked out.</p> : null}
        </div>
        </section>
      </div> : null}

      {openPanel === 'history' ? <div className="physical-history-modal fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPanel(null) }}>
        <section className={`${panel} max-h-[92vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="circulation-history-catalog-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="circulation-history-catalog-title" className="text-xl font-semibold">Physical loan history</h2><p className="mt-1 text-sm text-slate-500">Completed checkouts, returns, due dates, and copy condition.</p></div><button type="button" onClick={() => setOpenPanel(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
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
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Title<input required maxLength={300} value={editBookForm.title} onChange={(event) => setEditBookForm({ ...editBookForm, title: event.target.value })} className={`${input} mt-1`} /></label><label className="text-sm font-medium">Author<input required maxLength={200} value={editBookForm.author} onChange={(event) => setEditBookForm({ ...editBookForm, author: event.target.value })} className={`${input} mt-1`} /></label><label className="text-sm font-medium">Category<input required maxLength={120} value={editBookForm.category} onChange={(event) => setEditBookForm({ ...editBookForm, category: event.target.value })} className={`${input} mt-1`} /></label><div><label className="text-sm font-medium">ISBN<input maxLength={32} value={editBookForm.isbn} onChange={(event) => setEditBookForm({ ...editBookForm, isbn: event.target.value })} className={`${input} mt-1`} /></label><button type="button" onClick={generateEditBookIsbn} className="mt-2 text-xs font-semibold text-emerald-800 underline dark:text-emerald-300">Generate ISBN-13</button><p className="mt-1 text-[11px] text-slate-500">Internal catalog ID, not a publisher-assigned ISBN.</p></div></div>
          <label className="mt-3 block text-sm font-medium">Description<textarea maxLength={3000} rows={4} value={editBookForm.description} onChange={(event) => setEditBookForm({ ...editBookForm, description: event.target.value })} className={`${input} mt-1`} /></label>
          <button disabled={busy} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Saving...' : 'Save details'}</button>
        </form>
      </div> : null}
      {openPanel === 'lost' ? <div className="physical-lost-modal fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPanel(null) }}>
        <section className={`${panel} max-h-[92vh] w-full max-w-4xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="lost-items-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="lost-items-title" className="text-xl font-semibold">Lost and damage cases</h2></div><button type="button" onClick={() => { setSelectedLostCaseId(null); setOpenPanel(null) }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close cases</button></div>
          <div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-[min(100%,20rem)] flex-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Find a case<input type="search" value={lostSearch} onChange={(event) => setLostSearch(event.target.value)} placeholder="Search borrower, book, copy code, or case ID" className={`${input} mt-1`} /></label><label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Cases<select value={lostCaseView} onChange={(event) => setLostCaseView(event.target.value as typeof lostCaseView)} className={`${input} mt-1`}><option value="open">Open cases ({openIncidentCases.length})</option><option value="solved">Solved cases ({solvedIncidentCases.length})</option><option value="all">All cases ({incidentCases.length})</option></select></label><p className="pb-2 text-xs text-slate-500">Showing {filteredLostLoans.length} {lostCaseView === 'open' ? 'open' : lostCaseView === 'solved' ? 'solved' : 'total'} case{filteredLostLoans.length === 1 ? '' : 's'}</p></div>
          <div className="mt-4">
            <table className="w-full table-fixed text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 uppercase text-slate-500 dark:border-slate-700"><tr><th className="w-[44%] px-2 py-3 sm:px-3">Book / borrower</th><th className="w-[20%] px-2 py-3 sm:px-3">Due</th><th className="w-[36%] px-2 py-3 sm:px-3">Case</th></tr></thead>
              <tbody>{visibleLostLoans.map((loan) => {
                const caseFines = physicalFines.filter((fine) => fine.physical_book_request_id === loan.id)
                const replacementFine = caseFines.find((fine) => fine.fine_type === 'lost_item')
                const solved = loan.incident_status === 'resolved' || loan.incident_status === 'withdrawn'
                return <tr key={loan.id} className={solved ? 'border-b border-emerald-200 bg-emerald-50 align-top dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-b border-rose-100 align-top dark:border-rose-900/60'}>
                  <td className="break-words px-2 py-3 sm:px-3"><strong className="block">{bookName(loan.book_id)}</strong><span className="block text-slate-600 dark:text-slate-400">{memberName(loan.student_id)}</span><span className="block text-slate-500">{copyCode(loan.copy_id)} · Case #{loan.id}</span></td>
                  <td className="break-words px-2 py-3 sm:px-3">{loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</td>
                  <td className="px-2 py-3 sm:px-3"><div className="flex flex-col items-start gap-2"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${solved ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200'}`}>{solved ? loan.incident_status === 'withdrawn' ? 'Closed unresolved' : 'Solved' : loan.incident_type === 'damage' ? 'Damage review' : replacementFine ? `Replacement ${replacementFine.status.replace(/_/g, ' ')}` : 'Replacement review'}</span>{caseFines.some((fine) => fine.fine_type === 'late_fee' && fine.status === 'unpaid') ? <span className="text-[11px] text-rose-700 dark:text-rose-300">Late fee unpaid</span> : null}<button type="button" onClick={() => resolveLostLoan(loan.id)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950">{solved ? 'View case' : loan.incident_type === 'damage' ? 'Review damage' : replacementFine?.status === 'paid' ? 'Finish recovery' : 'Resolve case'}</button></div></td>
                </tr>
              })}</tbody>
            </table>
            {filteredLostLoans.length === 0 ? <p className="py-6 text-sm text-slate-500">{incidentCases.length === 0 ? 'No lost or damage cases have been recorded.' : lostCaseView === 'solved' ? 'No solved cases match that search.' : lostCaseView === 'open' ? 'No open cases match that search.' : 'No cases match that search.'}</p> : null}
            {filteredLostLoans.length > lostPageSize ? <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"><span>Page {Math.min(lostPage, lostPageCount)} of {lostPageCount}</span><div className="flex gap-2"><button type="button" disabled={lostPage <= 1} onClick={() => setLostPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-40 dark:border-slate-700">Previous</button><button type="button" disabled={lostPage >= lostPageCount} onClick={() => setLostPage((page) => Math.min(lostPageCount, page + 1))} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-40 dark:border-slate-700">Next</button></div></div> : null}
          </div>
        </section>
        {selectedLostCaseId !== null && selectedLostLoan ? (() => {
          const caseFines = physicalFines.filter((fine) => fine.physical_book_request_id === selectedLostCaseId)
          const incidentFine = caseFines.find((fine) => fine.fine_type === (selectedLostLoan.incident_type === 'damage' ? 'damage' : 'lost_item'))
          const hasUnpaidLateFee = caseFines.some((fine) => fine.fine_type === 'late_fee' && fine.status === 'unpaid')
          const hasIncidentAssessment = selectedLostLoan.incident_assessed_at !== null || incidentFine !== undefined
          const isSolvedCase = selectedLostLoan.incident_status === 'resolved' || selectedLostLoan.incident_status === 'withdrawn'
          const isDamageCase = selectedLostLoan.incident_type === 'damage'
          const condition = lostResolution[selectedLostCaseId] ?? 'available'
          const fineDraft = lostFineDrafts[selectedLostCaseId] ?? { amount: '', reason: '' }
          const recoveryDraft = recoveryDamageDrafts[selectedLostCaseId] ?? { amount: '', reason: '' }
          return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/65 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelectedLostCaseId(null) }}>
            <section className={`${panel} max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="lost-case-resolution-title">
              <div className="flex items-start justify-between gap-4"><div><h3 id="lost-case-resolution-title" className="text-lg font-semibold">{isSolvedCase ? 'Solved physical case' : isDamageCase ? 'Review damage case' : 'Resolve lost-item case'}</h3><p className="mt-1 text-sm text-slate-500">{bookName(selectedLostLoan.book_id)} · {copyCode(selectedLostLoan.copy_id)} · Case #{selectedLostLoan.id}</p></div><button type="button" disabled={busy} onClick={() => setSelectedLostCaseId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">Close</button></div>
              <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800 sm:grid-cols-2"><p><span className="block text-xs text-slate-500">Borrower</span><strong>{memberName(selectedLostLoan.student_id)}</strong></p><p><span className="block text-xs text-slate-500">Due date</span><strong>{selectedLostLoan.due_date ? new Date(selectedLostLoan.due_date).toLocaleDateString() : '—'}</strong></p><p className="sm:col-span-2"><span className="block text-xs text-slate-500">Inspection notes</span>{selectedLostLoan.incident_note || 'No notes recorded.'}</p></div>
              {isSolvedCase ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-sm font-semibold">{selectedLostLoan.incident_status === 'withdrawn' ? 'Case closed unresolved' : 'Case resolved'}</p><p className="mt-1 text-sm">{selectedLostLoan.incident_resolved_at ? new Date(selectedLostLoan.incident_resolved_at).toLocaleString() : 'Resolution recorded'}{selectedLostLoan.incident_resolved_by ? ` by ${memberName(selectedLostLoan.incident_resolved_by)}` : ''}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{selectedLostLoan.incident_note || 'No case notes recorded.'}</p>{incidentFine ? <p className="mt-2 text-sm">{fineTypeLabel(incidentFine.fine_type)}: PHP {Number(incidentFine.amount).toFixed(2)} - {incidentFine.status.replace(/_/g, ' ')}{incidentFine.receipt_number ? ` - Receipt ${incidentFine.receipt_number}` : ''}</p> : null}</div> : isDamageCase ? <div className="rounded-xl border border-amber-200 p-3 dark:border-amber-900"><p className="text-sm font-semibold">Damage assessment</p>{hasIncidentAssessment ? <><p className="mt-2 text-sm">Assessed: PHP {Number(incidentFine?.amount ?? selectedLostLoan.incident_assessed_amount ?? 0).toFixed(2)} · {Number(incidentFine?.amount ?? selectedLostLoan.incident_assessed_amount ?? 0) === 0 ? 'No charge' : incidentFine?.status ?? 'Charge recorded'}</p>{incidentFine?.status === 'paid' ? <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">The damage charge is paid. Record the repair or withdrawal decision to close the case.</p> : null}<label className="mt-3 block text-sm font-medium">Copy disposition<select value={condition} onChange={(event) => setLostResolution((current) => ({ ...current, [selectedLostCaseId]: event.target.value as 'available' | 'damaged' | 'withdrawn' }))} className={`${input} mt-1`}><option value="available">Repaired · return to circulation</option><option value="damaged">Still damaged · keep unavailable</option><option value="withdrawn">Withdraw from collection</option></select></label><label className="mt-3 block text-sm font-medium">Repair / disposition note<textarea maxLength={500} rows={2} value={recoveryDraft.reason} onChange={(event) => setRecoveryDamageDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...recoveryDraft, reason: event.target.value } }))} placeholder="Describe repairs or withdrawal reason" className={`${input} mt-1`} /></label><button type="button" disabled={busy || !recoveryDraft.reason.trim()} onClick={() => void resolveDamageCase(selectedLostCaseId)} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Save disposition</button></> : <div className="mt-3 grid gap-3"><label className="text-sm font-medium">Charge (PHP)<input type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={fineDraft.amount} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...fineDraft, amount: event.target.value } }))} placeholder="0 if no charge" className={`${input} mt-1`} /></label><label className="text-sm font-medium">Decision and reason<textarea maxLength={500} rows={3} value={fineDraft.reason} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...fineDraft, reason: event.target.value } }))} placeholder="Describe the assessment or why no charge applies" className={`${input} mt-1`} /></label><button type="button" disabled={busy || !fineDraft.amount.trim() || !fineDraft.reason.trim()} onClick={() => void assessPhysicalIncident(selectedLostCaseId)} className="justify-self-start rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Save assessment</button></div>}{incidentFine?.receipt_number ? <p className="mt-2 font-mono text-xs">Receipt {incidentFine.receipt_number}</p> : null}</div> : <>
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-sm font-semibold">Replacement assessment</p>{incidentFine ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">₱{Number(incidentFine.amount).toFixed(2)} · {incidentFine.status.replace(/_/g, ' ')}{incidentFine.receipt_number ? ` · Receipt ${incidentFine.receipt_number}` : ''}</p> : selectedLostLoan.incident_assessed_at ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Reviewed with no replacement charge.</p> : <p className="mt-1 text-xs text-slate-500">No decision recorded. Late fees remain separate.</p>}{hasUnpaidLateFee ? <p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300">A separate late fee is still unpaid.</p> : null}{incidentFine?.status === 'paid' ? <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">The charge is paid. This case still needs a {isDamageCase ? 'repair or withdrawal decision' : 'recovery or closure decision'}.</p> : null}{incidentFine && (onOpenFines || requestsOnly) ? <button type="button" onClick={() => { if (requestsOnly) { setSelectedLostCaseId(null); setOpenPanel(null); window.setTimeout(() => document.getElementById('physical-transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0) } else onOpenFines?.() }} className="mt-2 text-xs font-semibold text-emerald-800 underline dark:text-emerald-300">Open transactions and receipts</button> : null}
                  {!hasIncidentAssessment ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Amount (₱)<input type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={fineDraft.amount} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...fineDraft, amount: event.target.value } }))} placeholder="0 if no charge" className={`${input} mt-1`} /></label><label className="text-sm font-medium sm:col-span-2">Assessment reason<textarea maxLength={500} rows={2} value={fineDraft.reason} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...fineDraft, reason: event.target.value } }))} placeholder="Why is a replacement charge assessed, or why is no charge needed?" className={`${input} mt-1`} /></label><button type="button" disabled={busy || !fineDraft.amount.trim() || !fineDraft.reason.trim()} onClick={() => void assessPhysicalIncident(selectedLostCaseId)} className="justify-self-start rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50 dark:border-rose-900 dark:text-rose-200">Save assessment</button></div> : null}
                </div>
                <label className="block text-sm font-medium">Recovery outcome<select value={condition} onChange={(event) => setLostResolution((current) => ({ ...current, [selectedLostCaseId]: event.target.value as 'available' | 'damaged' | 'withdrawn' }))} className={`${input} mt-1`}><option value="available">Recovered · good condition</option><option value="damaged">Recovered · damaged</option><option value="withdrawn">Close unresolved · copy remains withdrawn</option></select></label>
                {condition === 'damaged' ? <label className="block text-sm font-medium">Recovery inspection note<textarea maxLength={500} rows={2} value={recoveryDraft.reason} onChange={(event) => setRecoveryDamageDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...recoveryDraft, amount: '0', reason: event.target.value } }))} placeholder="Describe the copy condition" className={`${input} mt-1`} /></label> : null}
                <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => setSelectedLostCaseId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">Cancel</button><button type="button" disabled={busy || (condition === 'damaged' && !recoveryDraft.reason.trim())} onClick={() => void executeResolveLostLoan(selectedLostCaseId)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{condition === 'withdrawn' ? 'Close unresolved case' : 'Confirm recovery'}</button></div>
              </>}
              {isSolvedCase ? null : isDamageCase ? <div className="flex justify-end"><button type="button" onClick={() => setSelectedLostCaseId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Done</button></div> : null}
            </section>
          </div>
        })() : null}
      </div> : null}
    </div>
    <ActionModal
        open={lostFineLoanId !== null}
        title="Record damaged return"
        description={lostFineLoanId !== null ? returnConditions[lostFineLoanId] === 'damaged'
          ? `${bookName(loans.find((loan) => loan.id === lostFineLoanId)?.book_id ?? 0)} will be returned to inventory as damaged. No standard damage fee is configured; enter the staff-assessed amount and inspection note, or enter 0 if no charge applies.`
          : `${bookName(loans.find((loan) => loan.id === lostFineLoanId)?.book_id ?? 0)} will be marked lost. ` : undefined}
        confirmLabel="Save inspection"
        busy={busy}
        confirmDisabled={lostFineLoanId !== null && !lostFineDrafts[lostFineLoanId]?.reason.trim()}
        onClose={() => { if (lostFineLoanId !== null) setReturnConditions((current) => ({ ...current, [lostFineLoanId]: 'available' })); setLostFineLoanId(null) }}
        onConfirm={() => { if (lostFineLoanId !== null) void executeCloseLoan(lostFineLoanId) }}
      >
        {lostFineLoanId !== null ? <div className="grid gap-3">
          <p className="text-sm font-medium">Borrower: {memberName(loans.find((loan) => loan.id === lostFineLoanId)?.student_id ?? '')}</p>
          <label className="text-sm font-medium">Inspection note<textarea required maxLength={500} rows={3} value={lostFineDrafts[lostFineLoanId]?.reason ?? ''} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [lostFineLoanId]: { ...(current[lostFineLoanId] ?? { amount: '', reason: '' }), reason: event.target.value } }))} placeholder="Describe the damage and repair needed" className={`${input} mt-1`} /></label>
        </div> : null}
      </ActionModal>
    <ActionModal
      open={checkoutLoan !== null}
      title="Review physical-book request"
      description="Verify the payment, assign the next available copy, and issue the borrower”™s receipt. Pending requests do not reserve a copy."
      confirmLabel="Verify payment & issue receipt"
      busy={checkoutLoan !== null && processingRequestId === checkoutLoan.id}
      onClose={() => setCheckoutLoan(null)}
      onConfirm={() => {
        if (!checkoutLoan) return
        const loanId = checkoutLoan.id
        const configuredAmount = Number(checkoutLoan.fee_amount)
        setCheckoutLoan(null)
        void executeCheckout(loanId, configuredAmount, checkoutNotes)
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
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Configured amount (₱)
            <input readOnly aria-readonly="true" value={Number(checkoutLoan.fee_amount).toFixed(2)} className={`${input} mt-1 cursor-not-allowed bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`} />
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
        title={pendingAction?.type === 'archiveMany' ? `Archive ${pendingAction.ids.length} catalog records?` : pendingAction?.type === 'deleteMany' ? `Delete ${pendingAction.ids.length} archived records?` : pendingAction?.type === 'checkout' ? 'Confirm physical checkout?' : pendingAction?.type === 'close' ? returnConditions[pendingAction.id] === 'lost' ? 'Open lost-item case?' : confirmingReturnRequest ? 'Confirm requested return?' : 'Record physical-book return?' : pendingAction?.type === 'reject' ? 'Reject physical-book request?' : pendingAction?.type === 'archiveBook' ? pendingAction.archived ? 'Archive this book?' : 'Restore this book?' : pendingAction?.type === 'deleteBook' ? 'Permanently delete this archived title?' : 'Resolve lost-book hold?'}
        description={pendingAction?.type === 'archiveMany' ? 'These titles will be hidden from members. Existing copies and circulation records remain available.' : pendingAction?.type === 'deleteMany' ? 'Deletion is permanent. The database will keep any selected record with loans, payments, member activity, or attached files and report why it could not be removed.' : pendingAction?.type === 'close' ? `${confirmingReturnRequest ? 'The borrower return request will be completed. ' : ''}The selected condition (${returnConditions[pendingAction.id] ?? 'available'}) will be recorded.` : pendingAction?.type === 'archiveBook' ? pendingAction.archived ? `This title will be hidden from members. Loan history and existing records will be preserved.` : `This title will become available in the active catalog again.` : pendingAction?.type === 'deleteBook' ? `This is permanent. Deletion is allowed only when the database finds no loan, payment, member activity, or attached file.` : undefined}
        confirmLabel={pendingAction?.type === 'archiveMany' ? 'Archive selected' : pendingAction?.type === 'deleteMany' ? 'Delete eligible titles' : pendingAction?.type === 'checkout' ? 'Confirm checkout' : pendingAction?.type === 'close' ? returnConditions[pendingAction.id] === 'lost' ? 'Mark lost' : confirmingReturnRequest ? 'Confirm return' : 'Record return' : pendingAction?.type === 'reject' ? 'Reject request' : pendingAction?.type === 'archiveBook' ? pendingAction.archived ? 'Archive book' : 'Restore book' : pendingAction?.type === 'deleteBook' ? 'Permanently delete' : 'Resolve hold'}
        confirmDisabled={pendingAction?.type === 'close' && returnConditions[pendingAction.id] === 'lost' && !lostFineDrafts[pendingAction.id]?.reason.trim()}
        tone={pendingAction?.type === 'archiveMany' || pendingAction?.type === 'checkout' || pendingAction?.type === 'close' || (pendingAction?.type === 'archiveBook' && !pendingAction.archived) ? 'default' : 'danger'}
        busy={pendingAction?.type === 'archiveBook' || pendingAction?.type === 'deleteBook' || pendingAction?.type === 'archiveMany' || pendingAction?.type === 'deleteMany' ? busy : pendingAction !== null && (pendingAction.type === 'close' || pendingAction.type === 'checkout' || pendingAction.type === 'reject') && processingRequestId === pendingAction.id}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction
          setPendingAction(null)
          if (action?.type === 'archiveBook') void setBookArchived(action.id, action.title, action.archived)
          else if (action?.type === 'deleteBook') void permanentlyDeleteBook(action.id, action.title)
          else if (action?.type === 'archiveMany') void archiveCatalogSelection(action.ids)
          else if (action?.type === 'deleteMany') void deleteCatalogSelection(action.ids)
          else if (action?.type === 'checkout') void executeCheckout(action.id)
          else if (action?.type === 'close') void executeCloseLoan(action.id)
          else if (action?.type === 'reject') void executeRejectRequest(action.id)
        }}
      >
        {pendingAction?.type === 'close' && returnConditions[pendingAction.id] === 'lost' ? <label className="mt-4 block text-sm font-medium">Inspection note
          <textarea required maxLength={500} rows={3} value={lostFineDrafts[pendingAction.id]?.reason ?? ''} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [pendingAction.id]: { ...(current[pendingAction.id] ?? { amount: '', reason: '' }), reason: event.target.value } }))} placeholder="Describe how the item was reported lost" className={`${input} mt-1`} />
        </label> : null}
      </ActionModal>
    <ActionModal
      open={fineWaiver !== null}
      title="Waive physical fine?"
      description={fineWaiver ? `Waive ₱${Number(physicalFines.find((fine) => fine.id === fineWaiver.id)?.amount ?? 0).toFixed(2)} for ${memberName(physicalFines.find((fine) => fine.id === fineWaiver.id)?.student_id ?? '')}. The reason is saved to the member record and audit history.` : undefined}
      confirmLabel="Record waiver"
      confirmDisabled={!fineWaiver?.reason.trim() || fineWaiver.reason.trim().length > 500}
      busy={busy}
      onClose={() => setFineWaiver(null)}
      onConfirm={() => void waivePhysicalFine()}
    >
      {fineWaiver ? <label className="block text-sm font-medium">Waiver reason<textarea required minLength={1} maxLength={500} rows={3} value={fineWaiver.reason} onChange={(event) => setFineWaiver((current) => current ? { ...current, reason: event.target.value } : null)} placeholder="Explain the review decision or correction" className={`${input} mt-1`} /></label> : null}
    </ActionModal>
    <ActionModal
      open={finePaymentConfirmation !== null}
      title="Record cashier payment?"
      description={finePaymentConfirmation ? `Confirm the cashier received ₱${Number(finePaymentConfirmation.amount).toFixed(2)} for ${fineTypeLabel(finePaymentConfirmation.fine_type)}. This records the payment and issues a receipt to the member.` : undefined}
      confirmLabel="Confirm payment received"
      busy={busy}
      onClose={() => setFinePaymentConfirmation(null)}
      onConfirm={() => void recordFinePayment()}
    />
    <ActionModal
      open={fineRefundConfirmation !== null}
      title="Confirm cashier refund?"
      description={fineRefundConfirmation ? `Record the PHP ${Number(fineRefundConfirmation.fine.amount).toFixed(2)} replacement refund for ${memberName(fineRefundConfirmation.fine.student_id)} after the cashier has returned the funds. The original payment receipt remains in transaction history.` : undefined}
      confirmLabel="Record refund issued"
      confirmDisabled={!fineRefundConfirmation?.reason.trim() || (fineRefundConfirmation?.reason.trim().length ?? 0) > 500}
      busy={busy}
      onClose={() => setFineRefundConfirmation(null)}
      onConfirm={() => void recordFineRefund()}
    >
      {fineRefundConfirmation ? <label className="block text-sm font-medium">Cashier refund note<textarea required maxLength={500} rows={3} value={fineRefundConfirmation.reason} onChange={(event) => setFineRefundConfirmation((current) => current ? { ...current, reason: event.target.value } : null)} placeholder="Record how and when the refund was issued" className={`${input} mt-1`} /></label> : null}
    </ActionModal>
    {financeReceipt ? (() => {
      const receiptNumber = financeReceipt.kind === 'fine' ? financeReceipt.fine.receipt_number : financeReceipt.kind === 'checkout' ? financeReceipt.loan.receipt_number : financeReceipt.payment.receipt_number
      const title = financeReceipt.kind === 'fine' ? fineTypeLabel(financeReceipt.fine.fine_type) : financeReceipt.kind === 'checkout' ? 'Physical book checkout' : 'Print service'
      const amount = financeReceipt.kind === 'fine' ? Number(financeReceipt.fine.amount) : financeReceipt.kind === 'checkout' ? Number(financeReceipt.loan.fee_amount) : Number(financeReceipt.payment.amount)
      const memberId = financeReceipt.kind === 'fine' ? financeReceipt.fine.student_id : financeReceipt.kind === 'checkout' ? financeReceipt.loan.student_id : financeReceipt.payment.student_id
      const description = financeReceipt.kind === 'fine'
        ? `${bookName(loans.find((loan) => loan.id === financeReceipt.fine.physical_book_request_id)?.book_id ?? 0)} · Case #${financeReceipt.fine.physical_book_request_id}${financeReceipt.fine.fine_reason ? ` · ${financeReceipt.fine.fine_reason}` : ''}`
        : financeReceipt.kind === 'checkout'
          ? `${bookName(financeReceipt.loan.book_id)} · ${copyCode(financeReceipt.loan.copy_id)} · ${financeReceipt.loan.duration_days} days`
          : financeReceipt.payment.description
      const date = financeReceipt.kind === 'fine' ? financeReceipt.fine.paid_at ?? financeReceipt.fine.created_at : financeReceipt.kind === 'checkout' ? financeReceipt.loan.checked_out_at : financeReceipt.payment.created_at
      return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFinanceReceipt(null) }}><section className="physical-finance-receipt w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="finance-receipt-title"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Smart Lib · Official receipt</p><h2 id="finance-receipt-title" className="mt-1 text-xl font-semibold">{title}</h2></div><button type="button" data-print-hide onClick={() => setFinanceReceipt(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Close</button></div><p className="mt-5 border-y border-dashed border-slate-300 py-3 font-mono text-sm">Receipt {receiptNumber ?? 'Unavailable'}</p><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-slate-500">Received from</dt><dd className="font-medium">{memberName(memberId)}</dd></div><div><dt className="text-xs text-slate-500">Details</dt><dd>{description}</dd></div><div><dt className="text-xs text-slate-500">Date</dt><dd>{new Date(date).toLocaleString()}</dd></div><div><dt className="text-xs text-slate-500">Amount</dt><dd className="text-lg font-semibold">PHP {amount.toFixed(2)}</dd></div>{financeReceipt.kind === 'fine' ? <div><dt className="text-xs text-slate-500">Payment status</dt><dd className="capitalize">{financeReceipt.fine.status}</dd></div> : financeReceipt.kind === 'checkout' ? <div><dt className="text-xs text-slate-500">Payment</dt><dd className="capitalize">{financeReceipt.loan.payment_method} · {financeReceipt.loan.payment_status}</dd></div> : null}</dl><p className="mt-6 text-xs text-slate-500">Keep this receipt for your records.</p><div data-print-hide className="mt-5 flex justify-end"><button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-700">Print receipt</button></div></section></div>
    })() : null}
    {!requestsOnly && !overviewOnly && !catalogOnly && !policyOnly && !finesOnly ? <BookAssistant /> : null}
  </main>
}
