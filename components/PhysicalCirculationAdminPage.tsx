'use client'

import { ChangeEvent, FormEvent, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { getSupabase } from '@/utils/supabase/client'
import { AdminPhysicalSkeleton } from '@/components/skeletons/AdminDashboardSkeleton'
import BrandLogo from '@/components/BrandLogo'
import ThemeToggle from '@/components/ThemeToggle'
import ResultModal from '@/components/ResultModal'
import ActionModal from '@/components/ActionModal'
import BaseModal from '@/components/BaseModal'
import BookAssistant from '@/components/BookAssistant'
import SearchableMemberSelect from '@/components/SearchableMemberSelect'
import StaffMemberEnrollmentModal from '@/components/StaffMemberEnrollmentModal'
import StaffCashPointTopUpModal from '@/components/StaffCashPointTopUpModal'
import { LibrarianDailyRecord, LibrarianShiftCloseout, LibrarianWorkQueue } from '@/components/LibrarianDeskReports'
import { generateCatalogIsbn } from '@/utils/isbn'
import { PHYSICAL_LOAN_DURATION_OPTIONS } from '@/utils/libraryContracts'
import { isAdminRole, isStaffRole } from '@/utils/roles'

type Book = { id: number; title: string; author: string; category: string; discipline?: string | null; genre?: string | null; isbn: string | null; description?: string | null; catalog_type: string; cover_image_url: string | null; is_archived: boolean }
type Copy = { id: number; book_id: number; copy_code: string; qr_token: string; status: string; location: string | null; section: string | null; shelf_number: string | null; row_number: string | null; position_number: string | null }
type Option = { id: number; book_id: number; duration_days: number; fee_amount: number; is_active: boolean }
type Loan = {
  id: number; student_id: string; book_id: number; copy_id: number | null; duration_days: number
  fee_amount: number; payment_method: string; payment_status: string; transaction_reference: string | null
  status: string; requested_at: string; checked_out_at: string | null
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
type Profile = {
  id: string; email: string; full_name: string | null; role: string
  institutional_id?: string | null; student_photo_path?: string | null
  username?: string | null; department?: string | null
  course?: string | null; student_year?: string | null; created_at?: string | null
}
type MemberActivityEvent = {
  id: number; occurred_at: string; event_type: string; summary: string
  actor_role: string; receipt_number: string | null; related_request_type: string | null
  related_request_id: number | null
}
type PrintPayment = { id: number; student_id: string; amount: number; description: string; receipt_number: string; created_at: string }
type PointTopUp = { id: number; member_id: string; bundle_points: number; amount_paid: number; receipt_number: string; created_at: string }
type PhysicalRenewal = { id: number; request_id: number; student_id: string; copy_id: number; duration_days: number; previous_due_date: string; new_due_date: string; fee_amount: number; amount_received: number; receipt_number: string; created_at: string }
type RenewalDraft = { loanId: number; durationDays: number; amountPaid: string; notes: string }
type AvailabilityAlertEntry = { student_id: string; book_id: number; created_at: string }
type PhysicalFine = { id: number; physical_book_request_id: number; student_id: string; amount: number; status: string; fine_type: 'late_fee' | 'lost_item' | 'damage' | 'other'; created_at: string; paid_at?: string | null; waived_at?: string | null; refunded_at?: string | null; refund_due_at?: string | null; refund_reason?: string | null; fine_reason?: string | null; waiver_reason?: string | null; receipt_number?: string | null }
type FinanceReceipt = { kind: 'fine'; fine: PhysicalFine } | { kind: 'checkout'; loan: LoanHistory } | { kind: 'renewal'; renewal: PhysicalRenewal } | { kind: 'print'; payment: PrintPayment } | { kind: 'topup'; topup: PointTopUp }
type LibraryHoliday = { holiday_date: string; name: string; source: 'manual' | 'nager'; provider_synced_at: string | null }
type LibraryPolicySettings = {
  id: number
  fine_grace_days: number
  late_fee_per_day: number
  late_fee_cap: number
  lost_after_days: number
  faculty_lesson_reward_points: number
  policy_notice: string
  updated_at: string
}
type RequestQueueFilter = 'all' | 'cash_requests' | 'legacy_online' | 'availability_alerts'

const panel = 'rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900'
const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950'
const outcomeOptions = [
  { value: 'available', title: 'Good condition', description: 'Close the loan and return the copy to circulation.' },
  { value: 'damaged', title: 'Damaged', description: 'Close the loan and keep the copy unavailable for assessment.' },
  { value: 'lost', title: 'Not returned · lost', description: 'Open a lost-item case and record a replacement assessment.' },
] as const
const lostRecoveryOptions = [
  { value: 'available', title: 'Recovered · good condition', description: 'The physical copy was returned. Put it back into circulation.' },
  { value: 'damaged', title: 'Recovered · damaged', description: 'The copy was returned but must stay unavailable for damage review.' },
  { value: 'withdrawn', title: 'Not recovered · close unresolved', description: 'The copy remains withdrawn; replacement and late charges remain due.' },
] as const
const normalizeInstitutionalIdInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 9)
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits
}
const normalizeDeskSearch = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
const isNameSubsequence = (query: string, value: string) => {
  let queryIndex = 0
  for (const character of value) {
    if (character === query[queryIndex]) queryIndex += 1
    if (queryIndex === query.length) return true
  }
  return false
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
const fineTypeLabel = (type: PhysicalFine['fine_type']) => type === 'late_fee' ? 'Late return' : type === 'lost_item' ? 'Lost item' : type === 'damage' ? 'Damage assessment' : 'Other charge'
const titleGroupKey = (book: Pick<Book, 'title' | 'author' | 'category'>) =>
  [book.title, book.author, book.category].map((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()).join('|')
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const transactionDateKey = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : localDateKey(date)
}

function WorkflowChoice({ selected, title, description, onSelect }: { selected: boolean; title: string; description: string; onSelect: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onSelect} className={`w-full rounded-xl border p-3 text-left transition-colors ${selected ? 'border-sky-600 bg-sky-50 ring-2 ring-sky-600/20 dark:border-sky-400 dark:bg-sky-950/40 dark:ring-sky-400/20' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500'}`}>
    <span className="block text-sm font-semibold">{title}</span>
    <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">{description}</span>
  </button>
}

type CirculationPanel = 'requests' | 'checkedOut' | 'history' | 'lost' | 'print' | 'addBook'
type CirculationActionRequest = { panel: CirculationPanel; token: number; caseId?: number; requestId?: number } | null

function MemberDeskSurface({ asModal, open, onClose, title, description, children }: { asModal: boolean; open: boolean; onClose: () => void; title: string; description: string; children: ReactNode }) {
  if (!asModal) return children
  return <BaseModal open={open} title={title} description={description} onClose={onClose} size="lg" layer="background">{children}</BaseModal>
}

export default function PhysicalCirculationAdminPage({ initialPanel, requestsOnly = false, overviewOnly = false, catalogOnly = false, policyOnly = false, finesOnly = false, librarianWorkspaceOnly = false, requestedPanel = null, active = true, onClose, onOpenLostCase, onOpenFines }: { initialPanel?: CirculationPanel; requestsOnly?: boolean; overviewOnly?: boolean; catalogOnly?: boolean; policyOnly?: boolean; finesOnly?: boolean; librarianWorkspaceOnly?: boolean; requestedPanel?: CirculationActionRequest; active?: boolean; onClose?: () => void; onOpenLostCase?: (caseId: number) => void; onOpenFines?: () => void }) {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [librarianSidebarOpen, setLibrarianSidebarOpen] = useState(false)
  const [librarianSidebarCollapsed, setLibrarianSidebarCollapsed] = useState(false)
  const [memberDeskOpen, setMemberDeskOpen] = useState(false)
  const [memberEnrollmentOpen, setMemberEnrollmentOpen] = useState(false)
  const [topUpMember, setTopUpMember] = useState<Profile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [copies, setCopies] = useState<Copy[]>([])
  const [options, setOptions] = useState<Option[]>([])
  const [loans, setLoans] = useState<Loan[]>([])
  const [loanHistory, setLoanHistory] = useState<LoanHistory[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [deskMemberQuery, setDeskMemberQuery] = useState('')
  const [deskMemberId, setDeskMemberId] = useState('')
  const [memberProfileTab, setMemberProfileTab] = useState<'overview' | 'borrowing' | 'charges' | 'activity'>('overview')
  const [memberActivity, setMemberActivity] = useState<MemberActivityEvent[]>([])
  const [memberActivityLoading, setMemberActivityLoading] = useState(false)
  const [memberActivityError, setMemberActivityError] = useState('')
  const [deskSuggestionIndex, setDeskSuggestionIndex] = useState(0)
  const [deskIdCardPresented, setDeskIdCardPresented] = useState(false)
  const [deskCopyQuery, setDeskCopyQuery] = useState('')
  const [deskIssueDurationDays, setDeskIssueDurationDays] = useState('14')
  const [deskSelectedReturnIds, setDeskSelectedReturnIds] = useState<number[]>([])
  const [deskReturnsProcessing, setDeskReturnsProcessing] = useState(false)
  const [deskPhotoUploading, setDeskPhotoUploading] = useState(false)
  const deskSearchRef = useRef<HTMLInputElement>(null)
  const [availabilityAlerts, setAvailabilityAlerts] = useState<AvailabilityAlertEntry[]>([])
  const [physicalFines, setPhysicalFines] = useState<PhysicalFine[]>([])
  const [printPayments, setPrintPayments] = useState<PrintPayment[]>([])
  const [pointTopUps, setPointTopUps] = useState<PointTopUp[]>([])
  const [printReceiptForm, setPrintReceiptForm] = useState({ studentId: '', amount: '', description: '' })
  const [holidays, setHolidays] = useState<LibraryHoliday[]>([])
  const [holidayYear, setHolidayYear] = useState(String(new Date().getFullYear() + 1))
  const [holidayPreview, setHolidayPreview] = useState<{ year: number; holidays: LibraryHoliday[] } | null>(null)
  const [qrImages, setQrImages] = useState<Record<string, string>>({})
  const [copyForm, setCopyForm] = useState({ bookId: '', quantity: '1', prefix: '', location: '' })
  const [newPhysicalBook, setNewPhysicalBook] = useState({
    title: '', author: '', category: '', genre: '', isbn: '', description: '', quantity: '1', prefix: '', location: '', coverImageUrl: '',
  })
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [optionForm, setOptionForm] = useState({ bookId: '', fees: Object.fromEntries(PHYSICAL_LOAN_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string> })
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' })
  const [policySettings, setPolicySettings] = useState<LibraryPolicySettings | null>(null)
  const [policyDraft, setPolicyDraft] = useState({ fineGraceDays: '2', lateFeePerDay: '5', lateFeeCap: '500', lostAfterDays: '30', facultyLessonRewardPoints: '25', policyNotice: '' })
  const [returnConditions, setReturnConditions] = useState<Record<number, 'available' | 'damaged' | 'lost'>>({})
  const [selectedLostCaseId, setSelectedLostCaseId] = useState<number | null>(null)
  const [lostResolution, setLostResolution] = useState<Record<number, '' | 'available' | 'damaged' | 'withdrawn'>>({})
  const [lostSearch, setLostSearch] = useState('')
  const [lostCaseView, setLostCaseView] = useState<'open' | 'solved' | 'all'>('open')
  const [lostPage, setLostPage] = useState(1)
  const [recoveryDamageDrafts, setRecoveryDamageDrafts] = useState<Record<number, { amount: string; reason: string }>>({})
  const [historySearch, setHistorySearch] = useState('')
  const [historyDetailBookId, setHistoryDetailBookId] = useState<number | null>(null)
  const [expandedCatalogKey, setExpandedCatalogKey] = useState<string | null>(null)
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [fineWaiver, setFineWaiver] = useState<{ id: number; reasonCategory: string; justification: string } | null>(null)
  const [finePaymentConfirmation, setFinePaymentConfirmation] = useState<PhysicalFine | null>(null)
  const [finePaymentReceived, setFinePaymentReceived] = useState(false)
  const [fineRefundConfirmation, setFineRefundConfirmation] = useState<{ fine: PhysicalFine; reason: string } | null>(null)
  const [fineSearch, setFineSearch] = useState('')
  const [fineStatusFilter, setFineStatusFilter] = useState<'all' | 'needs_action' | 'pending' | 'pending_verification' | 'unpaid' | 'paid' | 'waived' | 'refund_due' | 'refunded'>('all')
  const [fineDateFrom, setFineDateFrom] = useState('')
  const [fineDateTo, setFineDateTo] = useState('')
  const [financeSort, setFinanceSort] = useState<{ key: 'date' | 'amount'; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' })
  const [financeReceipt, setFinanceReceipt] = useState<FinanceReceipt | null>(null)
  const [physicalRenewals, setPhysicalRenewals] = useState<PhysicalRenewal[]>([])
  const [renewalDraft, setRenewalDraft] = useState<RenewalDraft | null>(null)
  const [lostFineDrafts, setLostFineDrafts] = useState<Record<number, { amount: string; reason: string }>>({})
  const [lostFineLoanId, setLostFineLoanId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [policySettingsError, setPolicySettingsError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
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
  const [checkedOutSearch, setCheckedOutSearch] = useState('')
  const [returnActionRequestId, setReturnActionRequestId] = useState<number | null>(null)
  const [deskActionPurpose, setDeskActionPurpose] = useState<'return' | 'renew'>('return')
  const [copyDetailsBookId, setCopyDetailsBookId] = useState<number | null>(null)
  const [selectedCopyId, setSelectedCopyId] = useState<number | null>(null)
  const [manageBook, setManageBook] = useState<Book | null>(null)
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [editBookForm, setEditBookForm] = useState({ title: '', author: '', category: '', genre: '', isbn: '', description: '' })
  const [locationDrafts, setLocationDrafts] = useState<Record<number, { section: string; shelf: string; row: string; position: string }>>({})
  const [pendingAction, setPendingAction] = useState<{ type: 'close' | 'reject'; id: number } | { type: 'archiveBook' | 'deleteBook'; id: number; title: string; archived: boolean } | { type: 'archiveMany' | 'deleteMany'; ids: number[] } | null>(null)

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
  const [checkoutCopyCode, setCheckoutCopyCode] = useState('')
  const [checkoutNotes, setCheckoutNotes] = useState('')
  const [checkoutCashReceived, setCheckoutCashReceived] = useState(false)
  const [renewalProcessing, setRenewalProcessing] = useState(false)
  const lastLoadedAt = useRef<number | null>(null)

  const load = async () => {
    const supabase = getSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) {
      setLoadError(`Unable to verify your library session: ${authError.message}`)
      setLoading(false)
      return
    }
    if (!user) { router.replace('/login'); return }
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError) {
      setLoadError(`Unable to verify library staff access: ${profileError.message}`)
      setLoading(false)
      return
    }
    if (librarianWorkspaceOnly && isAdminRole(profile?.role)) {
      router.replace('/dashboard/admin')
      return
    }
    if (!isStaffRole(profile?.role)) { router.replace('/unauthorized'); return }
    setIsAdmin(isAdminRole(profile?.role))
    if (!catalogOnly) {
      const { error: fineRefreshError } = await supabase.rpc('calculate_overdue_fines')
      if (fineRefreshError) {
        setLoadError(`Unable to refresh overdue fines: ${fineRefreshError.message}`)
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
    const [bookResult, copyResult, optionResult, loanResult, historyResult, memberResult, availabilityAlertsResult, fineResult, holidayResult, printPaymentResult, topUpResult, renewalResult, policyResult] = await Promise.all([
      supabase.from('books').select('id,title,author,category,discipline,genre,isbn,description,catalog_type,cover_image_url,is_archived').order('title'),
      copyResultPromise,
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('physical_loan_options').select('id,book_id,duration_days,fee_amount,is_active').order('book_id').order('duration_days'),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('physical_book_requests').select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,transaction_reference,status,requested_at,checked_out_at,due_date,returned_at,receipt_number,reservation_expires_at,incident_type,incident_status,incident_note,incident_assessed_amount,incident_assessed_at,incident_resolved_at,incident_resolved_by').order('requested_at', { ascending: false }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('physical_book_loan_history').select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,status,checked_out_at,due_date,returned_at,return_condition,receipt_number').order('checked_out_at', { ascending: false }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('profiles').select('id,email,full_name,role,institutional_id,student_photo_path,username,department,course,student_year,created_at').in('role', ['student', 'faculty']),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('physical_book_waitlist').select('student_id,book_id,created_at').order('created_at', { ascending: true }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('fines').select('id,physical_book_request_id,student_id,amount,status,fine_type,created_at,paid_at,waived_at,refund_due_at,refunded_at,refund_reason,fine_reason,waiver_reason,receipt_number').not('physical_book_request_id', 'is', null).order('created_at', { ascending: false }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) :       supabase.from('library_holidays').select('holiday_date,name,source,provider_synced_at').order('holiday_date', { ascending: true }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('library_print_payments').select('id,student_id,amount,description,receipt_number,created_at').order('created_at', { ascending: false }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('point_topups').select('id,member_id,bundle_points,amount_paid,receipt_number,created_at').order('created_at', { ascending: false }),
      catalogOnly ? Promise.resolve({ data: [], error: null }) : supabase.from('physical_book_renewals').select('id,request_id,student_id,copy_id,duration_days,previous_due_date,new_due_date,fee_amount,amount_received,receipt_number,created_at').order('created_at', { ascending: false }),
      supabase.from('library_policy_settings').select('id,fine_grace_days,late_fee_per_day,late_fee_cap,lost_after_days,faculty_lesson_reward_points,policy_notice,updated_at').eq('id', 1).single(),
    ])
    const failed = [bookResult, copyResult, optionResult, loanResult, historyResult, memberResult, availabilityAlertsResult, fineResult, holidayResult, printPaymentResult, topUpResult, renewalResult].find((result) => result.error)
    if (failed?.error) {
      setLoadError(`Unable to load physical circulation: ${failed.error.message}`)
      setLoading(false)
      return
    }
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
    setPointTopUps((topUpResult.data ?? []) as PointTopUp[])
    setPhysicalRenewals((renewalResult.data ?? []) as PhysicalRenewal[])
    if (policyResult.error || !policyResult.data) {
      setPolicySettings(null)
      setPolicySettingsError(`Enforceable policy settings are unavailable. Apply the policy migration before editing them. ${policyResult.error?.message ?? ''}`.trim())
    } else {
      const savedPolicy = policyResult.data as LibraryPolicySettings
      setPolicySettings(savedPolicy)
      setPolicySettingsError('')
      setPolicyDraft({
        fineGraceDays: String(savedPolicy.fine_grace_days),
        lateFeePerDay: String(savedPolicy.late_fee_per_day),
        lateFeeCap: String(savedPolicy.late_fee_cap),
        lostAfterDays: String(savedPolicy.lost_after_days),
        facultyLessonRewardPoints: String(savedPolicy.faculty_lesson_reward_points),
        policyNotice: savedPolicy.policy_notice,
      })
    }
    lastLoadedAt.current = Date.now()
    setLoadError('')
    setLoading(false)
  }

  useEffect(() => {
    if (!active) return
    if (lastLoadedAt.current === null || Date.now() - lastLoadedAt.current >= 60_000) {
      void load().catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : 'Unexpected error'
        console.error(`[SmartLib] Physical circulation load failed: ${message}`)
        setLoadError(`Unable to load physical circulation: ${message}`)
        setLoading(false)
      })
    }
  }, [active, reloadToken, router])

  useEffect(() => {
    if (!active || profiles.length === 0) return
    const url = new URL(window.location.href)
    const requestedMemberId = url.searchParams.get('topup')
    if (!requestedMemberId) return
    const member = profiles.find((candidate) => candidate.id === requestedMemberId)
    if (!member || !['student', 'faculty'].includes(member.role)) {
      setError('That member could not be opened for a points top-up.')
    } else {
      setTopUpMember(member)
    }
    url.searchParams.delete('topup')
    window.history.replaceState(window.history.state, '', url.toString())
  }, [active, profiles])

  const retryLoad = () => {
    lastLoadedAt.current = null
    setLoadError('')
    setError('')
    setLoading(true)
    setReloadToken((token) => token + 1)
  }

  useEffect(() => {
    const focusSearch = () => {
      if (librarianWorkspaceOnly && !isAdmin) setMemberDeskOpen(true)
      window.setTimeout(() => deskSearchRef.current?.focus(), 0)
    }
    window.addEventListener('dashboard:focus-student-id', focusSearch)
    if (new URLSearchParams(window.location.search).has('focusStudentId')) {
      focusSearch()
      window.history.replaceState(null, '', window.location.pathname)
    }
    return () => window.removeEventListener('dashboard:focus-student-id', focusSearch)
  }, [isAdmin, librarianWorkspaceOnly])

  useEffect(() => {
    if (!memberDeskOpen || !librarianWorkspaceOnly || isAdmin) return
    const frame = window.requestAnimationFrame(() => deskSearchRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [memberDeskOpen, librarianWorkspaceOnly, isAdmin])

  useEffect(() => {
    if (!active) return
    const supabase = getSupabase()
    let disposed = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    const refreshRequests = async () => {
      const { data, error: refreshError } = await supabase.from('physical_book_requests')
        .select('id,student_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,transaction_reference,status,requested_at,checked_out_at,due_date,returned_at,receipt_number,reservation_expires_at,incident_type,incident_status,incident_note,incident_assessed_amount,incident_assessed_at,incident_resolved_at,incident_resolved_by')
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

  useEffect(() => {
    if (finesOnly) return
    const requested = new URLSearchParams(window.location.search).get('panel')
    if (requested === 'requests' || requested === 'checkedOut' || requested === 'lost') {
      setOpenPanel(requested)
    }
  }, [finesOnly])

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
      const { error: saveError } = await getSupabase().rpc('set_manual_library_holiday', {
        p_holiday_date: holidayForm.date,
        p_name: holidayForm.name.trim(),
      })
      if (saveError) setError(`Unable to add local holiday exception: ${saveError.message}`)
      else {
        setHolidayForm({ date: '', name: '' })
        await load()
        setMessage('Local holiday exception added to the fine calendar.')
      }
      setBusy(false)
    }

    const previewHolidayCalendar = async () => {
      const year = Number(holidayYear)
      setBusy(true); setError(''); setMessage(''); setHolidayPreview(null)
      try {
        const response = await fetch(`/api/holidays?year=${encodeURIComponent(String(year))}`)
        const result = await response.json() as { holidays?: LibraryHoliday[]; error?: string }
        if (!response.ok) {
          setError(result.error || `Unable to load the Philippine holiday calendar for ${year}.`)
          return
        }
        if (!Array.isArray(result.holidays) || result.holidays.length === 0) {
          setError(`The holiday provider returned no dates for ${year}.`)
          return
        }
        setHolidayPreview({ year, holidays: result.holidays })
      } catch (cause) {
        const detail = cause instanceof Error ? ` ${cause.message}` : ''
        setError(`Unable to load the Philippine holiday calendar.${detail}`)
      } finally {
        setBusy(false)
      }
    }

    const syncHolidayCalendar = async () => {
      if (!holidayPreview) return
      setBusy(true); setError(''); setMessage('')
      const { data, error: syncError } = await getSupabase().rpc('sync_library_holidays', {
        p_year: holidayPreview.year,
        p_holidays: holidayPreview.holidays,
      })
      if (syncError) {
        setError(`Unable to sync the holiday calendar: ${syncError.message}`)
        setBusy(false)
        return
      }
      const result = Array.isArray(data) ? data[0] as { synced_count?: number; preserved_manual_count?: number } | undefined : undefined
      if (!result || typeof result.synced_count !== 'number' || typeof result.preserved_manual_count !== 'number') {
        setError('The holiday calendar sync completed without a valid result. Refresh the calendar before trying again.')
        setBusy(false)
        return
      }
      const { year } = holidayPreview
      setHolidayPreview(null)
      await load()
      setMessage(`Synced ${result.synced_count} official holiday${result.synced_count === 1 ? '' : 's'} for ${year}; preserved ${result.preserved_manual_count} local exception${result.preserved_manual_count === 1 ? '' : 's'}.`)
      setBusy(false)
    }

    const deleteHoliday = async (holiday: LibraryHoliday) => {
        setBusy(true); setError(''); setMessage('')
        const { error: deleteError } = await getSupabase().from('library_holidays').delete().eq('holiday_date', holiday.holiday_date)
        if (deleteError) setError(`Unable to remove holiday: ${deleteError.message}`)
        else {
          await load()
          setMessage(`${holiday.name} local exception removed from the fine calendar.`)
        }
        setBusy(false)
      }

  const saveLibraryPolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const fineGraceDays = Number(policyDraft.fineGraceDays)
    const lateFeePerDay = Number(policyDraft.lateFeePerDay)
    const lateFeeCap = Number(policyDraft.lateFeeCap)
    const lostAfterDays = Number(policyDraft.lostAfterDays)
    const facultyLessonRewardPoints = Number(policyDraft.facultyLessonRewardPoints)
    if (![fineGraceDays, lateFeePerDay, lateFeeCap, lostAfterDays, facultyLessonRewardPoints].every(Number.isFinite)) {
      setError('Enter valid numbers for every policy setting.')
      return
    }

    setBusy(true); setError(''); setMessage('')
    const { data, error: saveError } = await getSupabase().rpc('admin_update_library_policy', {
      p_fine_grace_days: fineGraceDays,
      p_late_fee_per_day: lateFeePerDay,
      p_late_fee_cap: lateFeeCap,
      p_lost_after_days: lostAfterDays,
      p_faculty_lesson_reward_points: facultyLessonRewardPoints,
      p_policy_notice: policyDraft.policyNotice,
    })
    if (saveError) {
      setError(`Unable to save library policy: ${saveError.message}`)
    } else if (!data) {
      setError('The policy update returned no saved settings. Refresh and verify the database before continuing.')
    } else {
      const saved = data as LibraryPolicySettings
      setPolicySettings(saved)
      setPolicyDraft({
        fineGraceDays: String(saved.fine_grace_days),
        lateFeePerDay: String(saved.late_fee_per_day),
        lateFeeCap: String(saved.late_fee_cap),
        lostAfterDays: String(saved.lost_after_days),
        facultyLessonRewardPoints: String(saved.faculty_lesson_reward_points),
        policyNotice: saved.policy_notice,
      })
      setMessage('Policy saved. Fine and lost-item rules apply to new physical requests; existing loans keep their saved policy.')
    }
    setBusy(false)
  }

  const recordFinePayment = async () => {
      if (!finePaymentConfirmation || !finePaymentReceived) return
      setBusy(true); setError(''); setMessage('')
      const { error: paymentError } = await getSupabase().rpc('admin_record_physical_fine_payment', { p_fine_id: finePaymentConfirmation.id })
      if (paymentError) setError(`Unable to record fine payment: ${paymentError.message}`)
      else {
        await load()
        setMessage('Physical-book fine payment recorded.')
      }
      setFinePaymentConfirmation(null)
      setFinePaymentReceived(false)
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
    if (!fineWaiver || !fineWaiver.reasonCategory || !fineWaiver.justification.trim()) return
    setBusy(true); setError(''); setMessage('')
    const { error: waiverError } = await getSupabase().rpc('admin_waive_physical_fine', {
      p_fine_id: fineWaiver.id,
      p_reason_category: fineWaiver.reasonCategory,
      p_justification: fineWaiver.justification.trim(),
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
    if (!newPhysicalBook.category.trim()) {
      setError('Enter a subject for the physical title.')
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
      p_discipline: newPhysicalBook.category.trim() || null,
      p_genre: null,
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
      setNewPhysicalBook({ title: '', author: '', category: '', genre: '', isbn: '', description: '', quantity: '1', prefix: '', location: '', coverImageUrl: '' })
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

  const executeCheckout = async (loanId: number, copyCode: string, paidAmount = Number(loans.find((loan) => loan.id === loanId)?.fee_amount ?? 0), notes = '') => {
    const checkoutMemberId = loans.find((loan) => loan.id === loanId)?.student_id ?? ''
    if (!deskIdentityMatches(checkoutMemberId)) {
      setError('Verify the borrower’s physical institutional ID in the checkout review before issuing the copy.')
      return
    }
    if (!copies.some((copy) => copy.book_id === loans.find((loan) => loan.id === loanId)?.book_id
      && copy.copy_code === copyCode && copy.status === 'available')) {
      setError('Select an available copy of the requested title before completing checkout.')
      return
    }
    if (paidAmount > 0 && !checkoutCashReceived) {
      setError('Confirm that the configured cash amount was collected before completing checkout.')
      return
    }
    setProcessingRequestId(loanId)
    setBusy(true); setError(''); setMessage('')
    try {
      const { error: actionError } = await getSupabase().rpc('admin_confirm_physical_checkout', {
        p_request_id: loanId, p_copy_code: copyCode, p_amount_paid: paidAmount, p_payment_notes: notes.trim() || null, p_id_card_presented: true,
      })
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

  const openRenewal = (loan: Loan) => {
    if (loan.status !== 'checked_out') {
      setError('Only an active checked-out loan can be renewed.')
      return
    }
    if (!deskIdentityMatches(loan.student_id)) {
      setError('Search for the borrower and confirm their physical institutional ID before renewal.')
      return
    }
    if (selectedDeskMemberOverdue || selectedDeskMemberUnpaid > 0) {
      setError('Resolve overdue or lost physical loans and clear unpaid fines before renewing.')
      return
    }
    const availableOptions = options
      .filter((option) => option.book_id === loan.book_id && option.is_active)
      .sort((a, b) => a.duration_days - b.duration_days)
    if (!availableOptions.length) {
      setError('No active renewal periods and fees are configured for this title.')
      return
    }
    const option = availableOptions[0]
    setRenewalDraft({
      loanId: loan.id,
      durationDays: option.duration_days,
      amountPaid: Number(option.fee_amount).toFixed(2),
      notes: '',
    })
    setError('')
  }

  const executeRenewal = async () => {
    if (!renewalDraft) return
    const loan = loans.find((item) => item.id === renewalDraft.loanId)
    const option = options.find((item) => item.book_id === loan?.book_id
      && item.duration_days === renewalDraft.durationDays && item.is_active)
    const amountPaid = Number(renewalDraft.amountPaid)
    if (!loan || loan.status !== 'checked_out' || !option) {
      setError('Choose an active loan and a configured renewal period.')
      return
    }
    if (!deskIdentityMatches(loan.student_id)) {
      setError('Search for the borrower and confirm their physical institutional ID before renewal.')
      return
    }
    if (selectedDeskMemberOverdue || selectedDeskMemberUnpaid > 0) {
      setError('Resolve overdue or lost physical loans and clear unpaid fines before renewing.')
      return
    }
    if (!Number.isFinite(amountPaid) || amountPaid < 0 || Math.round(amountPaid * 100) !== Math.round(Number(option.fee_amount) * 100)) {
      setError('Amount received must match the configured fee for the selected renewal period.')
      return
    }

    setRenewalProcessing(true)
    setProcessingRequestId(loan.id)
    setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: actionError } = await getSupabase().rpc('admin_renew_physical_loan', {
        p_request_id: loan.id,
        p_duration_days: option.duration_days,
        p_amount_paid: amountPaid,
        p_payment_notes: renewalDraft.notes.trim() || null,
        p_id_card_presented: true,
      })
      if (actionError) throw new Error(actionError.message)
      const savedRenewal = data as PhysicalRenewal
      await load()
      setRenewalDraft(null)
      setMessage(`Loan renewed for ${savedRenewal.duration_days} days. PHP ${Number(savedRenewal.amount_received).toFixed(2)} received; new due date ${new Date(savedRenewal.new_due_date).toLocaleDateString()}. Receipt ${savedRenewal.receipt_number}.`)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to renew the physical loan.')
    } finally {
      setRenewalProcessing(false)
      setProcessingRequestId(null)
      setBusy(false)
    }
  }

  const issueDeskCopy = async () => {
    if (!selectedDeskMember || !deskIdCardPresented) {
      setError('Look up the member and confirm their physical institutional ID before issuing a loan.')
      return
    }
    if (selectedDeskMemberOverdue || selectedDeskMemberUnpaid > 0 || selectedDeskMemberLoans.length >= 3) {
      setError('Resolve the member’s overdue items, unpaid fines, or borrowing limit before issuing another book.')
      return
    }
    const copy = copies.find((item) => item.copy_code.toLocaleLowerCase() === deskCopyQuery.trim().toLocaleLowerCase())
    if (!copy) {
      setError('Enter an accession tag and select a matching physical copy.')
      return
    }
    if (copy.status !== 'available') {
      setError(`${copy.copy_code} is ${copy.status}; choose an available copy instead.`)
      return
    }
    const durationDays = Number(deskIssueDurationDays)
    const option = options.find((item) => item.book_id === copy.book_id && item.duration_days === durationDays && item.is_active)
    if (!option) {
      setError('Choose an active loan period configured for this title.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    try {
      const { data, error: issueError } = await getSupabase().rpc('admin_issue_physical_copy', {
        p_student_id: selectedDeskMember.id,
        p_copy_code: copy.copy_code,
        p_duration_days: durationDays,
        p_amount_paid: Number(option.fee_amount),
        p_payment_notes: null,
        p_id_card_presented: true,
      })
      if (issueError) throw new Error(issueError.message)
      await load()
      setDeskCopyQuery('')
      setDeskSelectedReturnIds([])
      const issuedLoan = data as Loan
      setMessage(`${copy.copy_code} issued to ${selectedDeskMember.full_name || selectedDeskMember.email}. Due ${new Date(issuedLoan.due_date ?? '').toLocaleDateString()}; receipt ${issuedLoan.receipt_number ?? 'recorded'}.`)
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : 'Unable to issue this physical copy.')
    } finally {
      setBusy(false)
    }
  }

  const returnDeskLoans = async () => {
    if (!selectedDeskMember || !deskIdentityMatches(selectedDeskMember.id) || !deskSelectedReturnIds.length) return
    setDeskReturnsProcessing(true); setError(''); setMessage('')
    try {
      const { data, error: returnError } = await getSupabase().rpc('admin_return_physical_loans', {
        p_student_id: selectedDeskMember.id,
        p_request_ids: deskSelectedReturnIds,
        p_id_card_presented: true,
      })
      if (returnError) throw new Error(returnError.message)
      const returnedCount = Number(data)
      await load()
      setDeskSelectedReturnIds([])
      setMessage(`${returnedCount} physical ${returnedCount === 1 ? 'copy' : 'copies'} returned and marked available.`)
    } catch (returnError) {
      setError(returnError instanceof Error ? returnError.message : 'Unable to record the selected returns.')
    } finally {
      setDeskReturnsProcessing(false)
    }
  }

  const executeCloseLoan = async (loanId: number) => {
    const returnMemberId = loans.find((loan) => loan.id === loanId)?.student_id ?? ''
    if (!deskIdentityMatches(returnMemberId)) {
      setError('Search for the borrower and confirm their physical institutional ID before completing the return.')
      return
    }
    setBusy(true); setError(''); setMessage('')
    const condition = returnConditions[loanId] ?? 'available'
    if (condition === 'lost' || condition === 'damaged') {
      const draft = lostFineDrafts[loanId] ?? { amount: '', reason: '' }
      const amount = condition === 'lost' ? Number(draft.amount) : 0
      if (!draft.reason.trim()) {
        setError(condition === 'lost' ? 'Record an inspection note describing the lost item.' : 'Record an inspection note describing the damage.')
        setBusy(false)
        return
      }
      if (condition === 'lost' && (!draft.amount.trim() || !Number.isFinite(amount) || amount <= 0 || amount > 100000)) {
        setError('Enter a staff-assessed lost-item charge greater than 0 and no more than 100,000.')
        setBusy(false)
        return
      }
      const { data, error: actionError } = await getSupabase().rpc('admin_inspect_physical_return', {
        p_request_id: loanId,
        p_copy_condition: condition,
        p_assessed_amount: amount,
        p_assessment_reason: draft.reason.trim(),
        p_id_card_presented: true,
      })
      if (actionError) setError(actionError.message)
      else {
        setLostFineLoanId(null)
        setLostFineDrafts((current) => ({ ...current, [loanId]: { amount: '', reason: '' } }))
        await load()
        setDeskSelectedReturnIds((current) => current.filter((id) => id !== loanId))
        const saved = data as Loan
        setMessage(saved.status === 'lost' && condition !== 'lost'
          ? 'This loan reached the 30-day overdue threshold and was classified as lost. Review the open case to assess it.'
          : condition === 'lost'
            ? 'Book marked lost and the replacement assessment was recorded.'
            : 'Return recorded as damaged. The copy is unavailable until staff resolves its damage assessment.')
      }
      setBusy(false)
      return
    }
    const { data, error: actionError } = await getSupabase().rpc('admin_inspect_physical_return', {
      p_request_id: loanId, p_copy_condition: condition, p_assessed_amount: 0, p_assessment_reason: null,
      p_id_card_presented: true,
    })
    if (actionError) setError(actionError.message)
    else {
      await load()
      setDeskSelectedReturnIds((current) => current.filter((id) => id !== loanId))
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
    const condition = lostResolution[loanId] ?? ''
    const damageDraft = recoveryDamageDrafts[loanId] ?? { amount: '', reason: '' }
    const damageAmount = 0
    if (!condition) {
      setError('Choose the recovered copy’s condition or explicitly close the case as unresolved.')
      return
    }
    if (condition === 'damaged' && !damageDraft.reason.trim()) {
      setError('Record the recovered copy’s damage inspection before resolving the case.')
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
    setCheckoutCopyCode('')
    setCheckoutNotes('')
    setCheckoutCashReceived(false)
    const member = profiles.find((profile) => profile.id === loan.student_id)
    setDeskMemberId(member?.id ?? '')
    setDeskMemberQuery(member?.institutional_id || member?.full_name || member?.email || '')
    setDeskIdCardPresented(false)
  }
  const closeLoan = (loanId: number) => {
    const condition = returnConditions[loanId] ?? 'available'
    if (condition === 'damaged' || condition === 'lost') {
      setLostFineDrafts((current) => ({ ...current, [loanId]: current[loanId] ?? { amount: '', reason: '' } }))
      setLostFineLoanId(loanId)
      return
    }
    setPendingAction({ type: 'close', id: loanId })
  }
  const selectDeskMember = (member: Profile) => {
    setDeskMemberId(member.id)
    setDeskMemberQuery(member.institutional_id || member.full_name || member.email)
    setDeskSuggestionIndex(0)
    setDeskIdCardPresented(false)
    setDeskCopyQuery('')
    setDeskSelectedReturnIds([])
    setMemberProfileTab('overview')
    setMemberActivity([])
    setMemberActivityError('')
  }
  const uploadDeskMemberPhoto = async (file: File) => {
    if (!selectedDeskMember) return
    const formData = new FormData()
    formData.set('photo', file)
    setDeskPhotoUploading(true)
    setError('')
    const response = await fetch(`/api/admin/students/${selectedDeskMember.id}/photo`, { method: 'POST', body: formData })
    const result = await response.json().catch(() => null)
    if (!response.ok) setError(result?.error || 'Unable to save the member photo.')
    else {
      setProfiles((current) => current.map((member) => member.id === selectedDeskMember.id
        ? { ...member, student_photo_path: `${selectedDeskMember.id}/headshot` }
        : member))
      setMessage('Member photo uploaded to private library storage.')
    }
    setDeskPhotoUploading(false)
  }
  const rejectRequest = (loanId: number) => setPendingAction({ type: 'reject', id: loanId })
  const resolveLostLoan = (loanId: number) => {
    const loan = loans.find((item) => item.id === loanId)
    setLostResolution((current) => ({ ...current, [loanId]: loan?.incident_type === 'damage' ? 'available' : '' }))
    setSelectedLostCaseId(loanId)
  }

  const saveBookDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingBook) return
    setBusy(true); setError(''); setMessage('')
    const { error: saveError } = await getSupabase().rpc('admin_update_physical_book', {
      p_book_id: editingBook.id, p_title: editBookForm.title, p_author: editBookForm.author,
      p_category: editBookForm.category, p_discipline: editBookForm.category || null,
      p_genre: editBookForm.genre || null, p_isbn: editBookForm.isbn || null, p_description: editBookForm.description || null,
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
      const matchesStatus = requestStatus === 'all'
        || (requestStatus === 'cash_requests' && loan.payment_method === 'cash')
        || (requestStatus === 'legacy_online' && loan.payment_method !== 'cash')
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
  const visibleActiveLoans = useMemo(() => {
    const query = checkedOutSearch.trim().toLocaleLowerCase()
    if (!query) return activeLoans
    return activeLoans.filter((loan) => {
      const member = profiles.find((profile) => profile.id === loan.student_id)
      return [String(loan.id), member?.institutional_id, member?.full_name, member?.email, bookName(loan.book_id)]
        .filter(Boolean).join(' ').toLocaleLowerCase().includes(query)
    })
  }, [activeLoans, checkedOutSearch, profiles, books])
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
  const selectedCopy = selectedCopyId === null ? null : copies.find((copy) => copy.id === selectedCopyId) ?? null
  const selectedCopyHistory = selectedCopy
    ? loanHistory.filter((loan) => loan.copy_id === selectedCopy.id).sort((a, b) => Date.parse(b.checked_out_at) - Date.parse(a.checked_out_at))
    : []
  const selectedCopyCurrentLoan = selectedCopy
    ? loans.find((loan) => loan.copy_id === selectedCopy.id && (loan.status === 'checked_out' || loan.status === 'return_pending')) ?? null
    : null
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
  const selectedDeskMember = profiles.find((member) => member.id === deskMemberId) ?? null
  const returnActionLoan = returnActionRequestId === null ? null : loans.find((loan) => loan.id === returnActionRequestId) ?? null
  const deskIdentityMatches = (memberId: string) => Boolean(deskIdCardPresented && selectedDeskMember?.id === memberId)
  const deskCopySuggestions = useMemo(() => {
    const query = deskCopyQuery.trim().toLocaleLowerCase()
    if (!query) return []
    return copies
      .filter((copy) => copy.copy_code.toLocaleLowerCase().includes(query))
      .sort((a, b) => Number(b.status === 'available') - Number(a.status === 'available') || a.copy_code.localeCompare(b.copy_code))
      .slice(0, 8)
  }, [copies, deskCopyQuery])
  const deskSelectedCopy = copies.find((copy) => copy.copy_code.toLocaleLowerCase() === deskCopyQuery.trim().toLocaleLowerCase()) ?? null
  const deskSelectedCopyBook = deskSelectedCopy ? books.find((book) => book.id === deskSelectedCopy.book_id) ?? null : null
  const deskSelectedCopyOptions = deskSelectedCopy
    ? options.filter((option) => option.book_id === deskSelectedCopy.book_id && option.is_active).sort((a, b) => a.duration_days - b.duration_days)
    : []
  useEffect(() => {
    if (!deskSelectedCopy) return
    const activeOptions = options
      .filter((option) => option.book_id === deskSelectedCopy.book_id && option.is_active)
      .sort((a, b) => a.duration_days - b.duration_days)
    if (activeOptions.length && !activeOptions.some((option) => option.duration_days === Number(deskIssueDurationDays))) {
      setDeskIssueDurationDays(String(activeOptions[0].duration_days))
    }
  }, [deskSelectedCopy?.book_id, options, deskIssueDurationDays])
  const deskMemberSuggestions = useMemo(() => {
    const query = normalizeDeskSearch(deskMemberQuery)
    if (!query) return []
    return profiles
      .map((member) => {
        const id = normalizeDeskSearch(member.institutional_id ?? '')
        const name = normalizeDeskSearch(member.full_name ?? '')
        const email = normalizeDeskSearch(member.email)
        const exactId = id === query
        const idPrefix = id.startsWith(query)
        const exactName = name === query
        const directMatch = id.includes(query) || name.includes(query) || email.includes(query)
        const fuzzyMatch = query.length >= 4 && isNameSubsequence(query, name)
        return { member, score: exactId ? 0 : idPrefix ? 1 : exactName ? 2 : directMatch ? 3 : 4, matches: directMatch || fuzzyMatch }
      })
      .filter((entry) => entry.matches)
      .sort((a, b) => a.score - b.score || (a.member.full_name ?? a.member.email).localeCompare(b.member.full_name ?? b.member.email))
      .slice(0, 8)
      .map((entry) => entry.member)
  }, [deskMemberQuery, profiles])
  const selectedDeskMemberLoans = selectedDeskMember
    ? loans.filter((loan) => loan.student_id === selectedDeskMember.id && ['checked_out', 'return_pending'].includes(loan.status))
    : []
  const selectedDeskMemberUnpaid = selectedDeskMember
    ? physicalFines.filter((fine) => fine.student_id === selectedDeskMember.id && fine.status === 'unpaid').reduce((total, fine) => total + Number(fine.amount), 0)
    : 0
  const selectedDeskMemberUnpaidFines = selectedDeskMember
    ? physicalFines.filter((fine) => fine.student_id === selectedDeskMember.id && fine.status === 'unpaid')
    : []
  const selectedMemberHistory = selectedDeskMember
    ? loanHistory.filter((loan) => loan.student_id === selectedDeskMember.id)
    : []
  const selectedMemberFines = selectedDeskMember
    ? physicalFines.filter((fine) => fine.student_id === selectedDeskMember.id)
    : []
  const selectedMemberRenewals = selectedDeskMember
    ? physicalRenewals.filter((renewal) => renewal.student_id === selectedDeskMember.id)
    : []
  const selectedMemberPrintPayments = selectedDeskMember
    ? printPayments.filter((payment) => payment.student_id === selectedDeskMember.id)
    : []
  const selectedMemberPayments = [
    ...selectedMemberRenewals.map((entry) => ({
      id: `renewal-${entry.id}`,
      title: `Loan renewed · ${entry.duration_days} days`,
      date: entry.created_at,
      amount: entry.amount_received,
      receipt: entry.receipt_number,
    })),
    ...selectedMemberPrintPayments.map((entry) => ({
      id: `print-${entry.id}`,
      title: entry.description || 'Print payment',
      date: entry.created_at,
      amount: entry.amount,
      receipt: entry.receipt_number,
    })),
  ]
  const selectedDeskMemberOverdue = Boolean(selectedDeskMember && loans.some((loan) =>
    loan.student_id === selectedDeskMember.id
      && (loan.status === 'lost' || (['checked_out', 'return_pending'].includes(loan.status) && Boolean(loan.due_date && new Date(loan.due_date).getTime() < Date.now())))))
  const deskEligibility = !selectedDeskMember ? null
    : selectedDeskMemberOverdue || selectedDeskMemberUnpaid > 0 ? 'BLOCKED'
      : selectedDeskMemberLoans.length >= 3 ? 'MAX LOANS REACHED'
        : 'ELIGIBLE'
  useEffect(() => {
    if (!librarianWorkspaceOnly || isAdmin || !memberDeskOpen || !selectedDeskMember || memberProfileTab !== 'activity') return
    let active = true
    setMemberActivityLoading(true)
    setMemberActivityError('')
    void (async () => {
      const { data, error: activityError } = await getSupabase().from('member_activity_ledger')
        .select('id,occurred_at,event_type,summary,actor_role,receipt_number,related_request_type,related_request_id')
        .eq('member_id', selectedDeskMember.id)
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100)
      if (!active) return
      if (activityError) {
        setMemberActivityError(`Unable to load member activity: ${activityError.message}`)
      } else {
        setMemberActivity((data ?? []) as MemberActivityEvent[])
      }
      setMemberActivityLoading(false)
    })()
    return () => { active = false }
  }, [librarianWorkspaceOnly, isAdmin, memberDeskOpen, memberProfileTab, selectedDeskMember?.id])
  const renewalLoan = renewalDraft ? loans.find((loan) => loan.id === renewalDraft.loanId) ?? null : null
  const renewalOptions = renewalLoan
    ? options.filter((option) => option.book_id === renewalLoan.book_id && option.is_active).sort((a, b) => a.duration_days - b.duration_days)
    : []
  const selectedRenewalOption = renewalDraft
    ? renewalOptions.find((option) => option.duration_days === renewalDraft.durationDays) ?? null
    : null
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
      ...physicalRenewals.map((renewal) => ({
        id: `renewal-${renewal.id}`, date: renewal.created_at,
        member: profiles.find((item) => item.id === renewal.student_id)?.full_name || profiles.find((item) => item.id === renewal.student_id)?.email || 'Member',
        description: `Physical loan renewal · ${books.find((book) => book.id === loans.find((loan) => loan.id === renewal.request_id)?.book_id)?.title ?? 'Physical book'} · ${copyCode(renewal.copy_id)} · ${renewal.duration_days} days`,
        amount: Number(renewal.amount_received), status: 'paid', receiptNumber: renewal.receipt_number,
        source: { kind: 'renewal' as const, renewal },
      })),
      ...printPayments.map((payment) => ({
        id: `print-${payment.id}`, date: payment.created_at, member: profiles.find((item) => item.id === payment.student_id)?.full_name || profiles.find((item) => item.id === payment.student_id)?.email || 'Member',
        description: `Print service · ${payment.description}`, amount: Number(payment.amount), status: 'paid', receiptNumber: payment.receipt_number,
        source: { kind: 'print' as const, payment },
      })),
      ...pointTopUps.map((topup) => ({
        id: `topup-${topup.id}`, date: topup.created_at, member: profiles.find((item) => item.id === topup.member_id)?.full_name || profiles.find((item) => item.id === topup.member_id)?.email || 'Member',
        description: `Points top-up · ${topup.bundle_points.toLocaleString()} points`, amount: Number(topup.amount_paid), status: 'paid', receiptNumber: topup.receipt_number,
        source: { kind: 'topup' as const, topup },
      })),
    ]
    const query = fineSearch.trim().toLocaleLowerCase()
    return rows
      .filter((row) => fineStatusFilter === 'all'
        || (fineStatusFilter === 'needs_action' && (row.source.kind === 'request' || (row.source.kind === 'fine' && (row.source.fine.status === 'unpaid' || row.source.fine.status === 'refund_due'))))
        || row.status === fineStatusFilter)
      .filter((row) => !query || [row.member, row.description, row.receiptNumber, row.id].join(' ').toLocaleLowerCase().includes(query))
      .filter((row) => {
        const rowDate = transactionDateKey(row.date)
        return (!fineDateFrom || rowDate >= fineDateFrom) && (!fineDateTo || rowDate <= fineDateTo)
      })
      .sort((a, b) => {
        const comparison = financeSort.key === 'date'
          ? new Date(a.date).getTime() - new Date(b.date).getTime()
          : a.amount - b.amount
        return financeSort.direction === 'asc' ? comparison : -comparison
      })
  }, [queueLoans, physicalFines, loans, loanHistory, physicalRenewals, printPayments, pointTopUps, profiles, books, fineSearch, fineStatusFilter, fineDateFrom, fineDateTo, copies, financeSort])
  const setFinanceDatePreset = (preset: 'today' | 'last7' | 'month') => {
    const today = new Date()
    const from = new Date(today)
    if (preset === 'last7') from.setDate(today.getDate() - 6)
    if (preset === 'month') from.setDate(1)
    setFineDateFrom(localDateKey(from))
    setFineDateTo(localDateKey(today))
  }
  const openOptionEditor = (bookId: number) => {
    const existing = options.filter((option) => option.book_id === bookId)
    setOptionForm({
      bookId: String(bookId),
      fees: Object.fromEntries(PHYSICAL_LOAN_DURATION_OPTIONS.map((days) => [days, String(existing.find((option) => option.duration_days === days)?.fee_amount ?? 0)])),
    })
    setOptionFormOpen(true)
  }
  const focusDeskRequest = (requestId: number) => {
    if (librarianWorkspaceOnly && !isAdmin) {
      checkout(requestId)
      setOpenPanel(null)
      setMemberDeskOpen(false)
      return
    }
    setRequestSearch(String(requestId))
    setRequestStatus('all')
    setRequestPage(1)
    setOpenPanel('requests')
  }
  const focusDeskLoanAction = (requestId: number, purpose: 'return' | 'renew') => {
    const loan = loans.find((item) => item.id === requestId)
    const member = profiles.find((profile) => profile.id === loan?.student_id)
    if (!loan || !member) {
      setError('Unable to open this circulation action because the loan or member profile is unavailable. Refresh the desk and try again.')
      return
    }
    setDeskMemberId(member.id)
    setDeskMemberQuery(member.institutional_id || member.full_name || member.email)
    setDeskIdCardPresented(false)
    setReturnActionRequestId(requestId)
    setDeskActionPurpose(purpose)
    setReturnConditions((current) => ({ ...current, [requestId]: current[requestId] ?? 'available' }))
    setOpenPanel(null)
    setMemberDeskOpen(false)
  }
  const focusDeskReturn = (requestId: number) => {
    if (librarianWorkspaceOnly && !isAdmin) {
      focusDeskLoanAction(requestId, 'return')
      return
    }
    setCheckedOutSearch(String(requestId))
    setReturnActionRequestId(requestId)
    const member = profiles.find((profile) => profile.id === loans.find((loan) => loan.id === requestId)?.student_id)
    setDeskMemberId(member?.id ?? '')
    setDeskIdCardPresented(false)
    setDeskMemberQuery(member?.institutional_id || member?.full_name || '')
    setOpenPanel(null)
    if (librarianWorkspaceOnly && !isAdmin) setMemberDeskOpen(true)
    else window.setTimeout(() => {
      document.getElementById('desk-member-verification')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      deskSearchRef.current?.focus()
    }, 0)
  }
  const focusDeskIncident = (requestId: number) => {
    setLostCaseView('open')
    setLostSearch(String(requestId))
    setSelectedLostCaseId(requestId)
    setOpenPanel('lost')
  }
  const closeMemberDesk = () => {
    setMemberDeskOpen(false)
    setDeskMemberId('')
    setDeskMemberQuery('')
    setDeskIdCardPresented(false)
    setDeskCopyQuery('')
    setDeskSelectedReturnIds([])
    setReturnActionRequestId(null)
  }
  const closeDeskLoanAction = () => {
    setReturnActionRequestId(null)
    setDeskActionPurpose('return')
    setDeskIdCardPresented(false)
  }
  const finishDeskLoanAction = () => {
    setReturnActionRequestId(null)
    setDeskActionPurpose('return')
  }
  const continueDeskLoanAction = () => {
    if (!returnActionLoan || !deskIdentityMatches(returnActionLoan.student_id)) {
      setError('Confirm the member’s physical institutional ID before continuing.')
      return
    }
    const loan = returnActionLoan
    const purpose = deskActionPurpose
    finishDeskLoanAction()
    if (purpose === 'renew') openRenewal(loan)
    else closeLoan(loan.id)
  }
  const onMemberInvited = async (email: string, username: string) => {
    setMessage(`Invitation sent to ${email}. Username: ${username}.`)
    await load()
  }
  const handleLogout = async () => {
    setSigningOut(true)
    setError('')
    try {
      const { error: signOutError } = await getSupabase().auth.signOut()
      if (signOutError) throw signOutError
      router.replace('/login')
    } catch (cause) {
      setError(cause instanceof Error ? `Unable to sign out: ${cause.message}` : 'Unable to sign out. Please try again.')
      setSigningOut(false)
    }
  }
  const openLibrarianPanel = (nextPanel: 'requests' | 'checkedOut' | 'lost') => {
    if (finesOnly) {
      router.push(`/dashboard/admin/physical?panel=${nextPanel}`)
      return
    }
    setOpenPanel(nextPanel)
  }
  const openInventory = () => {
    if (finesOnly) {
      router.push('/dashboard/admin/physical#physical-catalog')
      return
    }
    document.getElementById('physical-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const librarianMode = librarianWorkspaceOnly && !isAdmin
  const librarianSidebarVisible = !isAdmin && (librarianWorkspaceOnly || finesOnly)
  const embeddedAdminDashboard = isAdmin && Boolean(onOpenFines)
  if (loading && (overviewOnly || catalogOnly || policyOnly || finesOnly)) return null
  if (loading) return <AdminPhysicalSkeleton />

  return <main className={`physical-staff-shell ${librarianSidebarVisible ? `physical-librarian-workspace ${librarianSidebarCollapsed ? 'librarian-sidebar-collapsed' : ''}` : ''} ${requestsOnly ? 'physical-requests-only contents' : overviewOnly ? 'contents' : catalogOnly || policyOnly || finesOnly ? `${embeddedAdminDashboard ? 'min-h-0 p-0' : 'min-h-full px-4 py-6 sm:px-6'} text-slate-900 dark:text-slate-100 ${librarianSidebarVisible ? 'librarian-workspace-page' : ''}` : 'min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8'}`}>
    {librarianSidebarVisible ? <>
      {librarianSidebarOpen ? <button type="button" className="student-sidebar-backdrop" aria-label="Close librarian navigation" onClick={() => setLibrarianSidebarOpen(false)} /> : null}
      <button type="button" className="student-mobile-toggle librarian-mobile-toggle" aria-label="Open librarian navigation" aria-expanded={librarianSidebarOpen} onClick={() => setLibrarianSidebarOpen(true)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </> : null}
    <div className={`mx-auto max-w-6xl ${librarianSidebarVisible ? 'librarian-dashboard-layout' : 'space-y-6'}`}>
      {librarianSidebarVisible ? <aside className={`dashboard-sidebar librarian-sidebar ${librarianSidebarOpen ? 'dashboard-sidebar-open' : ''}`}>
        <div className="librarian-sidebar-brand">
          <div className="student-sidebar-header">
            <BrandLogo className="student-brand" iconSize="sm" subtitle="Library services" />
            <button type="button" className="student-sidebar-toggle dashboard-sidebar-collapse-control librarian-sidebar-collapse-toggle" aria-controls="librarian-desk-navigation" aria-expanded={librarianSidebarOpen || !librarianSidebarCollapsed} aria-label={librarianSidebarOpen ? 'Close librarian navigation' : librarianSidebarCollapsed ? 'Expand librarian navigation' : 'Collapse librarian navigation'} title={librarianSidebarOpen ? 'Close navigation' : librarianSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} onClick={() => {
              if (librarianSidebarOpen) setLibrarianSidebarOpen(false)
              else setLibrarianSidebarCollapsed((collapsed) => !collapsed)
            }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {librarianSidebarOpen
                  ? <path d="m6 6 12 12M18 6 6 18" />
                  : <path d={librarianSidebarCollapsed ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />}
              </svg>
            </button>
          </div>
          <p className="student-sidebar-label">Librarian workspace</p>
        </div>
        <nav id="librarian-desk-navigation" className="student-nav librarian-desk-navigation" aria-label="Librarian desk navigation">
          <div className="student-nav-group librarian-nav-group">
            <p className="student-nav-group-label">Desk</p>
            <button type="button" aria-label="Today at the desk" title={librarianSidebarCollapsed ? 'Today at the desk' : undefined} aria-current={!finesOnly && !openPanel ? 'page' : undefined} onClick={() => { setLibrarianSidebarOpen(false); setOpenPanel(null); router.push('/dashboard/admin/physical') }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8M8 10h8" /></svg>
              <span>Today at the desk</span>
            </button>
            <button type="button" aria-label="Checked out" title={librarianSidebarCollapsed ? 'Checked out' : undefined} aria-current={openPanel === 'checkedOut' ? 'page' : undefined} onClick={() => { setLibrarianSidebarOpen(false); openLibrarianPanel('checkedOut') }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>
              <span>Checked out</span><span className="librarian-nav-count">{activeLoans.length}</span>
            </button>
          </div>
          <div className="student-nav-group librarian-nav-group">
            <p className="student-nav-group-label">Library</p>
            <button type="button" aria-label="Inventory" title={librarianSidebarCollapsed ? 'Inventory' : undefined} onClick={() => { setLibrarianSidebarOpen(false); openInventory() }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" /></svg>
              <span>Inventory</span>
            </button>
          </div>
          <div className="student-nav-group librarian-nav-group">
            <p className="student-nav-group-label">Records</p>
            <button type="button" aria-label="Lost items" title={librarianSidebarCollapsed ? 'Lost items' : undefined} aria-current={openPanel === 'lost' ? 'page' : undefined} onClick={() => { setLibrarianSidebarOpen(false); openLibrarianPanel('lost') }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 21 19H3z" /><path d="M12 9v4m0 3h.01" /></svg>
              <span>Lost items</span><span className="librarian-nav-count">{openIncidentCases.length}</span>
            </button>
            <button type="button" aria-label="Daily records" title={librarianSidebarCollapsed ? 'Daily records' : undefined} aria-current={finesOnly ? 'page' : undefined} onClick={() => { setLibrarianSidebarOpen(false); router.push('/dashboard/admin/physical/finance') }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4zM8 8h8M8 12h4M8 16h8" /></svg>
              <span>Daily records</span>
            </button>
          </div>
        </nav>
        <div className="student-sidebar-footer librarian-sidebar-footer">
          <p className="student-nav-group-label">Account</p>
          <div className="student-theme-control"><ThemeToggle /></div>
          <button type="button" aria-label="Profile" title={librarianSidebarCollapsed ? 'Profile' : undefined} onClick={() => { setLibrarianSidebarOpen(false); router.push('/profile') }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
            <span>Profile</span>
          </button>
          <button type="button" className="librarian-desk-sign-out" aria-label={signingOut ? 'Signing out' : 'Sign out'} title={librarianSidebarCollapsed ? signingOut ? 'Signing out' : 'Sign out' : undefined} disabled={signingOut} onClick={() => void handleLogout()}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></svg>
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </aside> : null}
      <div className={requestsOnly ? 'physical-requests-result' : undefined}>
        <ResultModal
          open={Boolean(error)}
          status="error"
          message={error}
          onClose={() => setError('')}
        />
        <ResultModal
          open={Boolean(message)}
          status="success"
          successTitle="Action completed"
          message={message}
          onClose={() => setMessage('')}
        />
        {loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
          <p>{loadError}</p>
          <button type="button" onClick={retryLoad} className="shrink-0 rounded-lg border border-rose-700 px-3 py-1.5 font-semibold hover:bg-rose-100 dark:border-rose-300 dark:hover:bg-rose-900">Retry</button>
        </div> : null}
      </div>

      {!requestsOnly && !overviewOnly && !catalogOnly && !policyOnly && !finesOnly ? <>
        {isAdmin ? <>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Library operations</p><h1 className="mt-1 text-2xl font-semibold">Circulation overview</h1><p className="mt-1 text-sm text-slate-500">Review requests, active loans, exceptions, and receipts from here.</p></div>
            <button type="button" onClick={() => setNewPhysicalBookOpen(true)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-600">Add physical book</button>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Requests to review</p><strong className="mt-2 block text-2xl">{queueLoans.length}</strong></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Checked out</p><strong className="mt-2 block text-2xl">{activeLoans.length}</strong></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lost items</p><strong className="mt-2 block text-2xl">{lostLoans.length}</strong></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Unpaid fines</p><strong className="mt-2 block text-2xl">{physicalFines.filter((fine) => fine.status === 'unpaid').length}</strong></div>
          </div>
        </> : <>
          <header className="librarian-dashboard-hero">
            <div className="librarian-dashboard-heading">
              <div>
                <p className="librarian-dashboard-eyebrow">Staff workspace</p>
                <h1>Librarian desk</h1>
                <p>Verify members, check out and return books, and resolve circulation requests.</p>
              </div>
              <div className="librarian-dashboard-actions">
                <button type="button" onClick={() => setMemberEnrollmentOpen(true)} className="librarian-dashboard-secondary-action">Create member account</button>
                <button type="button" onClick={() => setMemberDeskOpen(true)} className="librarian-dashboard-primary-action">Find a member</button>
              </div>
            </div>
          </header>
        </>}
      </> : null}

      {!requestsOnly && !overviewOnly && !catalogOnly && !policyOnly && !finesOnly ? <>
        {isAdmin ? <>
          <LibrarianWorkQueue
            loans={loans}
            members={profiles}
            bookName={bookName}
            onOpenRequest={focusDeskRequest}
            onOpenReturn={focusDeskReturn}
            onReviewIncident={focusDeskIncident}
          />
          <LibrarianShiftCloseout
            history={loanHistory}
            fines={physicalFines}
            renewals={physicalRenewals}
            printPayments={printPayments}
          />
        </> : <div className="librarian-bento-grid">
          <LibrarianWorkQueue
            loans={loans}
            members={profiles}
            bookName={bookName}
            onOpenRequest={focusDeskRequest}
            onOpenReturn={focusDeskReturn}
            onReviewIncident={focusDeskIncident}
          />
        </div>}
      </> : null}

      {!overviewOnly && !catalogOnly && !policyOnly && !finesOnly ? <MemberDeskSurface
        asModal={librarianWorkspaceOnly && !isAdmin}
        open={memberDeskOpen}
        onClose={closeMemberDesk}
        title={librarianWorkspaceOnly && !isAdmin && selectedDeskMember ? 'Member profile' : 'Find a member'}
        description={librarianWorkspaceOnly && !isAdmin && selectedDeskMember
          ? 'Review this member’s account, physical borrowing, charges, and circulation activity.'
          : 'Search by name or institutional ID to view a member’s circulation summary.'}
      >
        {!(librarianWorkspaceOnly && !isAdmin && selectedDeskMember) ? <>
        <section id="desk-member-verification" className={`${panel} space-y-4 scroll-mt-6 ${librarianWorkspaceOnly && !isAdmin ? 'librarian-member-desk-content' : ''}`} aria-label="Find a member">
        <div className="relative max-w-none">
          <label htmlFor="physical-student-id-search" className="text-sm font-medium">Search members</label>
          <input
            ref={deskSearchRef}
            id="physical-student-id-search"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!deskMemberId && deskMemberSuggestions.length > 0}
            aria-controls="desk-member-suggestions"
            aria-activedescendant={deskMemberSuggestions[deskSuggestionIndex] ? `desk-member-option-${deskMemberSuggestions[deskSuggestionIndex].id}` : undefined}
            value={deskMemberQuery}
            onChange={(event) => {
              const value = event.target.value
              setDeskMemberQuery(/[a-z]/i.test(value) ? value : normalizeInstitutionalIdInput(value))
              setDeskMemberId('')
              setDeskIdCardPresented(false)
              setDeskCopyQuery('')
              setDeskSelectedReturnIds([])
              setDeskSuggestionIndex(0)
            }}
            onKeyDown={(event) => {
              if (!deskMemberSuggestions.length) return
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setDeskSuggestionIndex((index) => (index + 1) % deskMemberSuggestions.length)
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setDeskSuggestionIndex((index) => (index - 1 + deskMemberSuggestions.length) % deskMemberSuggestions.length)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                selectDeskMember(deskMemberSuggestions[deskSuggestionIndex])
              } else if (event.key === 'Escape') {
                setDeskMemberQuery('')
                setDeskMemberId('')
              }
            }}
            placeholder="Name or institutional ID"
            className={`${input} mt-1`}
          />
          {!deskMemberId && deskMemberSuggestions.length ? <ul id="desk-member-suggestions" role="listbox" className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            {deskMemberSuggestions.map((member, index) => <li key={member.id}>
              <button type="button" id={`desk-member-option-${member.id}`} role="option" aria-selected={index === deskSuggestionIndex} onMouseEnter={() => setDeskSuggestionIndex(index)} onClick={() => selectDeskMember(member)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${index === deskSuggestionIndex ? 'bg-sky-50 dark:bg-slate-800' : ''}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-200 text-xs font-semibold dark:bg-slate-700">{member.student_photo_path ? <img src={`/api/admin/students/${member.id}/photo`} alt="" className="h-full w-full object-cover" /> : (member.full_name || member.email).slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0"><strong className="block truncate text-sm">{member.full_name || member.email}</strong><span className="block truncate text-xs text-slate-500">{member.institutional_id || 'No institutional ID'} · {member.role}</span></span>
              </button>
            </li>)}
          </ul> : null}
          {!deskMemberId && deskMemberQuery && deskMemberSuggestions.length === 0 ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">No member matched. Search by a different name or ID.</p> : null}
        </div>
        {selectedDeskMember ? <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60 sm:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-2">
            <div className="grid h-32 w-32 place-items-center overflow-hidden rounded-xl border border-slate-300 bg-white text-2xl font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900">
              {selectedDeskMember.student_photo_path
                ? <img src={`/api/admin/students/${selectedDeskMember.id}/photo`} alt={`Headshot of ${selectedDeskMember.full_name || selectedDeskMember.email}`} className="h-full w-full object-cover" />
                : (selectedDeskMember.full_name || selectedDeskMember.email).slice(0, 1).toUpperCase()}
            </div>
            {isAdmin ? <label className="cursor-pointer text-center text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">{deskPhotoUploading ? 'Uploading…' : selectedDeskMember.student_photo_path ? 'Replace headshot' : 'Upload headshot'}
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={deskPhotoUploading} className="sr-only" onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadDeskMemberPhoto(file)
                event.target.value = ''
              }} />
            </label> : null}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">{selectedDeskMember.full_name || selectedDeskMember.email}</h3>
              {!librarianMode && deskEligibility ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${deskEligibility === 'ELIGIBLE' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : deskEligibility === 'BLOCKED' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{deskEligibility}</span> : null}
              {!librarianMode && (selectedDeskMember.role === 'student' || selectedDeskMember.role === 'faculty')
                ? <button type="button" onClick={() => setTopUpMember(selectedDeskMember)} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/30">Add points</button>
                : null}
            </div>
            <dl className="mt-2 grid gap-x-5 gap-y-1 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Institutional ID</dt><dd className="font-medium">{selectedDeskMember.institutional_id || 'Not recorded'}</dd></div><div><dt className="text-xs text-slate-500">Email / role</dt><dd className="break-all font-medium">{selectedDeskMember.email} · {selectedDeskMember.role}</dd></div><div><dt className="text-xs text-slate-500">Active physical loans</dt><dd className="font-medium">{selectedDeskMemberLoans.length} / 3</dd></div><div><dt className="text-xs text-slate-500">Unpaid fines</dt><dd className="font-medium">PHP {selectedDeskMemberUnpaid.toFixed(2)}</dd></div></dl>
            {!librarianMode ? <label className="mt-4 flex items-start gap-2 text-sm font-medium"><input type="checkbox" checked={deskIdCardPresented} onChange={(event) => setDeskIdCardPresented(event.target.checked)} className="mt-0.5" /><span>I confirm the member presented their physical institutional ID card and I visually matched it to the photo.</span></label> : null}
          </div>
          {!isAdmin && !librarianMode ? <div className="mt-4 space-y-4 sm:col-span-2">
            {selectedDeskMemberOverdue || selectedDeskMemberUnpaid > 0 || selectedDeskMemberLoans.length >= 3
              ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200" role="status">
                <strong>New loans are blocked.</strong>
                <ul className="mt-1 list-inside list-disc">
                  {selectedDeskMemberOverdue ? <li>Return overdue or resolve lost physical items.</li> : null}
                  {selectedDeskMemberUnpaid > 0 ? <li>Collect or resolve PHP {selectedDeskMemberUnpaid.toFixed(2)} in unpaid physical fines.</li> : null}
                  {selectedDeskMemberLoans.length >= 3 ? <li>The three-book active loan limit is reached.</li> : null}
                </ul>
              </div>
              : <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">No overdue items or unpaid physical fines. {selectedDeskMemberLoans.length} of 3 active loans.</p>}

            {selectedDeskMemberUnpaidFines.length ? <div>
              <h4 className="text-sm font-semibold">Unpaid physical charges</h4>
              <ul className="mt-2 space-y-2">
                {selectedDeskMemberUnpaidFines.map((fine) => <li key={fine.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm dark:border-rose-900">
                  <span>{fineTypeLabel(fine.fine_type)}{fine.fine_reason ? ` · ${fine.fine_reason}` : ''}</span>
                  <strong>PHP {Number(fine.amount).toFixed(2)}</strong>
                </li>)}
              </ul>
              <button type="button" onClick={() => onOpenFines ? onOpenFines() : router.push('/dashboard/admin/physical/finance')} className="mt-2 text-sm font-semibold text-sky-700 underline dark:text-sky-300">Open fines and payment records</button>
            </div> : null}

            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <h4 className="text-sm font-semibold">Issue a physical copy</h4>
              <p className="mt-1 text-xs text-slate-500">Enter the accession tag printed on the book, such as JAVA-03. No scanner is needed.</p>
              <div className="relative mt-3 max-w-xl">
                <label htmlFor="desk-copy-accession" className="text-sm font-medium">Physical copy accession tag</label>
                <input id="desk-copy-accession" value={deskCopyQuery} onChange={(event) => setDeskCopyQuery(event.target.value)} placeholder="Type a copy tag, e.g. JAVA-03" autoComplete="off" className={`${input} mt-1`} />
                {deskCopyQuery && deskCopySuggestions.length ? <ul role="listbox" aria-label="Matching physical copies" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  {deskCopySuggestions.map((copy) => <li key={copy.id}>
                    <button type="button" role="option" aria-selected={deskSelectedCopy?.id === copy.id} onClick={() => setDeskCopyQuery(copy.copy_code)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                      <span><strong>{copy.copy_code}</strong> · {bookName(copy.book_id)}</span>
                      <span className={copy.status === 'available' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}>{copy.status}</span>
                    </button>
                  </li>)}
                </ul> : null}
              </div>
              {deskSelectedCopy ? <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                <p><strong>{deskSelectedCopy.copy_code}</strong> · {deskSelectedCopyBook?.title ?? 'Physical title'} · <span className="capitalize">{deskSelectedCopy.status}</span></p>
                {deskSelectedCopy.status === 'available' ? deskSelectedCopyOptions.length ? <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-sm font-medium">Loan period
                    <select value={deskIssueDurationDays} onChange={(event) => setDeskIssueDurationDays(event.target.value)} className={`${input} mt-1`}>
                      {deskSelectedCopyOptions.map((option) => <option key={option.id} value={option.duration_days}>{option.duration_days} days · PHP {Number(option.fee_amount).toFixed(2)}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={busy || !deskIdCardPresented || deskEligibility !== 'ELIGIBLE'} onClick={() => void issueDeskCopy()} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600">Issue loan</button>
                  {!deskIdCardPresented ? <span className="text-xs text-amber-700 dark:text-amber-300">Verify the member’s physical ID above first.</span> : null}
                </div> : <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">No loan periods are configured for this title.</p>
                  : <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">This copy cannot be issued. Choose a copy marked available.</p>}
              </div> : deskCopyQuery && deskCopySuggestions.length === 0 ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">No physical copy tag matches. Check the accession number and try again.</p> : null}
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h4 className="text-sm font-semibold">Active physical loans</h4><p className="text-xs text-slate-500">Select several books for a clean return, or handle one item as damaged.</p></div>
                {selectedDeskMemberLoans.length ? <button type="button" disabled={busy || deskReturnsProcessing || !deskIdentityMatches(selectedDeskMember.id) || !deskSelectedReturnIds.length} onClick={() => void returnDeskLoans()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600">{deskReturnsProcessing ? 'Recording returns…' : `Mark ${deskSelectedReturnIds.length || ''} selected returned`}</button> : null}
              </div>
              {selectedDeskMemberLoans.length ? <ul className="mt-2 space-y-2">
                {selectedDeskMemberLoans.map((loan) => {
                  const dueTime = loan.due_date ? new Date(loan.due_date).getTime() : null
                  const overdue = dueTime !== null && dueTime < Date.now()
                  const copy = copies.find((item) => item.id === loan.copy_id)
                  return <li key={loan.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                    <input type="checkbox" aria-label={`Select ${copy?.copy_code ?? bookName(loan.book_id)} for return`} checked={deskSelectedReturnIds.includes(loan.id)} disabled={!deskIdentityMatches(selectedDeskMember.id) || loan.incident_type !== null} onChange={(event) => setDeskSelectedReturnIds((current) => event.target.checked ? [...current, loan.id] : current.filter((id) => id !== loan.id))} />
                    <div className="min-w-0 text-sm">
                      <strong>{bookName(loan.book_id)}</strong> · {copy?.copy_code ?? 'Copy unavailable'}
                      <p className={overdue ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500'}>{overdue ? 'Overdue' : loan.status === 'return_pending' ? 'Return requested' : 'Checked out'} · Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : 'date unavailable'}</p>
                      {loan.incident_type ? <p className="text-amber-700 dark:text-amber-300">Open {loan.incident_type} case: {loan.incident_note || 'inspection required'}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy || !deskIdentityMatches(selectedDeskMember.id) || loan.status !== 'checked_out'} onClick={() => openRenewal(loan)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700">Extend due date</button>
                      <button type="button" disabled={busy || !deskIdentityMatches(selectedDeskMember.id)} onClick={() => { setReturnConditions((current) => ({ ...current, [loan.id]: 'available' })); setPendingAction({ type: 'close', id: loan.id }) }} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700">Mark returned</button>
                      <button type="button" disabled={busy || !deskIdentityMatches(selectedDeskMember.id)} onClick={() => { setReturnConditions((current) => ({ ...current, [loan.id]: 'damaged' })); setLostFineDrafts((current) => ({ ...current, [loan.id]: current[loan.id] ?? { amount: '', reason: '' } })); setLostFineLoanId(loan.id) }} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50 dark:border-amber-900 dark:text-amber-200">Return as damaged</button>
                    </div>
                  </li>
                })}
              </ul> : <p className="mt-2 rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">No active physical loans for this member.</p>}
              {!deskIdCardPresented && selectedDeskMemberLoans.length ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Confirm the member’s physical ID above to enable return and renewal actions.</p> : null}
            </div>
          </div> : null}
        </div> : null}
        {!librarianMode && returnActionRequestId !== null && selectedDeskMember && deskIdentityMatches(loans.find((loan) => loan.id === returnActionRequestId)?.student_id ?? '')
          ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/30">
            <p className="text-sm">Member ID confirmed. Continue to the return inspection for <strong>{bookName(loans.find((loan) => loan.id === returnActionRequestId)?.book_id ?? 0)}</strong>.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setOpenPanel('checkedOut'); setReturnActionRequestId(null) }} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white dark:bg-emerald-600">Continue to return</button>
              <button type="button" onClick={() => setReturnActionRequestId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Cancel</button>
            </div>
          </div>
          : null}
        </section>
        </> : <section aria-label={`Profile for ${selectedDeskMember.full_name || selectedDeskMember.email}`} className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => {
              setDeskMemberId('')
              setDeskIdCardPresented(false)
              setMemberProfileTab('overview')
              setMemberActivity([])
              setMemberActivityError('')
            }} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <span aria-hidden="true">←</span> Back to search
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">{selectedDeskMember.role}</span>
              {librarianMode && (selectedDeskMember.role === 'student' || selectedDeskMember.role === 'faculty')
                ? <button type="button" onClick={() => setTopUpMember(selectedDeskMember)} className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500">Add points</button>
                : null}
            </div>
          </div>

          <header className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-5 dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white bg-slate-200 text-3xl font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {selectedDeskMember.student_photo_path
                  ? <img src={`/api/admin/students/${selectedDeskMember.id}/photo`} alt={`Headshot of ${selectedDeskMember.full_name || selectedDeskMember.email}`} className="h-full w-full object-cover" />
                  : (selectedDeskMember.full_name || selectedDeskMember.email).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Member account</p>
                <h2 className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{selectedDeskMember.full_name || selectedDeskMember.email}</h2>
                <p className="mt-1 break-all text-sm text-slate-600 dark:text-slate-300">{selectedDeskMember.email}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">ID · {selectedDeskMember.institutional_id || 'Not recorded'}</span>
                  {selectedDeskMember.username ? <span className="rounded-lg border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200">@{selectedDeskMember.username}</span> : null}
                </div>
              </div>
              {isAdmin ? <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">{deskPhotoUploading ? 'Uploading…' : selectedDeskMember.student_photo_path ? 'Update photo' : 'Add photo'}
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={deskPhotoUploading} className="sr-only" onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void uploadDeskMemberPhoto(file)
                  event.target.value = ''
                }} />
              </label> : null}
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Active loans', value: selectedDeskMemberLoans.length, detail: 'of 3 allowed', tone: 'text-sky-700 dark:text-sky-300' },
              { label: 'Checkout history', value: selectedMemberHistory.length, detail: 'physical loans', tone: 'text-slate-900 dark:text-white' },
              { label: 'Unpaid charges', value: `PHP ${selectedDeskMemberUnpaid.toFixed(2)}`, detail: `${selectedDeskMemberUnpaidFines.length} open`, tone: selectedDeskMemberUnpaid > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300' },
              { label: 'Overdue items', value: loans.filter((loan) => loan.student_id === selectedDeskMember.id && ['checked_out', 'return_pending'].includes(loan.status) && Boolean(loan.due_date && new Date(loan.due_date).getTime() < Date.now())).length, detail: 'currently due', tone: selectedDeskMemberOverdue ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300' },
            ].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
              <strong className={`mt-2 block break-words text-xl font-bold ${stat.tone}`}>{stat.value}</strong>
              <span className="mt-1 block text-xs text-slate-500">{stat.detail}</span>
            </div>)}
          </div>

          <div className="border-b border-slate-200 dark:border-slate-800">
            <div role="tablist" aria-label="Member profile sections" className="-mb-px flex gap-1 overflow-x-auto">
              {([
                ['overview', 'Overview'],
                ['borrowing', 'Borrowing'],
                ['charges', 'Charges'],
                ['activity', 'Activity'],
              ] as const).map(([tab, label]) => <button key={tab} type="button" role="tab" id={`member-profile-tab-${tab}`} aria-selected={memberProfileTab === tab} aria-controls="member-profile-panel" onClick={() => setMemberProfileTab(tab)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${memberProfileTab === tab ? 'border-sky-600 text-sky-800 dark:border-sky-400 dark:text-sky-200' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>{label}</button>)}
            </div>
          </div>

          <div id="member-profile-panel" role="tabpanel" aria-labelledby={`member-profile-tab-${memberProfileTab}`} className="min-h-48">
            {memberProfileTab === 'overview' ? <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-sm font-bold">Account details</h3>
                <dl className="mt-3 grid gap-x-5 gap-y-4 sm:grid-cols-2">
                  {[
                    ['Institutional ID', selectedDeskMember.institutional_id || 'Not recorded'],
                    ['Role', selectedDeskMember.role],
                    ['Department', selectedDeskMember.department || 'Not recorded'],
                    ['Course / program', selectedDeskMember.course || 'Not recorded'],
                    ['Year level', selectedDeskMember.student_year || 'Not recorded'],
                    ['Username', selectedDeskMember.username ? `@${selectedDeskMember.username}` : 'Not recorded'],
                    ['Account created', selectedDeskMember.created_at ? new Date(selectedDeskMember.created_at).toLocaleDateString() : 'Not recorded'],
                  ].map(([label, value]) => <div key={label}><dt className="text-xs font-medium text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800 dark:text-slate-200">{value}</dd></div>)}
                </dl>
              </section>
              <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-sm font-bold">Needs attention</h3>
                {selectedDeskMemberOverdue || selectedDeskMemberUnpaid > 0 || selectedDeskMemberLoans.some((loan) => loan.incident_type) ? <ul className="mt-3 space-y-2 text-sm">
                  {selectedDeskMemberOverdue ? <li className="rounded-xl bg-rose-50 p-3 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">One or more items are overdue or unresolved.</li> : null}
                  {selectedDeskMemberUnpaid > 0 ? <li className="rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">PHP {selectedDeskMemberUnpaid.toFixed(2)} in physical charges remain unpaid.</li> : null}
                  {selectedDeskMemberLoans.some((loan) => loan.incident_type) ? <li className="rounded-xl bg-amber-50 p-3 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">An open lost or damage case needs review.</li> : null}
                </ul> : <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">No overdue items, unpaid physical charges, or open incidents.</p>}
                <button type="button" onClick={() => setMemberProfileTab('borrowing')} className="mt-4 text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">Review borrowing history →</button>
              </section>
            </div> : null}

            {memberProfileTab === 'borrowing' ? <div className="space-y-5">
              <section>
                <h3 className="text-sm font-bold">Currently borrowed</h3>
                {selectedDeskMemberLoans.length ? <ul className="mt-3 space-y-2">{selectedDeskMemberLoans.map((loan) => {
                  const copy = copies.find((item) => item.id === loan.copy_id)
                  const overdue = Boolean(loan.due_date && new Date(loan.due_date).getTime() < Date.now())
                  return <li key={loan.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <div><strong className="text-sm">{bookName(loan.book_id)}</strong><p className="mt-1 text-xs text-slate-500">{copy?.copy_code || 'Copy unavailable'} · {loan.duration_days} days</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${overdue ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : loan.incident_type ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'}`}>{overdue ? 'Overdue' : loan.incident_type ? `${loan.incident_type} case` : loan.status === 'return_pending' ? 'Return requested' : 'Checked out'}</span>
                    <p className="w-full text-xs text-slate-500">Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : 'date unavailable'}{loan.receipt_number ? ` · Receipt ${loan.receipt_number}` : ''}</p>
                  </li>
                })}</ul> : <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No active physical loans.</p>}
              </section>
              <section>
                <h3 className="text-sm font-bold">Checkout history</h3>
                {selectedMemberHistory.length ? <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{selectedMemberHistory.map((loan) => <li key={loan.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div><strong className="text-sm">{bookName(loan.book_id)}</strong><p className="mt-1 text-xs text-slate-500">{copies.find((copy) => copy.id === loan.copy_id)?.copy_code || 'Copy unavailable'} · {loan.duration_days} days · {new Date(loan.checked_out_at).toLocaleDateString()}</p></div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${loan.status === 'returned' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : loan.status === 'lost' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{loan.status === 'returned' ? `Returned${loan.return_condition ? ` · ${loan.return_condition}` : ''}` : loan.status === 'lost' ? 'Lost' : 'Checked out'}</span>
                  <p className="w-full text-xs text-slate-500">Due {new Date(loan.due_date).toLocaleDateString()}{loan.returned_at ? ` · Returned ${new Date(loan.returned_at).toLocaleDateString()}` : ''}{loan.receipt_number ? ` · Receipt ${loan.receipt_number}` : ''}</p>
                </li>)}</ul> : <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No physical checkout history is available.</p>}
              </section>
            </div> : null}

            {memberProfileTab === 'charges' ? <div className="space-y-5">
              <section>
                <h3 className="text-sm font-bold">Physical fines and assessments</h3>
                {selectedMemberFines.length ? <ul className="mt-3 space-y-2">{selectedMemberFines.map((fine) => <li key={fine.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div><strong className="text-sm">{fineTypeLabel(fine.fine_type)}</strong><p className="mt-1 text-xs text-slate-500">{fine.fine_reason || fine.waiver_reason || fine.refund_reason || `Created ${new Date(fine.created_at).toLocaleDateString()}`}{fine.receipt_number ? ` · Receipt ${fine.receipt_number}` : ''}</p></div>
                  <div className="text-right"><strong className="block text-sm">PHP {Number(fine.amount).toFixed(2)}</strong><span className={`text-xs font-semibold ${fine.status === 'unpaid' ? 'text-rose-700 dark:text-rose-300' : fine.status === 'paid' ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>{fine.status.replaceAll('_', ' ')}</span></div>
                </li>)}</ul> : <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No physical fines or assessments recorded.</p>}
              </section>
              <section>
                <h3 className="text-sm font-bold">Renewals and print payments</h3>
                {selectedMemberPayments.length
                  ? <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{selectedMemberPayments.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong className="text-sm">{entry.title}</strong><p className="mt-1 text-xs text-slate-500">{new Date(entry.date).toLocaleDateString()} · Receipt {entry.receipt}</p></div><strong className="text-sm">PHP {Number(entry.amount).toFixed(2)}</strong></li>)}</ul>
                  : <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No renewal or print payments recorded.</p>}
              </section>
            </div> : null}

            {memberProfileTab === 'activity' ? <section>
              <h3 className="text-sm font-bold">Circulation activity</h3>
              {memberActivityLoading ? <p role="status" className="mt-3 text-sm text-slate-500">Loading activity…</p>
                : memberActivityError ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{memberActivityError}</p>
                  : memberActivity.length ? <ol className="mt-3 space-y-2">{memberActivity.map((event) => <li key={event.id} className="flex gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                    <span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500" />
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{event.summary}</p><p className="mt-1 text-xs text-slate-500">{new Date(event.occurred_at).toLocaleString()} · {event.actor_role}{event.receipt_number ? ` · Receipt ${event.receipt_number}` : ''}</p></div>
                  </li>)}</ol>
                    : <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">No circulation activity is available for this account.</p>}
            </section> : null}
          </div>
        </section>}
      </MemberDeskSurface> : null}

      <BaseModal
        open={librarianMode && returnActionRequestId !== null}
        title={deskActionPurpose === 'renew' ? 'Verify member ID to renew' : 'Verify ID & inspect return'}
        eyebrow="Circulation desk"
        description={deskActionPurpose === 'renew' ? 'Confirm the borrower’s identity before reviewing renewal terms.' : 'Confirm the borrower’s identity, inspect the copy, and record its return condition.'}
        onClose={closeDeskLoanAction}
        size="md"
        layer="background"
      >
        {returnActionLoan && selectedDeskMember ? <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{deskActionPurpose === 'renew' ? 'Renewal' : 'Return inspection'}</p>
            <h3 className="mt-1 text-lg font-semibold">{bookName(returnActionLoan.book_id)}</h3>
            <p className="mt-2 text-sm">{selectedDeskMember.full_name || selectedDeskMember.email}</p>
            <p className="text-sm text-slate-500">Institutional ID: {selectedDeskMember.institutional_id || 'Not recorded'}</p>
            <p className="mt-1 text-xs text-slate-500">Due {returnActionLoan.due_date ? new Date(returnActionLoan.due_date).toLocaleDateString() : 'date unavailable'} · Request #{returnActionLoan.id}</p>
          </div>
          <label className="flex items-start gap-2 text-sm font-medium">
            <input type="checkbox" checked={deskIdCardPresented} onChange={(event) => setDeskIdCardPresented(event.target.checked)} className="mt-0.5" />
            <span>I confirm the member presented their physical institutional ID card and I visually matched it to their profile.</span>
          </label>
          {deskActionPurpose === 'return' ? <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">What happened to the copy?</legend>
            {outcomeOptions.map((option) => <WorkflowChoice
              key={option.value}
              title={option.title}
              description={option.description}
              selected={(returnConditions[returnActionLoan.id] ?? 'available') === option.value}
              onSelect={() => setReturnConditions((current) => ({ ...current, [returnActionLoan.id]: option.value }))}
            />)}
          </fieldset> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeDeskLoanAction} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Cancel</button>
            <button type="button" disabled={busy || !deskIdentityMatches(returnActionLoan.student_id)} onClick={continueDeskLoanAction} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600">
              {deskActionPurpose === 'renew' ? 'Continue to renewal' : 'Continue to return'}
            </button>
          </div>
        </div> : null}
      </BaseModal>

      {!librarianWorkspaceOnly && !overviewOnly && !catalogOnly && !policyOnly && !finesOnly ? <div className="physical-queue-nav flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60" role="toolbar" aria-label="Physical circulation actions">
        {!requestsOnly ? <button type="button" onClick={() => setOpenPanel('requests')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Requests <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-200">{queueLoans.length}</span></button> : null}
        <button type="button" onClick={() => setOpenPanel('checkedOut')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Checked out <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{activeLoans.length}</span></button>
        <button type="button" onClick={() => setOpenPanel('history')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Loan history</button>
        <button type="button" onClick={() => setOpenPanel('lost')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Lost items <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800 dark:bg-rose-950 dark:text-rose-200">{openIncidentCases.length}</span></button>
        {!requestsOnly ? <button type="button" onClick={() => onOpenFines ? onOpenFines() : router.push('/dashboard/admin/physical/finance')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Financial ledger / fines</button> : null}
      </div> : null}

      {newPhysicalBookOpen && isAdmin ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setNewPhysicalBookOpen(false) }}><form onSubmit={(event) => void submitPhysicalBook(event)} className={`${panel} max-h-[90vh] w-full max-w-4xl space-y-3 overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="add-physical-book-title">
        <div className="flex items-start justify-between gap-4"><div><h2 id="add-physical-book-title" className="text-lg font-semibold">Add a physical book to the catalog</h2><p className="text-sm text-slate-500">Create the title, initial copies, and QR labels together.</p></div><button type="button" disabled={busy} onClick={() => setNewPhysicalBookOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium">Title<input required maxLength={300} value={newPhysicalBook.title} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, title: event.target.value })} className={`${input} mt-1`} /></label>
          <label className="text-sm font-medium">Author<input required maxLength={200} value={newPhysicalBook.author} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, author: event.target.value })} className={`${input} mt-1`} /></label>
          <label className="text-sm font-medium">Subject<input required maxLength={120} value={newPhysicalBook.category} onChange={(event) => setNewPhysicalBook({ ...newPhysicalBook, category: event.target.value })} placeholder="e.g. Biology" className={`${input} mt-1`} /></label>
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
          <div><p className="text-sm text-slate-500">Set enforceable physical-loan rules, member notices, faculty lesson rewards, and public holiday dates.</p></div>
          <button type="button" onClick={() => setPolicyModalOpen(true)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Edit policy &amp; holidays</button>
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{policySettings ? `Each physical title can offer 1, 3, 5, 7, 14, and 30-day loans with separate checkout fees. Overdue charges start after a ${policySettings.fine_grace_days}-day grace period at PHP ${Number(policySettings.late_fee_per_day).toFixed(2)} per chargeable day, capped at PHP ${Number(policySettings.late_fee_cap).toFixed(2)} per item. Sundays and listed holidays are excluded; items overdue for ${policySettings.lost_after_days} consecutive days are marked lost. Approved faculty lessons earn ${policySettings.faculty_lesson_reward_points} points by default.` : policySettingsError || 'Policy settings could not be loaded.'}</p>
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{policySettings?.policy_notice}</p>
        <p className="mt-3 text-sm text-slate-500">Cash top-ups are fixed: 200 points / PHP 10, 500 / PHP 22, or 1,000 / PHP 40 (maximum 1,000 points per sale). Students and faculty may top up; faculty may earn the configured lesson reward. Librarians can invite students and faculty after checking school ID in person. Only administrators can add books or create staff accounts.</p>
        <p className="mt-3 text-sm text-slate-500">{holidays.length} holiday date{holidays.length === 1 ? '' : 's'} currently excluded from fine-day calculations.</p>
      </section> : null}

      {finesOnly && isAdmin ? <section id="physical-transactions" className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>{!embeddedAdminDashboard ? <><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Library finance</p><h1 className="mt-1 text-xl font-semibold">Transactions</h1></> : null}<p className={`${embeddedAdminDashboard ? '' : 'mt-1'} text-sm text-slate-500`}>Review requests, payments, fines, and receipts together.</p></div>
          <div className="flex flex-wrap items-center gap-2">{!onOpenFines ? <button type="button" onClick={() => router.push('/dashboard/admin/physical')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Back to circulation</button> : null}<button type="button" onClick={() => setOpenPanel('print')} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-700">Print payments &amp; receipts</button>{!onOpenFines ? <button type="button" disabled={signingOut} onClick={() => void handleLogout()} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">{signingOut ? 'Signing out…' : 'Sign out'}</button> : null}</div>
        </div>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <input type="search" value={fineSearch} onChange={(event) => setFineSearch(event.target.value)} placeholder="Search member, title, receipt, or transaction..." aria-label="Search transactions" className={`${input} min-w-56 flex-1`} />
          <select value={fineStatusFilter} onChange={(event) => setFineStatusFilter(event.target.value as typeof fineStatusFilter)} aria-label="Filter transactions by status" className={`${input} sm:w-48`}><option value="all">All transactions</option><option value="needs_action">Needs action</option><option value="pending">Pending requests</option><option value="pending_verification">Payment verification</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="waived">Waived</option><option value="refund_due">Refund due</option><option value="refunded">Refunded</option></select>
          <label className="min-w-36 flex-1 text-xs font-medium text-slate-600 dark:text-slate-300 sm:flex-none">From date<input type="date" value={fineDateFrom} onChange={(event) => setFineDateFrom(event.target.value)} aria-label="Filter transactions from date" className={`${input} mt-1`} /></label>
          <label className="min-w-36 flex-1 text-xs font-medium text-slate-600 dark:text-slate-300 sm:flex-none">To date<input type="date" value={fineDateTo} onChange={(event) => setFineDateTo(event.target.value)} aria-label="Filter transactions to date" className={`${input} mt-1`} /></label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Quick dates:</span>
          <button type="button" onClick={() => setFinanceDatePreset('today')} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700">Today</button>
          <button type="button" onClick={() => setFinanceDatePreset('last7')} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700">Last 7 days</button>
          <button type="button" onClick={() => setFinanceDatePreset('month')} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700">This month</button>
          <button type="button" disabled={!fineDateFrom && !fineDateTo} onClick={() => { setFineDateFrom(''); setFineDateTo('') }} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 underline disabled:opacity-40 dark:text-slate-300">Clear dates</button>
        </div>
        {fineDateFrom && fineDateTo && fineDateFrom > fineDateTo ? <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">From date must be on or before the To date.</p> : null}
        <p className="mt-3 text-xs text-slate-500">Showing {financeRows.length} transaction{financeRows.length === 1 ? '' : 's'}.</p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-3"><button type="button" onClick={() => setFinanceSort((current) => ({ key: 'date', direction: current.key === 'date' && current.direction === 'desc' ? 'asc' : 'desc' }))}>Date {financeSort.key === 'date' ? (financeSort.direction === 'desc' ? '▼' : '▲') : '↕'}</button></th>
                <th className="px-3 py-3">Member</th>
                <th className="px-3 py-3">Transaction</th>
                <th className="px-3 py-3"><button type="button" onClick={() => setFinanceSort((current) => ({ key: 'amount', direction: current.key === 'amount' && current.direction === 'desc' ? 'asc' : 'desc' }))}>Amount {financeSort.key === 'amount' ? (financeSort.direction === 'desc' ? '▼' : '▲') : '↕'}</button></th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Receipt / action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {financeRows.map((row) => {
                const source = row.source
                const loan = source.kind === 'fine'
                  ? loans.find((item) => item.id === source.fine.physical_book_request_id)
                  : source.kind === 'request' ? source.loan : null
                const canSettle = loan?.status === 'returned' || loan?.status === 'lost'
                const needsAction = source.kind === 'request'
                  || (source.kind === 'fine' && (source.fine.status === 'unpaid' || source.fine.status === 'refund_due'))
                const recent = Date.now() - new Date(row.date).getTime() <= 7 * 24 * 60 * 60 * 1000

                return <tr key={row.id} className={needsAction ? 'bg-emerald-50 dark:bg-emerald-950/35' : recent ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-white dark:bg-slate-900'}>
                  <td className="whitespace-nowrap px-3 py-3">{new Date(row.date).toLocaleDateString()}</td>
                  <td className="px-3 py-3">{row.member}</td>
                  <td className="px-3 py-3">{row.description}</td>
                  <td className="whitespace-nowrap px-3 py-3">PHP {row.amount.toFixed(2)}</td>
                  <td className="px-3 py-3 capitalize">{row.status.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {row.receiptNumber && source.kind !== 'request' ? <button type="button" onClick={() => setFinanceReceipt(source)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700">View receipt</button> : null}
                      {source.kind === 'fine' && source.fine.status === 'unpaid' ? <>
                        <button type="button" disabled={busy || !canSettle} title={canSettle ? 'Record cashier payment' : 'Return or resolve the lost item first'} onClick={() => { setFinePaymentReceived(false); setFinePaymentConfirmation(source.fine) }} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 dark:border-slate-700">Record payment</button>
                        <button type="button" disabled={busy || !canSettle} onClick={() => setFineWaiver({ id: source.fine.id, reasonCategory: '', justification: '' })} className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:text-amber-200">Waive</button>
                      </> : null}
                      {source.kind === 'fine' && source.fine.status === 'refund_due' ? <button type="button" disabled={busy} onClick={() => setFineRefundConfirmation({ fine: source.fine, reason: '' })} className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-40 dark:text-amber-200">Record refund</button> : null}
                      {source.kind === 'request' ? <>
                        {source.loan.payment_method === 'cash'
                          ? <button type="button" disabled={processingRequestId !== null} onClick={() => checkout(source.loan.id)} className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-40 dark:border-emerald-700 dark:text-emerald-200">Review &amp; approve</button>
                          : <span className="self-center text-xs text-amber-700 dark:text-amber-300">Legacy online request</span>}
                        <button type="button" disabled={processingRequestId !== null} onClick={() => void rejectRequest(source.loan.id)} className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-800 disabled:opacity-40 dark:border-rose-800 dark:text-rose-200">Reject</button>
                      </> : null}
                    </div>
                  </td>
                </tr>
              })}
              {financeRows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">No transactions match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section> : null}
      {finesOnly && !isAdmin ? <LibrarianDailyRecord
        history={loanHistory}
        fines={physicalFines}
        renewals={physicalRenewals}
        printPayments={printPayments}
        bookName={bookName}
        memberName={memberName}
      /> : null}
      {!requestsOnly && !overviewOnly && !catalogOnly && !policyOnly && !finesOnly && isAdmin ? <>
        <section className={`${panel} flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <h2 className="text-xl font-semibold">Borrowing policy &amp; fine calendar</h2>
            <p className="mt-1 text-sm text-slate-500">Review the physical borrowing rules and maintain holiday dates.</p>
          </div>
          <button type="button" onClick={() => setPolicyModalOpen(true)} className="shrink-0 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
            Manage policy
          </button>
        </section>
      </> : null}
      {policyModalOpen && isAdmin ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPolicyModalOpen(false) }}>
          <section className={`${panel} max-h-[92vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="borrowing-policy-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="borrowing-policy-title" className="text-xl font-semibold">Borrowing policy &amp; fine calendar</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-500">Choose 1, 3, 5, 7, 14, or 30 days when requesting a physical book; each title has its own checkout fee for every period. Late fees use the configured grace period and daily cap. Sundays and listed holidays are excluded, and items overdue for 30 consecutive days are marked lost.</p>
              </div>
              <button type="button" disabled={busy} onClick={() => setPolicyModalOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">Close</button>
            </div>
            <div className="mt-5 grid gap-6">
              {isAdmin ? <form onSubmit={(event) => void saveLibraryPolicy(event)} className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <div>
                  <h3 className="font-semibold">Enforced rules for new physical requests</h3>
                  <p className="mt-1 text-xs text-slate-500">Each new request stores these values. Changes do not recalculate existing loans or fines. Title-specific loan durations and checkout fees stay in the physical catalog.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <label className="text-xs font-medium">Fine grace (days)<input required type="number" min="0" max="30" step="1" value={policyDraft.fineGraceDays} onChange={(event) => setPolicyDraft((current) => ({ ...current, fineGraceDays: event.target.value }))} className={`${input} mt-1`} /></label>
                  <label className="text-xs font-medium">Late fee per day (PHP)<input required type="number" min="0" max="1000" step="0.01" value={policyDraft.lateFeePerDay} onChange={(event) => setPolicyDraft((current) => ({ ...current, lateFeePerDay: event.target.value }))} className={`${input} mt-1`} /></label>
                  <label className="text-xs font-medium">Fine cap per item (PHP)<input required type="number" min="0" max="100000" step="0.01" value={policyDraft.lateFeeCap} onChange={(event) => setPolicyDraft((current) => ({ ...current, lateFeeCap: event.target.value }))} className={`${input} mt-1`} /></label>
                  <label className="text-xs font-medium">Classify lost after (days)<input required type="number" min="1" max="365" step="1" value={policyDraft.lostAfterDays} onChange={(event) => setPolicyDraft((current) => ({ ...current, lostAfterDays: event.target.value }))} className={`${input} mt-1`} /></label>
                  <label className="text-xs font-medium">Default lesson reward (points)<input required type="number" min="0" max="100" step="1" value={policyDraft.facultyLessonRewardPoints} onChange={(event) => setPolicyDraft((current) => ({ ...current, facultyLessonRewardPoints: event.target.value }))} className={`${input} mt-1`} /></label>
                </div>
                <label className="block text-xs font-medium">Student-facing policy and points notice<textarea required maxLength={5000} rows={5} value={policyDraft.policyNotice} onChange={(event) => setPolicyDraft((current) => ({ ...current, policyNotice: event.target.value }))} className={`${input} mt-1`} /><span className="mt-1 block font-normal text-slate-500">{policyDraft.policyNotice.length}/5000 characters. Include the fixed top-up bundle prices and how students or faculty can earn points.</span></label>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {policySettings ? <p className="text-xs text-slate-500">Last saved {new Date(policySettings.updated_at).toLocaleString()}. Top-ups remain fixed at 200 / PHP 10, 500 / PHP 22, and 1,000 / PHP 40.</p> : <p role="status" className="text-xs text-rose-700">Policy settings are unavailable. Apply the policy migration before editing.</p>}
                  <button type="submit" disabled={busy || !policySettings} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Saving...' : 'Save policy'}</button>
                </div>
              </form> : null}
              {isAdmin ? <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700" aria-labelledby="official-holiday-calendar-title">
                <div>
                  <h3 id="official-holiday-calendar-title" className="font-semibold">Official Philippine public holidays</h3>
                  <p className="mt-1 text-xs text-slate-500">Review the Nager.Date calendar before syncing. Confirm newly declared special holidays with official government announcements; local closures can be added as exceptions.</p>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="text-xs font-medium">Calendar year
                    <select value={holidayYear} onChange={(event) => { setHolidayYear(event.target.value); setHolidayPreview(null) }} className={`${input} mt-1`}>
                      {Array.from({ length: 3 }, (_, index) => new Date().getFullYear() + index).map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={busy} onClick={() => void previewHolidayCalendar()} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">{busy ? 'Loading...' : 'Preview holidays'}</button>
                </div>
                {holidayPreview ? <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{holidayPreview.holidays.length} public holidays for {holidayPreview.year}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => setHolidayPreview(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold dark:border-slate-700">Cancel</button>
                      <button type="button" disabled={busy} onClick={() => void syncHolidayCalendar()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Confirm and sync</button>
                    </div>
                  </div>
                  <ul className="mt-2 grid gap-x-6 divide-y divide-slate-200 text-sm dark:divide-slate-700 sm:grid-cols-2 sm:divide-y-0">
                    {holidayPreview.holidays.map((holiday) => <li key={holiday.holiday_date} className="py-1.5 sm:border-b sm:border-slate-200 sm:dark:border-slate-700">
                      {new Date(`${holiday.holiday_date}T12:00:00`).toLocaleDateString()} · {holiday.name}
                    </li>)}
                  </ul>
                  <p className="mt-2 text-xs text-slate-500">Confirming replaces previously synced dates for this year. Local exceptions take precedence and are preserved.</p>
                </div> : null}
                <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <h4 className="text-sm font-semibold">Calendar entries</h4>
                  <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                    {holidays.map((holiday) => <li key={holiday.holiday_date} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>
                        {new Date(`${holiday.holiday_date}T12:00:00`).toLocaleDateString()} · {holiday.name}
                        <span className="ml-2 text-xs text-slate-500">{holiday.source === 'nager' ? 'Official calendar' : 'Local exception'}</span>
                      </span>
                      {holiday.source === 'manual' ? <button type="button" disabled={busy} onClick={() => void deleteHoliday(holiday)} className="text-xs font-semibold text-rose-700 disabled:opacity-50 dark:text-rose-300">Remove</button> : null}
                    </li>)}
                    {holidays.length === 0 ? <li className="py-3 text-sm text-slate-500">No calendar entries yet. Preview a year to import official holidays.</li> : null}
                  </ul>
                </div>
                <details className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <summary className="cursor-pointer text-sm font-semibold">Add a local holiday exception</summary>
                  <form onSubmit={(event) => void submitHoliday(event)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <label className="text-xs font-medium">Date<input required type="date" value={holidayForm.date} onChange={(event) => setHolidayForm({ ...holidayForm, date: event.target.value })} className={`${input} mt-1`} /></label>
                    <label className="text-xs font-medium">Holiday name<input required maxLength={120} value={holidayForm.name} onChange={(event) => setHolidayForm({ ...holidayForm, name: event.target.value })} className={`${input} mt-1`} /></label>
                    <button disabled={busy} className="self-end rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">{busy ? 'Adding...' : 'Add exception'}</button>
                  </form>
                </details>
              </section> : null}
            </div>
          </section>
        </div> : null}

      {!policyOnly && !overviewOnly && !finesOnly ? <section className={panel}>
        <div className="physical-catalog-heading flex flex-wrap items-start justify-between gap-3">
          <div>
            {embeddedAdminDashboard ? <h2 id="physical-catalog" className="sr-only">Physical book catalog</h2> : <h2 id="physical-catalog" className="scroll-mt-6 text-xl font-semibold">Physical book catalog</h2>}
            <p className={`${embeddedAdminDashboard ? '' : 'mt-1'} text-sm text-slate-500`}>{isAdmin ? 'Search titles, inspect copy-level inventory, and manage catalog records.' : 'Search titles, inspect copy-level inventory, and monitor availability. Catalog edits are managed by administrators.'}</p>
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
        <div className="physical-catalog-table mt-4 overflow-x-auto">
          <table className="w-full min-w-[850px] table-fixed text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700">
              <tr>{isAdmin ? <th className="w-[4%] px-2 py-3"><input type="checkbox" aria-label="Select all visible physical catalog records" checked={visibleCatalogIds.length > 0 && visibleCatalogIds.every((id) => selectedCatalogIds.includes(id))} onChange={(event) => setSelectedCatalogIds((current) => event.target.checked ? Array.from(new Set([...current, ...visibleCatalogIds])) : current.filter((id) => !visibleCatalogIds.includes(id)))} /></th> : null}<th className="w-[32%] px-2 py-3 sm:px-3">Book</th><th className="w-[16%] px-2 py-3 sm:px-3">Copies</th><th className="w-[20%] px-2 py-3 sm:px-3">Shelf location</th><th className="w-[28%] px-2 py-3 sm:px-3">Actions</th></tr>
            </thead>
            <tbody>
              {visibleCatalogRows.map((row) => <Fragment key={row.key}><tr className="border-b border-slate-100 align-top dark:border-slate-800">
                {isAdmin ? <td className="px-2 py-3"><input type="checkbox" aria-label={`Select ${row.book.title}`} checked={row.bookIds.every((id) => selectedCatalogIds.includes(id))} onChange={(event) => setSelectedCatalogIds((current) => event.target.checked ? Array.from(new Set([...current, ...row.bookIds])) : current.filter((id) => !row.bookIds.includes(id)))} /></td> : null}
                <td className="break-words px-2 py-3 sm:px-3"><strong>{row.book.title}</strong>{row.book.is_archived ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Archived</span> : null}<span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{row.book.author} · {row.book.category}</span><span className="mt-1 block text-xs capitalize text-slate-500">{row.isbnConflict ? 'ISBN needs review · ' : row.book.isbn ? `ISBN ${row.book.isbn} · ` : ''}{row.book.catalog_type}</span></td>
                <td className="px-2 py-3 sm:px-3"><div className="flex items-baseline gap-2"><strong className="text-lg text-emerald-800 dark:text-emerald-300">{row.available}</strong><span className="text-xs text-slate-600 dark:text-slate-400">available</span></div><div className="mt-1 text-xs text-slate-600 dark:text-slate-400"><strong className="text-slate-800 dark:text-slate-200">{row.total}</strong> total <span className="mx-1 text-slate-400">·</span>{row.borrowed} borrowed</div></td>
                <td className="break-words px-2 py-3 text-xs text-slate-600 dark:text-slate-400 sm:px-3">{row.locations || 'Location not set'}</td>
                <td className="physical-catalog-actions px-2 py-3 sm:px-3"><div className="flex flex-wrap gap-2"><button type="button" aria-expanded={expandedCatalogKey === row.key} onClick={() => setExpandedCatalogKey((current) => current === row.key ? null : row.key)} className="whitespace-nowrap rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">{expandedCatalogKey === row.key ? 'Hide copies' : 'View copies'}</button>{isAdmin ? <button type="button" disabled={busy} onClick={() => setManageBook(row.book)} className="whitespace-nowrap rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Manage title</button> : null}</div></td>
              </tr>{expandedCatalogKey === row.key ? <tr className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/50"><td colSpan={isAdmin ? 5 : 4} className="px-3 py-3"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{row.copies.map((copy) => <article key={copy.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"><div className="min-w-0"><button type="button" onClick={() => setSelectedCopyId(copy.id)} aria-label={`View copy details for ${copy.copy_code}`} className="font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-300">{copy.copy_code}</button><span className="block truncate text-slate-500">{[copy.section, copy.shelf_number && `Shelf ${copy.shelf_number}`, copy.row_number && `Row ${copy.row_number}`, copy.position_number && `Position ${copy.position_number}`, copy.location].filter(Boolean).join(' · ') || 'Location not set'}</span></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 font-semibold capitalize text-slate-700 dark:bg-slate-800 dark:text-slate-200">{copy.status}</span></article>)}{row.copies.length === 0 ? <p className="text-xs text-slate-500">No physical copies registered yet.</p> : null}</div></td></tr> : null}</Fragment>)}
            </tbody>
          </table>
          {visibleCatalogRows.length === 0 ? <p className="py-6 text-sm text-slate-500">No physical titles match this search.</p> : null}
        </div>
        <div className="physical-catalog-mobile-list mt-4">
          {visibleCatalogRows.map((row) => <article key={row.key} className="physical-catalog-mobile-card">
            {isAdmin ? <label className="physical-catalog-mobile-select">
              <input
                type="checkbox"
                aria-label={`Select ${row.book.title}`}
                checked={row.bookIds.every((id) => selectedCatalogIds.includes(id))}
                onChange={(event) => setSelectedCatalogIds((current) => event.target.checked ? Array.from(new Set([...current, ...row.bookIds])) : current.filter((id) => !row.bookIds.includes(id)))}
              />
              <span>Select title</span>
            </label> : null}
            <div className="physical-catalog-mobile-heading">
              <div className="min-w-0">
                <h3>{row.book.title}</h3>
                {row.book.is_archived ? <span className="physical-catalog-mobile-archived">Archived</span> : null}
                <p>{row.book.author} · {row.book.category}</p>
                <p>{row.isbnConflict ? 'ISBN needs review · ' : row.book.isbn ? `ISBN ${row.book.isbn} · ` : ''}{row.book.catalog_type}</p>
              </div>
              <div className="physical-catalog-mobile-availability">
                <strong>{row.available}</strong>
                <span>available</span>
              </div>
            </div>
            <dl className="physical-catalog-mobile-details">
              <div><dt>Inventory</dt><dd>{row.total} total · {row.borrowed} borrowed</dd></div>
              <div><dt>Shelf location</dt><dd>{row.locations || 'Location not set'}</dd></div>
            </dl>
            <div className="physical-catalog-mobile-actions">
              <button type="button" aria-expanded={expandedCatalogKey === row.key} onClick={() => setExpandedCatalogKey((current) => current === row.key ? null : row.key)}>{expandedCatalogKey === row.key ? 'Hide copies' : 'View copies'}</button>
              {isAdmin ? <button type="button" disabled={busy} onClick={() => setManageBook(row.book)}>Manage title</button> : null}
            </div>
            {expandedCatalogKey === row.key ? <div className="physical-catalog-mobile-copies">
              {row.copies.map((copy) => <div key={copy.id}>
                <button type="button" onClick={() => setSelectedCopyId(copy.id)} aria-label={`View copy details for ${copy.copy_code}`} className="text-left font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-300">{copy.copy_code}</button>
                <span>{[copy.section, copy.shelf_number && `Shelf ${copy.shelf_number}`, copy.row_number && `Row ${copy.row_number}`, copy.position_number && `Position ${copy.position_number}`, copy.location].filter(Boolean).join(' · ') || 'Location not set'}</span>
                <span className="physical-catalog-mobile-copy-status">{copy.status}</span>
              </div>)}
              {row.copies.length === 0 ? <p>No physical copies registered yet.</p> : null}
            </div> : null}
          </article>)}
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
        variant="drawer"
      >
        {manageBook ? <>
          <section aria-label="Physical book metadata" className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Book details</h3>
            <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <div><dt className="text-xs font-semibold text-slate-600 dark:text-slate-300">ISBN</dt><dd className="mt-1 break-all text-sm font-medium text-slate-900 dark:text-slate-100">{manageBook.isbn || 'Not listed'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-600 dark:text-slate-300">Format</dt><dd className="mt-1 text-sm font-medium capitalize text-slate-900 dark:text-slate-100">{manageBook.catalog_type}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-600 dark:text-slate-300">Subject</dt><dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{manageBook.discipline || manageBook.category || manageBook.genre || 'Not set'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-600 dark:text-slate-300">Catalog status</dt><dd className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{manageBook.is_archived ? 'Archived' : 'Active'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-600 dark:text-slate-300">Description</dt><dd className="mt-1 text-sm leading-5 text-slate-900 dark:text-slate-100">{manageBook.description || 'No description has been added.'}</dd></div>
            </dl>
          </section>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
            <button type="button" onClick={() => { const book = manageBook; setManageBook(null); setEditingBook(book); setEditBookForm({ title: book.title, author: book.author, category: book.discipline || book.category || book.genre || '', genre: book.genre ?? '', isbn: book.isbn ?? '', description: book.description ?? '' }) }} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">Edit details</button>
            <button type="button" onClick={() => { const book = manageBook; setManageBook(null); setPendingAction({ type: 'archiveBook', id: book.id, title: book.title, archived: !book.is_archived }) }} className={`rounded-xl px-4 py-3 text-sm font-bold text-white shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${manageBook.is_archived ? 'bg-emerald-700 hover:bg-emerald-800 focus-visible:outline-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500' : 'bg-rose-700 hover:bg-rose-800 focus-visible:outline-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500'}`}><span>{manageBook.is_archived ? 'Restore to catalog' : 'Archive'}</span></button>
            {isAdmin && manageBook.is_archived ? <button type="button" onClick={() => { const book = manageBook; setManageBook(null); setPendingAction({ type: 'deleteBook', id: book.id, title: book.title, archived: true }) }} className="rounded-xl border border-rose-400 px-4 py-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300">Delete permanently</button> : null}
          </div>
        </> : null}
      </BaseModal>

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

      {openPanel === 'requests' ? <div className="physical-requests-modal fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setOpenPanel(null); onClose?.() } }}>
        <section className={`${panel} max-h-[90vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="physical-requests-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="physical-requests-title" className="text-xl font-semibold">Physical book requests</h2>
              <p className="mt-1 text-sm text-slate-500">Review cash requests, collect payment at checkout, and issue receipts.</p>
            </div>
            <button type="button" onClick={() => { setOpenPanel(null); onClose?.() }} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close requests</button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">Showing {filteredWaitingLoans.length} of {queueLoans.length} pending requests.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder="Search member, book, or request ID..." aria-label="Search physical requests" className={`${input} sm:min-w-80`} />
              <select value={requestStatus} onChange={(event) => setRequestStatus(event.target.value as RequestQueueFilter)} aria-label="Filter physical requests by operational state" className={input}>
                <option value="all">All work items</option><option value="cash_requests">Cash checkout requests</option><option value="legacy_online">Legacy online requests</option><option value="availability_alerts">Availability alerts</option>
              </select>
            </div>
          </div>
        <div className="mt-4 space-y-3">
          {visibleWaitingLoans.map((loan) => <article key={loan.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><strong>{bookName(loan.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(loan.student_id)}</p><p className="mt-1 text-xs text-slate-500">Pending request · {loan.duration_days} days · ₱{Number(loan.fee_amount).toFixed(2)} · {loan.payment_method === 'cash' ? 'Cash at desk' : 'Legacy online payment'}</p>{loan.payment_method !== 'cash' ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Cannot be checked out. Reject this request and ask the member to submit a new cash request.</p> : null}</div>
              <div className="flex flex-wrap gap-2">{loan.payment_method === 'cash' ? <button disabled={processingRequestId !== null} type="button" onClick={() => checkout(loan.id)} className="physical-review-action rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50">{processingRequestId === loan.id ? 'Processing...' : 'Review & approve'}</button> : null}<button disabled={processingRequestId !== null} type="button" onClick={() => void rejectRequest(loan.id)} className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50">Reject request</button></div>
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
          <label className="mt-4 block text-sm font-medium">Find an active loan<input type="search" value={checkedOutSearch} onChange={(event) => setCheckedOutSearch(event.target.value)} placeholder="Student ID, member, book, or request ID..." className={`${input} mt-1`} /></label>
          <div className="mt-3 space-y-3">
          {visibleActiveLoans.map((loan) => <article key={loan.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div><strong>{bookName(loan.book_id)}</strong><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{memberName(loan.student_id)}</p><p className="mt-1 text-xs text-slate-500">{loan.status === 'return_pending' ? 'RETURN REQUEST · AWAITING LIBRARIAN CONFIRMATION · ' : ''}Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'} · Receipt {loan.receipt_number ?? '—'}{loan.due_date && new Date(loan.due_date) < new Date() ? ' · OVERDUE' : ''}</p></div>
            {librarianMode ? <div className="flex flex-wrap gap-2">
              {loan.status === 'checked_out' ? <button disabled={busy || processingRequestId !== null} type="button" onClick={() => focusDeskLoanAction(loan.id, 'renew')} className="rounded-xl border border-emerald-300 px-3 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-200">Verify ID & renew</button> : null}
              <button disabled={busy || processingRequestId !== null} type="button" onClick={() => focusDeskLoanAction(loan.id, 'return')} className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-600">Verify ID & return</button>
            </div> : <div className="flex flex-wrap items-end gap-2">
              {loan.status === 'checked_out' ? <button disabled={busy || processingRequestId !== null || !deskIdentityMatches(loan.student_id) || selectedDeskMemberOverdue || selectedDeskMemberUnpaid > 0} title={!deskIdentityMatches(loan.student_id) ? 'Verify this borrower’s institutional ID card first' : 'Renew at the configured fee for the selected period'} type="button" onClick={() => openRenewal(loan)} className="rounded-xl border border-emerald-300 px-3 py-2.5 text-sm font-semibold text-emerald-800 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-200">Renew</button> : null}
              <fieldset className="grid min-w-full gap-2 sm:grid-cols-3">
                <legend className="mb-1 text-xs font-semibold">Return outcome</legend>
                {outcomeOptions.map((option) => <WorkflowChoice
                  key={option.value}
                  title={option.title}
                  description={option.description}
                  selected={(returnConditions[loan.id] ?? 'available') === option.value}
                  onSelect={() => setReturnConditions((current) => ({ ...current, [loan.id]: option.value }))}
                />)}
              </fieldset>
              <button disabled={busy} type="button" onClick={() => void closeLoan(loan.id)} className="rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{returnConditions[loan.id] === 'lost' ? 'Assess lost item' : returnConditions[loan.id] === 'damaged' ? 'Inspect damage' : loan.status === 'return_pending' ? 'Confirm good return' : 'Record good return'}</button>
            </div>}
          </article>)}
          {visibleActiveLoans.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800">{activeLoans.length === 0 ? 'No checked-out copies.' : 'No active loans match this search.'}</p> : null}
          </div>
          {activeLoans.length === 0 ? <p className="text-sm text-slate-500">No books are currently checked out.</p> : null}
        </div>
        </section>
      </div> : null}

      {openPanel === 'history' ? <div className="physical-history-modal fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPanel(null) }}>
        <section className={`${panel} max-h-[92vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="circulation-history-catalog-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="circulation-history-catalog-title" className="text-xl font-semibold">Physical loan history</h2><p className="mt-1 text-sm text-slate-500">Completed checkouts, returns, due dates, and copy condition.</p></div><button type="button" onClick={() => setOpenPanel(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <input type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search title, author, ISBN, or subject..." aria-label="Search physical-book history" className={`${input} mt-4`} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {historyBookRows.map(({ book, records, active, returned, available }) => <button key={book.id} type="button" onClick={() => setHistoryDetailBookId(book.id)} className="rounded-2xl border border-slate-200 p-4 text-left text-slate-900 transition hover:border-emerald-600 hover:bg-emerald-50 dark:border-slate-700 dark:hover:border-emerald-400 dark:hover:bg-emerald-950/30"><div className="flex items-start justify-between gap-3"><div><strong className="block text-slate-900">{book.title}</strong><span className="mt-1 block text-xs text-slate-600">{book.author} · {book.category}</span></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-200">{records.length} records</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600"><span><strong className="block text-base text-slate-900">{active}</strong>Active</span><span><strong className="block text-base text-slate-900">{returned}</strong>Returned</span><span><strong className="block text-base text-slate-900">{available}</strong>Available</span></div><span className="mt-4 block text-xs font-semibold text-emerald-700 dark:text-emerald-300">Open history →</span></button>)}
          </div>
          {historyBookRows.length === 0 ? <p className="py-8 text-sm text-slate-500">No physical titles match your search.</p> : null}
        </section>
        {selectedHistoryBook ? <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryDetailBookId(null) }}><section className={`${panel} max-h-[92vh] w-full max-w-5xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="book-history-title"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">Book history</p><h2 id="book-history-title" className="mt-1 text-xl font-semibold">{selectedHistoryBook.title}</h2><p className="mt-1 text-sm text-slate-500">{selectedHistoryRows.length} circulation record{selectedHistoryRows.length === 1 ? '' : 's'} · {selectedHistoryBook.author}</p></div><button type="button" onClick={() => setHistoryDetailBookId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] table-fixed text-left text-xs sm:text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700"><tr><th className="w-[27%] px-2 py-3">Borrower / copy</th><th className="w-[24%] px-2 py-3">Checkout / due</th><th className="w-[24%] px-2 py-3">Return</th><th className="w-[25%] px-2 py-3">Status / receipt</th></tr></thead><tbody>{selectedHistoryRows.map((loan) => <tr key={loan.id} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="break-words px-2 py-3"><strong className="block">{memberName(loan.student_id)}</strong><span className="text-slate-500">{copyCode(loan.copy_id)}</span></td><td className="break-words px-2 py-3"><span className="block">{new Date(loan.checked_out_at).toLocaleString()}</span><span className="text-slate-500">Due {new Date(loan.due_date).toLocaleDateString()}</span></td><td className="break-words px-2 py-3"><span className="block">{loan.returned_at ? new Date(loan.returned_at).toLocaleString() : 'Not returned'}</span><span className="text-slate-500">{loan.return_condition ? `Condition: ${loan.return_condition}` : `${loan.duration_days} days`}</span></td><td className="break-words px-2 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${loan.status === 'returned' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : loan.status === 'lost' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'}`}>{loan.status.replace('_', ' ')}</span><span className="mt-1 block text-slate-500">Receipt {loan.receipt_number ?? '—'}</span></td></tr>)}</tbody></table></div>{selectedHistoryRows.length === 0 ? <p className="py-8 text-sm text-slate-500">This book has no completed checkout records yet.</p> : null}</section></div> : null}
      </div> : null}
      <BaseModal
        open={selectedCopy !== null}
        title={selectedCopy ? `Copy details · ${selectedCopy.copy_code}` : 'Copy details'}
        eyebrow="Physical inventory"
        description={selectedCopy ? `${bookName(selectedCopy.book_id)} · Copy record #${selectedCopy.id}` : undefined}
        onClose={() => setSelectedCopyId(null)}
        size="lg"
        layer="foreground"
      >
        {selectedCopy ? <>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500 dark:text-slate-400">Current status</dt><dd className="mt-1 font-semibold capitalize">{selectedCopy.status.replace('_', ' ')}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-xs text-slate-500 dark:text-slate-400">Shelf location</dt><dd className="mt-1 font-semibold">{[selectedCopy.section, selectedCopy.shelf_number && `Shelf ${selectedCopy.shelf_number}`, selectedCopy.row_number && `Row ${selectedCopy.row_number}`, selectedCopy.position_number && `Position ${selectedCopy.position_number}`, selectedCopy.location].filter(Boolean).join(' · ') || 'Not set'}</dd></div>
          </dl>
          {selectedCopyCurrentLoan ? <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <h3 className="text-sm font-semibold">Current borrower</h3>
            <p className="mt-1 text-sm">{memberName(selectedCopyCurrentLoan.student_id)}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{selectedCopyCurrentLoan.status === 'return_pending' ? 'Return awaiting librarian confirmation' : 'Checked out'} · Due {selectedCopyCurrentLoan.due_date ? new Date(selectedCopyCurrentLoan.due_date).toLocaleDateString() : '—'}</p>
          </section> : <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">No active borrower. Checkout, return, and incident workflows update this copy’s status.</p>}
          <section className="mt-5">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Circulation history</h3><span className="text-xs text-slate-500">{selectedCopyHistory.length} record{selectedCopyHistory.length === 1 ? '' : 's'}</span></div>
            {selectedCopyHistory.length ? <ol className="mt-3 space-y-2">{selectedCopyHistory.map((loan) => <li key={loan.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong>{memberName(loan.student_id)}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize dark:bg-slate-800">{loan.status.replace('_', ' ')}</span></div>
              <p className="mt-1 text-xs text-slate-500">Checked out {new Date(loan.checked_out_at).toLocaleDateString()} · Due {new Date(loan.due_date).toLocaleDateString()}{loan.returned_at ? ` · Returned ${new Date(loan.returned_at).toLocaleDateString()}` : ''}</p>
              <p className="mt-1 text-xs text-slate-500">{loan.return_condition ? `Return condition: ${loan.return_condition}` : `${loan.duration_days} days`} · Receipt {loan.receipt_number ?? '—'}</p>
            </li>)}</ol> : <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800">No completed checkout records for this copy yet.</p>}
          </section>
          {qrImages[selectedCopy.qr_token] ? <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <a href={qrImages[selectedCopy.qr_token]} target="_blank" rel="noreferrer" className="text-sm font-semibold text-sky-700 underline dark:text-sky-300">Open QR label</a>
            <a href={qrImages[selectedCopy.qr_token]} download={`${selectedCopy.copy_code}-qr.png`} className="text-sm font-semibold text-sky-700 underline dark:text-sky-300">Download QR</a>
            <button type="button" onClick={() => printQrLabels([selectedCopy])} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Print QR</button>
          </div> : null}
        </> : null}
      </BaseModal>

      {copyDetailsBookId !== null ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCopyDetailsBookId(null) }}>
        <section className={`${panel} physical-copies-dialog max-h-[90vh] w-full max-w-4xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="copy-details-title">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="copy-details-title" className="text-xl font-semibold">Copies for {bookName(copyDetailsBookId)}</h2><p className="mt-1 text-sm text-slate-500">Open, download, or print a QR label for any copy.</p></div><div className="flex gap-2"><button type="button" disabled={!detailCopies.some((copy) => qrImages[copy.qr_token])} onClick={() => printQrLabels(detailCopies)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Print all labels</button><button type="button" onClick={() => setCopyDetailsBookId(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div></div>
          <div className="mt-4 overflow-hidden"><table className="w-full table-fixed text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-700"><tr><th className="w-[14%] px-2 py-3 sm:px-3">Copy</th><th className="w-[18%] px-2 py-3 sm:px-3">QR label</th><th className="w-[34%] px-2 py-3 sm:px-3">Location</th><th className="w-[12%] px-2 py-3 sm:px-3">Status</th><th className="w-[22%] px-2 py-3 sm:px-3">Actions</th></tr></thead><tbody>{detailCopies.map((copy) => { const draft = locationDrafts[copy.id] ?? { section: copy.section ?? '', shelf: copy.shelf_number ?? '', row: copy.row_number ?? '', position: copy.position_number ?? '' }; return <tr key={copy.id} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="break-words px-2 py-3 sm:px-3"><button type="button" onClick={() => setSelectedCopyId(copy.id)} aria-label={`View copy details for ${copy.copy_code}`} className="font-semibold text-sky-700 underline-offset-2 hover:underline dark:text-sky-300">{copy.copy_code}</button></td><td className="px-2 py-3 sm:px-3">{qrImages[copy.qr_token] ? <a href={qrImages[copy.qr_token]} target="_blank" rel="noreferrer" aria-label={`Open QR image for ${copy.copy_code}`}><img src={qrImages[copy.qr_token]} alt={`QR label for ${copy.copy_code}`} className="h-12 w-12 rounded border border-slate-200 bg-white p-1 sm:h-16 sm:w-16 dark:border-slate-700" /></a> : <span className="text-xs text-slate-500">Generating...</span>}</td><td className="px-2 py-3 sm:px-3"><div className="grid grid-cols-2 gap-1"><input aria-label={`${copy.copy_code} section`} placeholder="Section" value={draft.section} onChange={(event) => setLocationDrafts({ ...locationDrafts, [copy.id]: { ...draft, section: event.target.value } })} className={`${input} min-w-0`} /><input aria-label={`${copy.copy_code} shelf`} placeholder="Shelf" value={draft.shelf} onChange={(event) => setLocationDrafts({ ...locationDrafts, [copy.id]: { ...draft, shelf: event.target.value } })} className={`${input} min-w-0`} /><input aria-label={`${copy.copy_code} row`} placeholder="Row" value={draft.row} onChange={(event) => setLocationDrafts({ ...locationDrafts, [copy.id]: { ...draft, row: event.target.value } })} className={`${input} min-w-0`} /><input aria-label={`${copy.copy_code} position`} placeholder="Position" value={draft.position} onChange={(event) => setLocationDrafts({ ...locationDrafts, [copy.id]: { ...draft, position: event.target.value } })} className={`${input} min-w-0`} /></div></td><td className="break-words px-2 py-3 capitalize sm:px-3">{copy.status}</td><td className="px-2 py-3 sm:px-3"><div className="flex flex-col gap-2">{qrImages[copy.qr_token] ? <><a href={qrImages[copy.qr_token]} download={`${copy.copy_code}-qr.png`} className="text-xs font-semibold text-sky-700 underline dark:text-sky-300">Download QR</a><button type="button" onClick={() => printQrLabels([copy])} className="rounded-lg border border-slate-300 px-2 py-1 text-left text-xs font-semibold dark:border-slate-700">Print QR</button></> : <span className="text-xs text-slate-500">QR generating</span>}<button type="button" disabled={busy} onClick={() => void saveCopyLocation(copy)} className="rounded-lg border border-slate-300 px-2 py-1 text-left text-xs font-semibold disabled:opacity-50 dark:border-slate-700">Save location</button></div></td></tr> })}</tbody></table></div>
        </section>
      </div> : null}
      {editingBook ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingBook(null) }}>
        <form onSubmit={(event) => void saveBookDetails(event)} className={`${panel} max-h-[90vh] w-full max-w-2xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="edit-physical-book-title">
          <div className="flex items-start justify-between gap-4"><div><h2 id="edit-physical-book-title" className="text-xl font-semibold">Edit physical book</h2><p className="mt-1 text-sm text-slate-500">Update the catalog details connected to this title.</p></div><button type="button" onClick={() => setEditingBook(null)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Subject<input required maxLength={120} value={editBookForm.category} onChange={(event) => setEditBookForm({ ...editBookForm, category: event.target.value })} className={`${input} mt-1`} /></label><div><label className="text-sm font-medium">ISBN<input maxLength={32} value={editBookForm.isbn} onChange={(event) => setEditBookForm({ ...editBookForm, isbn: event.target.value })} className={`${input} mt-1`} /></label><button type="button" onClick={generateEditBookIsbn} className="mt-2 text-xs font-semibold text-emerald-800 underline dark:text-emerald-300">Generate ISBN-13</button><p className="mt-1 text-[11px] text-slate-500">Internal catalog ID, not a publisher-assigned ISBN.</p></div></div>
          <label className="mt-3 block text-sm font-medium">Description<textarea maxLength={3000} rows={4} value={editBookForm.description} onChange={(event) => setEditBookForm({ ...editBookForm, description: event.target.value })} className={`${input} mt-1`} /></label>
          <button disabled={busy} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{busy ? 'Saving...' : 'Save details'}</button>
        </form>
      </div> : null}
      {openPanel === 'lost' ? <div className="physical-lost-modal fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPanel(null) }}>
        <section className={`${panel} max-h-[92vh] w-full max-w-4xl overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="lost-items-title">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="lost-items-title" className="text-xl font-semibold">Lost and damage cases</h2><p className="mt-1 text-sm text-slate-500">Keep copy recovery, condition review, financial assessment, and cash collection as separately recorded decisions.</p></div><button type="button" onClick={() => { setSelectedLostCaseId(null); setOpenPanel(null) }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close cases</button></div>
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
          const condition = lostResolution[selectedLostCaseId] ?? ''
          const fineDraft = lostFineDrafts[selectedLostCaseId] ?? { amount: '', reason: '' }
          const recoveryDraft = recoveryDamageDrafts[selectedLostCaseId] ?? { amount: '', reason: '' }
          return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/65 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelectedLostCaseId(null) }}>
            <section className={`${panel} max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto`} role="dialog" aria-modal="true" aria-labelledby="lost-case-resolution-title">
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100" aria-label="Case workflow guidance">
                <p className="font-semibold">{isDamageCase ? 'Damage case: inspect → assess → disposition' : 'Lost item: assess → recover or close unresolved'}</p>
                <p className="mt-1">{isDamageCase
                  ? hasIncidentAssessment
                    ? 'Assessment is recorded. Keep the copy unavailable until repair is complete, then record the repair or withdrawal. Collect or waive any charge separately in Transactions.'
                    : 'Record the staff assessment or a no-charge decision first. Repair or withdrawal is a separate inventory decision; collect any charge separately.'
                  : 'Only confirm recovery when the physical copy is returned to the library. Recovery waives an unpaid replacement charge or creates a refund due for a paid one; late fees remain separate.'}</p>
              </div>
              <div className="flex items-start justify-between gap-4"><div><h3 id="lost-case-resolution-title" className="text-lg font-semibold">{isSolvedCase ? 'Solved physical case' : isDamageCase ? 'Review damage case' : 'Resolve lost-item case'}</h3><p className="mt-1 text-sm text-slate-500">{bookName(selectedLostLoan.book_id)} · {copyCode(selectedLostLoan.copy_id)} · Case #{selectedLostLoan.id}</p></div><button type="button" disabled={busy} onClick={() => setSelectedLostCaseId(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">Close</button></div>
              <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800 sm:grid-cols-2"><p><span className="block text-xs text-slate-500">Borrower</span><strong>{memberName(selectedLostLoan.student_id)}</strong></p><p><span className="block text-xs text-slate-500">Due date</span><strong>{selectedLostLoan.due_date ? new Date(selectedLostLoan.due_date).toLocaleDateString() : '—'}</strong></p><p className="sm:col-span-2"><span className="block text-xs text-slate-500">Inspection notes</span>{selectedLostLoan.incident_note || 'No notes recorded.'}</p></div>
              {isSolvedCase ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20"><p className="text-sm font-semibold">{selectedLostLoan.incident_status === 'withdrawn' ? 'Case closed unresolved' : 'Case resolved'}</p><p className="mt-1 text-sm">{selectedLostLoan.incident_resolved_at ? new Date(selectedLostLoan.incident_resolved_at).toLocaleString() : 'Resolution recorded'}{selectedLostLoan.incident_resolved_by ? ` by ${memberName(selectedLostLoan.incident_resolved_by)}` : ''}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{selectedLostLoan.incident_note || 'No case notes recorded.'}</p>{incidentFine ? <p className="mt-2 text-sm">{fineTypeLabel(incidentFine.fine_type)}: PHP {Number(incidentFine.amount).toFixed(2)} - {incidentFine.status.replace(/_/g, ' ')}{incidentFine.receipt_number ? ` - Receipt ${incidentFine.receipt_number}` : ''}</p> : null}</div> : isDamageCase ? <div className="rounded-xl border border-amber-200 p-3 dark:border-amber-900"><p className="text-sm font-semibold">Damage assessment</p>{hasIncidentAssessment ? <><p className="mt-2 text-sm">Assessed: PHP {Number(incidentFine?.amount ?? selectedLostLoan.incident_assessed_amount ?? 0).toFixed(2)} · {Number(incidentFine?.amount ?? selectedLostLoan.incident_assessed_amount ?? 0) === 0 ? 'No charge' : incidentFine?.status ?? 'Charge recorded'}</p>{incidentFine?.status === 'paid' ? <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">The damage charge is paid. Record the repair or withdrawal decision to close the case.</p> : null}<label className="mt-3 block text-sm font-medium">Copy disposition<select value={condition} onChange={(event) => setLostResolution((current) => ({ ...current, [selectedLostCaseId]: event.target.value as 'available' | 'damaged' | 'withdrawn' }))} className={`${input} mt-1`}><option value="available">Repaired · return to circulation</option><option value="damaged">Still damaged · keep unavailable</option><option value="withdrawn">Withdraw from collection</option></select></label><label className="mt-3 block text-sm font-medium">Repair / disposition note<textarea maxLength={500} rows={2} value={recoveryDraft.reason} onChange={(event) => setRecoveryDamageDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...recoveryDraft, reason: event.target.value } }))} placeholder="Describe repairs or withdrawal reason" className={`${input} mt-1`} /></label><button type="button" disabled={busy || !recoveryDraft.reason.trim()} onClick={() => void resolveDamageCase(selectedLostCaseId)} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Save disposition</button></> : <div className="mt-3 grid gap-3"><label className="text-sm font-medium">Assessed damage charge (PHP)<input type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={fineDraft.amount} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...fineDraft, amount: event.target.value } }))} placeholder="0 if no charge" className={`${input} mt-1`} /></label><label className="text-sm font-medium">Assessment decision and reason<textarea maxLength={500} rows={3} value={fineDraft.reason} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...fineDraft, reason: event.target.value } }))} placeholder="Describe the damage assessment, or why no charge applies" className={`${input} mt-1`} /></label><button type="button" disabled={busy || !fineDraft.amount.trim() || !fineDraft.reason.trim()} onClick={() => void assessPhysicalIncident(selectedLostCaseId)} className="justify-self-start rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Save assessment</button></div>}{incidentFine?.receipt_number ? <p className="mt-2 font-mono text-xs">Receipt {incidentFine.receipt_number}</p> : null}</div> : <>
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-sm font-semibold">Replacement assessment</p>{incidentFine ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">₱{Number(incidentFine.amount).toFixed(2)} · {incidentFine.status.replace(/_/g, ' ')}{incidentFine.receipt_number ? ` · Receipt ${incidentFine.receipt_number}` : ''}</p> : selectedLostLoan.incident_assessed_at ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Reviewed with no replacement charge.</p> : <p className="mt-1 text-xs text-slate-500">No decision recorded. Late fees remain separate.</p>}{hasUnpaidLateFee ? <p className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300">A separate late fee is still unpaid.</p> : null}{incidentFine?.status === 'paid' ? <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">The charge is paid. This case still needs a {isDamageCase ? 'repair or withdrawal decision' : 'recovery or closure decision'}.</p> : null}{incidentFine && (onOpenFines || requestsOnly) ? <button type="button" onClick={() => { if (requestsOnly) { setSelectedLostCaseId(null); setOpenPanel(null); window.setTimeout(() => document.getElementById('physical-transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0) } else onOpenFines?.() }} className="mt-2 text-xs font-semibold text-emerald-800 underline dark:text-emerald-300">Open transactions and receipts</button> : null}
                  {!hasIncidentAssessment ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Amount (₱)<input type="number" min="0" max="100000" step="0.01" inputMode="decimal" value={fineDraft.amount} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...fineDraft, amount: event.target.value } }))} placeholder="0 if no charge" className={`${input} mt-1`} /></label><label className="text-sm font-medium sm:col-span-2">Assessment reason<textarea maxLength={500} rows={2} value={fineDraft.reason} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...fineDraft, reason: event.target.value } }))} placeholder="Why is a replacement charge assessed, or why is no charge needed?" className={`${input} mt-1`} /></label><button type="button" disabled={busy || !fineDraft.amount.trim() || !fineDraft.reason.trim()} onClick={() => void assessPhysicalIncident(selectedLostCaseId)} className="justify-self-start rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50 dark:border-rose-900 dark:text-rose-200">Save assessment</button></div> : null}
                </div>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-semibold">What happened to the copy?</legend>
                  {lostRecoveryOptions.map((option) => <WorkflowChoice
                    key={option.value}
                    title={option.title}
                    description={option.description}
                    selected={condition === option.value}
                    onSelect={() => setLostResolution((current) => ({ ...current, [selectedLostCaseId]: option.value }))}
                  />)}
                </fieldset>
                {condition === 'damaged' ? <label className="block text-sm font-medium">Recovery inspection note<textarea required maxLength={500} rows={2} value={recoveryDraft.reason} onChange={(event) => setRecoveryDamageDrafts((current) => ({ ...current, [selectedLostCaseId]: { ...recoveryDraft, reason: event.target.value } }))} placeholder="Describe the damage on the recovered copy" className={`${input} mt-1`} /></label> : null}
                <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => setSelectedLostCaseId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">Cancel</button><button type="button" disabled={busy || !condition || (condition === 'damaged' && !recoveryDraft.reason.trim())} onClick={() => void executeResolveLostLoan(selectedLostCaseId)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{condition === 'withdrawn' ? 'Close unresolved case' : 'Confirm recovery'}</button></div>
              </>}
              {isSolvedCase ? null : isDamageCase ? <div className="flex justify-end"><button type="button" onClick={() => setSelectedLostCaseId(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700">Done</button></div> : null}
            </section>
          </div>
        })() : null}
      </div> : null}
    </div>
    <ActionModal
        open={lostFineLoanId !== null}
        title={lostFineLoanId !== null && returnConditions[lostFineLoanId] === 'lost' ? 'Open lost-item case' : 'Record damaged return'}
        description={lostFineLoanId !== null ? returnConditions[lostFineLoanId] === 'damaged'
          ? `${bookName(loans.find((loan) => loan.id === lostFineLoanId)?.book_id ?? 0)} will be recorded as returned but kept unavailable for damage review. This step records the inspection note only; assess any charge separately in the case, then record payment in Transactions.`
          : `${bookName(loans.find((loan) => loan.id === lostFineLoanId)?.book_id ?? 0)} will be marked lost and assessed now. The charge will appear as a separate unpaid transaction.` : undefined}
        confirmLabel={lostFineLoanId !== null && returnConditions[lostFineLoanId] === 'lost' ? 'Mark lost and assess' : 'Save inspection'}
        busy={busy}
        confirmDisabled={lostFineLoanId !== null && (!lostFineDrafts[lostFineLoanId]?.reason.trim()
          || (returnConditions[lostFineLoanId] === 'lost' && (!lostFineDrafts[lostFineLoanId]?.amount.trim()
            || !Number.isFinite(Number(lostFineDrafts[lostFineLoanId]?.amount))
            || Number(lostFineDrafts[lostFineLoanId]?.amount) <= 0
            || Number(lostFineDrafts[lostFineLoanId]?.amount) > 100000))
          || !deskIdentityMatches(loans.find((loan) => loan.id === lostFineLoanId)?.student_id ?? ''))}
        onClose={() => { if (lostFineLoanId !== null) setReturnConditions((current) => ({ ...current, [lostFineLoanId]: 'available' })); setLostFineLoanId(null) }}
        onConfirm={() => { if (lostFineLoanId !== null) void executeCloseLoan(lostFineLoanId) }}
      >
        {lostFineLoanId !== null ? <div className="grid gap-3">
          <p className="text-sm font-medium">Borrower: {memberName(loans.find((loan) => loan.id === lostFineLoanId)?.student_id ?? '')}</p>
          <p className="text-xs text-slate-500">{deskIdentityMatches(loans.find((loan) => loan.id === lostFineLoanId)?.student_id ?? '') ? 'Institutional ID presentation confirmed.' : 'Search for this borrower, visually verify their institutional ID card, and confirm the check before saving.'}</p>
          {returnConditions[lostFineLoanId] === 'lost' ? <label className="text-sm font-medium">Staff-assessed replacement charge (PHP)
            <input type="number" required min="0.01" max="100000" step="0.01" inputMode="decimal" value={lostFineDrafts[lostFineLoanId]?.amount ?? ''} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [lostFineLoanId]: { ...(current[lostFineLoanId] ?? { amount: '', reason: '' }), amount: event.target.value } }))} placeholder="Enter the assessed amount" className={`${input} mt-1`} />
          </label> : null}
          <label className="text-sm font-medium">{returnConditions[lostFineLoanId] === 'lost' ? 'Assessment reason and inspection note' : 'Damage inspection note'}
            <textarea required maxLength={500} rows={3} value={lostFineDrafts[lostFineLoanId]?.reason ?? ''} onChange={(event) => setLostFineDrafts((current) => ({ ...current, [lostFineLoanId]: { ...(current[lostFineLoanId] ?? { amount: '', reason: '' }), reason: event.target.value } }))} placeholder={returnConditions[lostFineLoanId] === 'lost' ? 'Explain the lost-item assessment' : 'Describe the damage and repair needed'} className={`${input} mt-1`} />
          </label>
        </div> : null}
      </ActionModal>
    <ActionModal
      open={checkoutLoan !== null}
      title="Review physical-book request"
      description="Verify the borrower, scan or enter the exact copy accession tag, collect the configured cash fee, and issue that copy."
      confirmLabel="Record cash & issue receipt"
      busy={checkoutLoan !== null && processingRequestId === checkoutLoan.id}
      confirmDisabled={checkoutLoan !== null && (!deskIdentityMatches(checkoutLoan.student_id)
        || !copies.some((copy) => copy.book_id === checkoutLoan.book_id
          && copy.copy_code === checkoutCopyCode.trim() && copy.status === 'available')
        || (Number(checkoutLoan.fee_amount) > 0 && !checkoutCashReceived))}
      onClose={() => { setCheckoutLoan(null); setCheckoutCopyCode(''); setCheckoutCashReceived(false) }}
      onConfirm={() => {
        if (!checkoutLoan) return
        const loanId = checkoutLoan.id
        const selectedCopy = copies.find((copy) => copy.book_id === checkoutLoan.book_id
          && copy.copy_code === checkoutCopyCode.trim() && copy.status === 'available')
        if (!selectedCopy) {
          setError('Select an available copy of the requested title before completing checkout.')
          return
        }
        const configuredAmount = Number(checkoutLoan.fee_amount)
        void executeCheckout(loanId, selectedCopy.copy_code, configuredAmount, checkoutNotes)
        setCheckoutLoan(null)
      }}
    >
      {checkoutLoan ? (() => {
        const checkoutMember = profiles.find((profile) => profile.id === checkoutLoan.student_id)
        return <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:col-span-2">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-lg font-semibold dark:bg-slate-800">
              {checkoutMember?.student_photo_path ? <img src={`/api/admin/students/${checkoutMember.id}/photo`} alt={`Headshot of ${checkoutMember.full_name || checkoutMember.email}`} className="h-full w-full object-cover" /> : (checkoutMember?.full_name || checkoutMember?.email || 'M').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold">{memberName(checkoutLoan.student_id)}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">Member ID: {checkoutMember?.institutional_id || 'Not recorded'}</p>
              <p className="text-xs text-slate-500">{checkoutMember?.email || 'Member profile unavailable'}</p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" checked={deskIdentityMatches(checkoutLoan.student_id)} onChange={(event) => {
              setDeskMemberId(event.target.checked ? checkoutLoan.student_id : '')
              setDeskIdCardPresented(event.target.checked)
            }} className="mt-0.5" />
            <span>I confirm the member presented their physical institutional ID and I matched it to the profile above.</span>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Book
            <input readOnly value={bookName(checkoutLoan.book_id)} className={`${input} mt-1 bg-slate-100 dark:bg-slate-800`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Copy accession tag
            <input
              required
              autoComplete="off"
              list="checkout-available-copies"
              value={checkoutCopyCode}
              onChange={(event) => setCheckoutCopyCode(event.target.value)}
              placeholder="Scan or enter the copy tag"
              className={`${input} mt-1`}
            />
            <datalist id="checkout-available-copies">
              {copies.filter((copy) => copy.book_id === checkoutLoan.book_id && copy.status === 'available')
                .map((copy) => <option key={copy.id} value={copy.copy_code}>{copy.location ? `${copy.copy_code} · ${copy.location}` : copy.copy_code}</option>)}
            </datalist>
            <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
              {copies.some((copy) => copy.book_id === checkoutLoan.book_id && copy.status === 'available')
                ? 'Only available copies of this title can be issued.'
                : 'No copies are currently available for this title.'}
            </span>
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Loan period
            <input readOnly value={`${checkoutLoan.duration_days} days`} className={`${input} mt-1 bg-slate-100 dark:bg-slate-800`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Configured amount (₱)
            <input readOnly aria-readonly="true" value={Number(checkoutLoan.fee_amount).toFixed(2)} className={`${input} mt-1 cursor-not-allowed bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`} />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Payment method
            <input readOnly value="Cash at the library desk" className={`${input} mt-1 bg-slate-100 dark:bg-slate-800`} />
          </label>
          {Number(checkoutLoan.fee_amount) > 0 ? <label className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100 sm:col-span-2">
            <input type="checkbox" checked={checkoutCashReceived} onChange={(event) => setCheckoutCashReceived(event.target.checked)} className="mt-0.5" />
            <span>I confirm I received PHP {Number(checkoutLoan.fee_amount).toFixed(2)} in cash from the borrower.</span>
          </label> : <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:col-span-2">No checkout fee is due. The checkout will record PHP 0.00 received.</p>}
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Payment notes (optional)
            <textarea maxLength={500} rows={2} value={checkoutNotes} onChange={(event) => setCheckoutNotes(event.target.value)} placeholder="Verification note or exception details" className={`${input} mt-1`} />
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400 sm:col-span-2">The selected copy is validated again at checkout, then linked to the loan, receipt, and circulation history.</p>
        </div>
      })() : null}
    </ActionModal>
    <ActionModal
        open={pendingAction !== null}
        title={pendingAction?.type === 'archiveMany' ? `Archive ${pendingAction.ids.length} catalog records?` : pendingAction?.type === 'deleteMany' ? `Delete ${pendingAction.ids.length} archived records?` : pendingAction?.type === 'close' ? returnConditions[pendingAction.id] === 'lost' ? 'Open lost-item case?' : confirmingReturnRequest ? 'Confirm requested return?' : 'Record physical-book return?' : pendingAction?.type === 'reject' ? 'Reject physical-book request?' : pendingAction?.type === 'archiveBook' ? pendingAction.archived ? 'Archive this book?' : 'Restore this book?' : pendingAction?.type === 'deleteBook' ? 'Permanently delete this archived title?' : 'Resolve lost-book hold?'}
        description={pendingAction?.type === 'archiveMany' ? 'These titles will be hidden from members. Existing copies and circulation records remain available.' : pendingAction?.type === 'deleteMany' ? 'Deletion is permanent. The database will keep any selected record with loans, payments, member activity, or attached files and report why it could not be removed.' : pendingAction?.type === 'close' ? `${confirmingReturnRequest ? 'The borrower return request will be completed. ' : ''}The selected condition (${returnConditions[pendingAction.id] ?? 'available'}) will be recorded.` : pendingAction?.type === 'archiveBook' ? pendingAction.archived ? `This title will be hidden from members. Loan history and existing records will be preserved.` : `This title will become available in the active catalog again.` : pendingAction?.type === 'deleteBook' ? `This is permanent. Deletion is allowed only when the database finds no loan, payment, member activity, or attached file.` : undefined}
        confirmLabel={pendingAction?.type === 'archiveMany' ? 'Archive selected' : pendingAction?.type === 'deleteMany' ? 'Delete eligible titles' : pendingAction?.type === 'close' ? returnConditions[pendingAction.id] === 'lost' ? 'Mark lost' : confirmingReturnRequest ? 'Confirm return' : 'Record return' : pendingAction?.type === 'reject' ? 'Reject request' : pendingAction?.type === 'archiveBook' ? pendingAction.archived ? 'Archive book' : 'Restore book' : pendingAction?.type === 'deleteBook' ? 'Permanently delete' : 'Resolve hold'}
        confirmDisabled={pendingAction?.type === 'close' && (
          !deskIdentityMatches(loans.find((loan) => loan.id === pendingAction.id)?.student_id ?? '')
          || (returnConditions[pendingAction.id] === 'lost' && !lostFineDrafts[pendingAction.id]?.reason.trim())
        )}
        tone={pendingAction?.type === 'archiveMany' || pendingAction?.type === 'close' || (pendingAction?.type === 'archiveBook' && !pendingAction.archived) ? 'default' : 'danger'}
        busy={pendingAction?.type === 'archiveBook' || pendingAction?.type === 'deleteBook' || pendingAction?.type === 'archiveMany' || pendingAction?.type === 'deleteMany' ? busy : pendingAction !== null && (pendingAction.type === 'close' || pendingAction.type === 'reject') && processingRequestId === pendingAction.id}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          const action = pendingAction
          setPendingAction(null)
          if (action?.type === 'archiveBook') void setBookArchived(action.id, action.title, action.archived)
          else if (action?.type === 'deleteBook') void permanentlyDeleteBook(action.id, action.title)
          else if (action?.type === 'archiveMany') void archiveCatalogSelection(action.ids)
          else if (action?.type === 'deleteMany') void deleteCatalogSelection(action.ids)
          else if (action?.type === 'close') void executeCloseLoan(action.id)
          else if (action?.type === 'reject') void executeRejectRequest(action.id)
        }}
      >
        {pendingAction?.type === 'close' ? <p className="text-xs text-slate-500">{deskIdentityMatches(loans.find((loan) => loan.id === pendingAction.id)?.student_id ?? '') ? 'Institutional ID presentation confirmed.' : 'Search for this borrower, visually verify their institutional ID card, and confirm the check before saving.'}</p> : null}
      </ActionModal>
    <ActionModal
      open={renewalDraft !== null}
      title="Renew physical loan?"
      description={renewalLoan ? `${bookName(renewalLoan.book_id)} · ${memberName(renewalLoan.student_id)}. There is no renewal-count limit. The new due date starts on the renewal date.` : undefined}
      confirmLabel="Confirm renewal and payment"
      confirmDisabled={!renewalDraft || !renewalLoan || !selectedRenewalOption
        || !deskIdentityMatches(renewalLoan.student_id)
        || selectedDeskMemberOverdue || selectedDeskMemberUnpaid > 0
        || !Number.isFinite(Number(renewalDraft.amountPaid))
        || Math.round(Number(renewalDraft.amountPaid) * 100) !== Math.round(Number(selectedRenewalOption?.fee_amount ?? 0) * 100)}
      tone="default"
      busy={renewalProcessing}
      onClose={() => { if (!renewalProcessing) setRenewalDraft(null) }}
      onConfirm={() => void executeRenewal()}
    >
      {renewalDraft && renewalLoan ? <div className="grid gap-3">
        <label className="block text-sm font-medium">Renewal period and fee
          <select
            required
            value={String(renewalDraft.durationDays)}
            onChange={(event) => {
              const durationDays = Number(event.target.value)
              const option = renewalOptions.find((entry) => entry.duration_days === durationDays)
              setRenewalDraft((current) => current ? {
                ...current,
                durationDays,
                amountPaid: option ? Number(option.fee_amount).toFixed(2) : '',
              } : null)
            }}
            className={`${input} mt-1`}
          >
            {renewalOptions.map((option) => <option key={option.id} value={option.duration_days}>
              {option.duration_days} days · PHP {Number(option.fee_amount).toFixed(2)}
            </option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Amount received (PHP)
          <input required type="number" min="0" step="0.01" value={renewalDraft.amountPaid}
            onChange={(event) => setRenewalDraft((current) => current ? { ...current, amountPaid: event.target.value } : null)}
            className={`${input} mt-1`} />
        </label>
        <label className="block text-sm font-medium">Payment notes (optional)
          <textarea maxLength={500} rows={2} value={renewalDraft.notes}
            onChange={(event) => setRenewalDraft((current) => current ? { ...current, notes: event.target.value } : null)}
            className={`${input} mt-1`} />
        </label>
        <p className="text-xs text-slate-500">
          The borrower must present a physical institutional ID card, be free of overdue or lost loans, and have no unpaid physical-fine balance above PHP 100.
          {deskIdentityMatches(renewalLoan.student_id) ? ' ID card presentation and photo match confirmed.' : ' Complete the desk identity check before continuing.'}
        </p>
      </div> : null}
    </ActionModal>
    <ActionModal
      open={fineWaiver !== null}
      title="Waive physical fine?"
      description={fineWaiver ? `Waive ₱${Number(physicalFines.find((fine) => fine.id === fineWaiver.id)?.amount ?? 0).toFixed(2)} for ${memberName(physicalFines.find((fine) => fine.id === fineWaiver.id)?.student_id ?? '')}. The reason is saved to the member record and audit history.` : undefined}
      confirmLabel="Record waiver"
      confirmDisabled={!fineWaiver?.reasonCategory || !fineWaiver.justification.trim() || fineWaiver.justification.trim().length > 500}
      busy={busy}
      onClose={() => setFineWaiver(null)}
      onConfirm={() => void waivePhysicalFine()}
    >
      {fineWaiver ? <div className="grid gap-3">
        <label className="block text-sm font-medium">Reason category<select required value={fineWaiver.reasonCategory} onChange={(event) => setFineWaiver((current) => current ? { ...current, reasonCategory: event.target.value } : null)} className={`${input} mt-1`}><option value="">Select a category</option><option>Medical Excuse</option><option>Administrative Exemption</option></select></label>
        <label className="block text-sm font-medium">Justification<textarea required minLength={1} maxLength={500} rows={3} value={fineWaiver.justification} onChange={(event) => setFineWaiver((current) => current ? { ...current, justification: event.target.value } : null)} placeholder="Record the supporting details for this waiver" className={`${input} mt-1`} /></label>
      </div> : null}
    </ActionModal>
    <ActionModal
      open={finePaymentConfirmation !== null}
      title="Record cashier payment?"
      description={finePaymentConfirmation ? `Collect PHP ${Number(finePaymentConfirmation.amount).toFixed(2)} in cash for ${fineTypeLabel(finePaymentConfirmation.fine_type)} from ${memberName(finePaymentConfirmation.student_id)}. Only confirm after cash has been received; a receipt will then be issued.` : undefined}
      confirmLabel="Confirm payment received"
      busy={busy}
      confirmDisabled={!finePaymentReceived}
      onClose={() => { setFinePaymentConfirmation(null); setFinePaymentReceived(false) }}
      onConfirm={() => void recordFinePayment()}
    >
      {finePaymentConfirmation ? <label className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
        <input type="checkbox" checked={finePaymentReceived} onChange={(event) => setFinePaymentReceived(event.target.checked)} className="mt-0.5" />
        <span>I confirm PHP {Number(finePaymentConfirmation.amount).toFixed(2)} cash was received from {memberName(finePaymentConfirmation.student_id)}.</span>
      </label> : null}
    </ActionModal>
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
      const receiptNumber = financeReceipt.kind === 'fine' ? financeReceipt.fine.receipt_number
        : financeReceipt.kind === 'checkout' ? financeReceipt.loan.receipt_number
          : financeReceipt.kind === 'renewal' ? financeReceipt.renewal.receipt_number
            : financeReceipt.kind === 'print' ? financeReceipt.payment.receipt_number
              : financeReceipt.topup.receipt_number
      const title = financeReceipt.kind === 'fine' ? fineTypeLabel(financeReceipt.fine.fine_type)
        : financeReceipt.kind === 'checkout' ? 'Physical book checkout'
          : financeReceipt.kind === 'renewal' ? 'Physical loan renewal'
            : financeReceipt.kind === 'topup' ? 'Points top-up' : 'Print service'
      const amount = financeReceipt.kind === 'fine' ? Number(financeReceipt.fine.amount)
        : financeReceipt.kind === 'checkout' ? Number(financeReceipt.loan.fee_amount)
          : financeReceipt.kind === 'renewal' ? Number(financeReceipt.renewal.amount_received)
            : financeReceipt.kind === 'print' ? Number(financeReceipt.payment.amount)
              : Number(financeReceipt.topup.amount_paid)
      const memberId = financeReceipt.kind === 'fine' ? financeReceipt.fine.student_id
        : financeReceipt.kind === 'checkout' ? financeReceipt.loan.student_id
          : financeReceipt.kind === 'renewal' ? financeReceipt.renewal.student_id
            : financeReceipt.kind === 'print' ? financeReceipt.payment.student_id
              : financeReceipt.topup.member_id
      const description = financeReceipt.kind === 'fine'
        ? `${bookName(loans.find((loan) => loan.id === financeReceipt.fine.physical_book_request_id)?.book_id ?? 0)} · Case #${financeReceipt.fine.physical_book_request_id}${financeReceipt.fine.fine_reason ? ` · ${financeReceipt.fine.fine_reason}` : ''}`
        : financeReceipt.kind === 'checkout'
          ? `${bookName(financeReceipt.loan.book_id)} · ${copyCode(financeReceipt.loan.copy_id)} · ${financeReceipt.loan.duration_days} days`
          : financeReceipt.kind === 'renewal'
            ? `${bookName(loans.find((loan) => loan.id === financeReceipt.renewal.request_id)?.book_id ?? 0)} · ${copyCode(financeReceipt.renewal.copy_id)} · ${financeReceipt.renewal.duration_days} days · Due ${new Date(financeReceipt.renewal.new_due_date).toLocaleDateString()}`
            : financeReceipt.kind === 'print' ? financeReceipt.payment.description
              : `${financeReceipt.topup.bundle_points.toLocaleString()} points added to the member account`
      const date = financeReceipt.kind === 'fine' ? financeReceipt.fine.paid_at ?? financeReceipt.fine.created_at
        : financeReceipt.kind === 'checkout' ? financeReceipt.loan.checked_out_at
          : financeReceipt.kind === 'renewal' ? financeReceipt.renewal.created_at
            : financeReceipt.kind === 'print' ? financeReceipt.payment.created_at
              : financeReceipt.topup.created_at
      return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFinanceReceipt(null) }}><section className="physical-finance-receipt w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="finance-receipt-title"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Smart Lib · Official receipt</p><h2 id="finance-receipt-title" className="mt-1 text-xl font-semibold">{title}</h2></div><button type="button" data-print-hide onClick={() => setFinanceReceipt(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Close</button></div><p className="mt-5 border-y border-dashed border-slate-300 py-3 font-mono text-sm">Receipt {receiptNumber ?? 'Unavailable'}</p><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-slate-500">Received from</dt><dd className="font-medium">{memberName(memberId)}</dd></div><div><dt className="text-xs text-slate-500">Details</dt><dd>{description}</dd></div><div><dt className="text-xs text-slate-500">Date</dt><dd>{new Date(date).toLocaleString()}</dd></div><div><dt className="text-xs text-slate-500">Amount</dt><dd className="text-lg font-semibold">PHP {amount.toFixed(2)}</dd></div>{financeReceipt.kind === 'fine' ? <div><dt className="text-xs text-slate-500">Payment status</dt><dd className="capitalize">{financeReceipt.fine.status}</dd></div> : financeReceipt.kind === 'checkout' ? <div><dt className="text-xs text-slate-500">Payment</dt><dd className="capitalize">{financeReceipt.loan.payment_method} · {financeReceipt.loan.payment_status}</dd></div> : financeReceipt.kind === 'renewal' ? <div><dt className="text-xs text-slate-500">Payment</dt><dd>PHP {Number(financeReceipt.renewal.amount_received).toFixed(2)} received · {financeReceipt.renewal.duration_days} days</dd></div> : null}</dl><p className="mt-6 text-xs text-slate-500">Keep this receipt for your records.</p><div data-print-hide className="mt-5 flex justify-end"><button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-700">Print receipt</button></div></section></div>
    })() : null}
    <StaffMemberEnrollmentModal
      open={memberEnrollmentOpen}
      onClose={() => setMemberEnrollmentOpen(false)}
      onCreated={(email, username) => { void onMemberInvited(email, username) }}
    />
    <StaffCashPointTopUpModal
      member={topUpMember}
      open={topUpMember !== null}
      onClose={() => setTopUpMember(null)}
      onCompleted={() => { void load() }}
    />
    {!requestsOnly && !overviewOnly && !catalogOnly && !policyOnly && !finesOnly ? <BookAssistant /> : null}
  </main>
}
