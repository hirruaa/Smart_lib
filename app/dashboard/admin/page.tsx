'use client'

export const dynamic = 'force-dynamic'

import { Fragment, FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import ThemeToggle from '@/components/ThemeToggle'
import BrandLogo from '@/components/BrandLogo'
import EbookUploader from '@/components/EbookUploader'
import AdminAnalytics from '@/components/AdminAnalytics'
import ActionModal from '@/components/ActionModal'
import ResultModal from '@/components/ResultModal'
import { AdminDashboardSkeleton } from '@/components/skeletons'
import { useDebounce } from '@/utils/useDebounce'
import { DIGITAL_ACCESS_DURATION_OPTIONS, getDigitalAccessCost, normalizeAccessMode, type CanonicalAccessMode, type DigitalAccessCosts } from '@/utils/libraryContracts'
import PhysicalCirculationAdminPage from '@/components/PhysicalCirculationAdminPage'
import StaffCashPointTopUpModal from '@/components/StaffCashPointTopUpModal'
import { generateCatalogIsbn } from '@/utils/isbn'
import { isAdminRole } from '@/utils/roles'

const navGroups = [
  { label: 'Management', items: [{ label: 'Overview', section: 'overview' }, { label: 'Financial ledger / fines', section: 'physical-finance' }, { label: 'Member accounts', section: 'users' }, { label: 'Digital history', section: 'requests' }, { label: 'Faculty lessons', section: 'contributions' }] },
  { label: 'Library management', items: [{ label: 'Catalog management', section: 'books' }, { label: 'Physical catalog', section: 'physical' }, { label: 'Borrowing policy', section: 'policy' }] },
  { label: 'Review & insights', items: [{ label: 'Audit log', section: 'audit' }] },
]

function ListPagination({ page, pageCount, total, onPageChange }: { page: number; pageCount: number; total: number; onPageChange: (page: number) => void }) {
  if (total <= 10) return null
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
    <span>Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, total)} of {total}</span>
    <div className="flex items-center gap-2">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">Previous</button>
      <span>Page {page} of {pageCount}</span>
      <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(Math.min(pageCount, page + 1))} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">Next</button>
    </div>
  </div>
}

type Book = {
  id: number
  title: string
  author: string
  isbn: string | null
  category: string
  discipline?: string | null
  genre?: string | null
  course_code: string | null
  source_type: 'catalog' | 'staff_added' | 'community_contribution'
  description: string | null
  cover_image_url?: string | null
  pdf_url: string | null
  catalog_type: 'digital' | 'physical' | 'hybrid'
  storage_provider?: string | null
  storage_file_id?: string | null
  storage_path?: string | null
  access_points: number
  access_costs: DigitalAccessCosts | null
  access_mode: CanonicalAccessMode
  access_duration_days: number
  created_at: string | null
  is_archived: boolean
}

type Material = {
  id: number
  title: string
  description: string | null
  resource_url: string | null
  created_at: string | null
}

type RequestItem = {
  id: number
  student_id: string
  book_id: number
  status: string
  request_date: string | null
  due_date: string | null
  returned_date: string | null
  notes: string | null
  duration_days?: number | null
}
type PhysicalRequestPreview = {
  id: number
  student_id: string
  book_id: number
  status: string
  payment_status: string
  payment_method: string
  fee_amount: number
  requested_at: string
}
type DigitalLoanHistoryItem = {
  id: number
  borrow_request_id: number
  student_id: string
  book_id: number
  requested_at: string
  borrowed_at: string | null
  due_date: string | null
  returned_at: string | null
  duration_days: number
  renewal_count: number
  points_cost: number
  status: string
}
type MemberPhysicalRequest = {
  id: number; book_id: number; status: string; payment_status: string; payment_method: string
  fee_amount: number; requested_at: string; checked_out_at: string | null; due_date: string | null
  returned_at: string | null; receipt_number: string | null
}
type MemberPhysicalLoan = {
  id: number; request_id: number; book_id: number; copy_id: number; duration_days: number
  fee_amount: number; payment_method: string; payment_status: string; checked_out_at: string
  due_date: string; returned_at: string | null; return_condition: string | null; status: string
  receipt_number: string | null; notes: string | null
}
type MemberFine = {
  id: number; physical_book_request_id: number | null; borrow_request_id: number | null
  amount: number; status: string; fine_type: string; fine_reason: string | null
  waiver_reason: string | null; receipt_number: string | null; created_at: string; paid_at: string | null
}
type MemberPrintPayment = { id: number; amount: number; description: string; receipt_number: string | null; created_at: string }
type MemberEbookPurchase = { id: number; book_id: number; fee_amount: number; status: string; receipt_number: string | null; requested_at: string; reviewed_at: string | null }
type MemberPointTransaction = { id: number; amount: number; transaction_type: string; description: string; created_at: string }
type MemberLedgerEvent = { id: number; occurred_at: string; event_type: string; summary: string; actor_role: string; receipt_number: string | null; related_request_type: string | null; related_request_id: number | null }
type MemberAccountHistory = {
  digitalLoans: DigitalLoanHistoryItem[]
  physicalRequests: MemberPhysicalRequest[]
  physicalLoans: MemberPhysicalLoan[]
  fines: MemberFine[]
  printPayments: MemberPrintPayment[]
  ebookPurchases: MemberEbookPurchase[]
  pointTransactions: MemberPointTransaction[]
  activityLedger: MemberLedgerEvent[]
}

type Profile = {
  id: string
  email: string
  username?: string | null
  institutional_id?: string | null
  role: string
  created_at: string | null
  points_balance?: number | null
  full_name?: string | null
  school?: string | null
  department?: string | null
  course?: string | null
  student_year?: string | null
}

type AcademicCourse = { id: number; name: string; is_active: boolean }
type AcademicDepartment = { id: number; name: string; is_active: boolean }
type MemberEditForm = {
  role: 'student' | 'faculty' | 'librarian'
  school: string
  department: string
  course: string
  studentYear: string
  institutionalId: string
}

type AdminProfile = {
  email: string
  role: string
  full_name?: string | null
}

type MemberSuspensionState = {
  memberId: string
  suspended: boolean | null
  bannedUntil: string | null
  loading: boolean
  error: string | null
}

type Contribution = {
  id: number
  user_id: string
  title: string
  author: string
  description: string | null
  pdf_url: string | null
  storage_provider?: string | null
  storage_file_id?: string | null
  storage_path?: string | null
  status: string
  created_at: string | null
  review_feedback?: string | null
  rejection_reason?: string | null
}

type AuditLog = { id: number; actor_id: string | null; action: string; target_type: string; target_id: number | null; details: Record<string, unknown>; created_at: string }
type AuditActor = { id: string; full_name: string | null; email: string; role: string }
type AdminConfirm = { type: 'archiveBook' | 'revokeLoan'; id: number; label?: string; isArchived?: boolean } | { type: 'deleteBook'; id: number; label?: string } | { type: 'deleteMember'; id: string; label?: string } | null

function memberDisplayName(member?: Pick<Profile, 'full_name' | 'email'> | null, fallback = 'Member') {
  return member?.full_name?.trim() || fallback
}

function memberCourseDisplay(value: string | null | undefined, courses: AcademicCourse[]) {
  const savedValue = value?.trim()
  if (!savedValue) return 'Not set'
  const matchedCourse = courses.find((course) => course.name.trim().toLocaleLowerCase() === savedValue.toLocaleLowerCase())
  if (matchedCourse) return matchedCourse.name
  return 'Needs review'
}

function memberCourseFormValue(value: string | null | undefined, courses: AcademicCourse[]) {
  const savedValue = value?.trim() ?? ''
  return courses.find((course) => course.name.trim().toLocaleLowerCase() === savedValue.toLocaleLowerCase())?.name ?? savedValue
}

function memberYearDisplay(value: string | null | undefined) {
  const savedValue = value?.trim().toLocaleLowerCase()
  if (!savedValue) return 'Not set'
  const match = savedValue.match(/^([1-5])(?:st|nd|rd|th)?(?:\s*year)?$/)
  if (!match) return 'Needs review'
  const year = Number(match[1])
  const suffix = year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th'
  return `${year}${suffix} Year`
}

function AdminNavIcon({ section }: { section: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    books: <><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" /><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19M9 7h6M9 10h4" /></>,
    requests: <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></>,
    'physical-fines': <><path d="M12 3v18M17 7.5c-.8-1-2.3-1.5-4.5-1.5-2.4 0-4 1-4 2.7 0 4.2 9 1.4 9 5.8 0 1.8-1.8 3-4.5 3-2.2 0-4-.7-5-1.9" /></>,
    'physical-finance': <><path d="M12 3v18M17 7.5c-.8-1-2.3-1.5-4.5-1.5-2.4 0-4 1-4 2.7 0 4.2 9 1.4 9 5.8 0 1.8-1.8 3-4.5 3-2.2 0-4-.7-5-1.9" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a2.5 2.5 0 1 0 0-5M16 14a5 5 0 0 1 4.5 6" /></>,
    physical: <><path d="M4 7h16v13H4z" /><path d="M8 7V4h8v3M8 12h8M8 16h5" /></>,
    policy: <><path d="M6 3h12v18l-6-3-6 3z" /><path d="M9 8h6M9 12h6" /></>,
    materials: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    contributions: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h5" /><path d="m14 16 2 2 4-4" /></>,
    audit: <><path d="M4 5h16M4 12h16M4 19h16" /><circle cx="7" cy="5" r="1" /><circle cx="7" cy="12" r="1" /><circle cx="7" cy="19" r="1" /></>,
  }

  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[section]}</svg>
}

export default function AdminPage() {
  const router = useRouter()
  const [section, setSection] = useState('overview')
  const [physicalSectionVisited, setPhysicalSectionVisited] = useState(false)
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [physicalRequestPreview, setPhysicalRequestPreview] = useState<PhysicalRequestPreview[]>([])
  const [circulationSummary, setCirculationSummary] = useState<{ pendingRequests: number; lostLoans: number } | null>(null)
  const [digitalLoanHistory, setDigitalLoanHistory] = useState<DigitalLoanHistoryItem[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [academicCourses, setAcademicCourses] = useState<AcademicCourse[]>([])
  const [academicDepartments, setAcademicDepartments] = useState<AcademicDepartment[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dashboardLoadError, setDashboardLoadError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionSuccessTitle, setActionSuccessTitle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newBook, setNewBook] = useState({
    title: '',
    author: '',
    category: '',
    genre: '',
    source_type: 'staff_added' as 'catalog' | 'staff_added' | 'community_contribution',
    course_code: '',
    isbn: '',
    pdf_url: '',
    access_costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string>,
    access_mode: 'free' as 'free' | 'points',
    access_duration_days: '30',
    description: '',
  })
  const [pdfBookId, setPdfBookId] = useState<number | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfAttachmentOpen, setPdfAttachmentOpen] = useState(false)
  const [newBookFile, setNewBookFile] = useState<File | null>(null)
  const [newBookOpen, setNewBookOpen] = useState(false)
  const [materialFile, setMaterialFile] = useState<File | null>(null)
  const [bookSearch, setBookSearch] = useState('')
  const debouncedBookSearch = useDebounce(bookSearch, 200)
  const [showArchivedBooks, setShowArchivedBooks] = useState(false)
  const [bookCategoryFilter, setBookCategoryFilter] = useState('all')
  const [bookAuthorFilter, setBookAuthorFilter] = useState('all')
  const [userSearch, setUserSearch] = useState('')
  const debouncedUserSearch = useDebounce(userSearch, 200)
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'student' | 'faculty' | 'librarian'>('all')
  const [userLoanFilter, setUserLoanFilter] = useState<'all' | 'active' | 'none'>('all')
  const [digitalHistorySearch, setDigitalHistorySearch] = useState('')
  const debouncedDigitalHistorySearch = useDebounce(digitalHistorySearch, 200)
  const [digitalHistoryStatus, setDigitalHistoryStatus] = useState<'all' | 'active' | 'returned' | 'expired' | 'revoked'>('all')
  const [bookPage, setBookPage] = useState(1)
  const [digitalHistoryPage, setDigitalHistoryPage] = useState(1)
  const [selectedDigitalLoanIds, setSelectedDigitalLoanIds] = useState<number[]>([])
  const [bulkRevokeOpen, setBulkRevokeOpen] = useState(false)
  const [userPage, setUserPage] = useState(1)
  const [contributionPage, setContributionPage] = useState(1)
  const [selectedContributionIds, setSelectedContributionIds] = useState<number[]>([])
  const [bulkContributionReview, setBulkContributionReview] = useState<{ decision: 'approved' | 'rejected'; reward: string; rejectionReason: string } | null>(null)
  const [inspectingContribution, setInspectingContribution] = useState<Contribution | null>(null)
  const [showContributionHistory, setShowContributionHistory] = useState(false)
  const [auditPage, setAuditPage] = useState(1)
  const [auditSearch, setAuditSearch] = useState('')
  const [editingBookId, setEditingBookId] = useState<number | null>(null)
  const [selectedCatalogBook, setSelectedCatalogBook] = useState<Book | null>(null)
  const [bookManagementTab, setBookManagementTab] = useState<'metadata' | 'attachments' | 'permissions'>('metadata')
  const [bookAccessDraft, setBookAccessDraft] = useState({ mode: 'free' as 'free' | 'points', costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string> })
  const [editingBookDetailsId, setEditingBookDetailsId] = useState<number | null>(null)
  const [bookDetailsDraft, setBookDetailsDraft] = useState({ title: '', author: '', category: '', genre: '', sourceType: 'staff_added' as Book['source_type'], courseCode: '', isbn: '', description: '', coverImageUrl: '' })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({ username: '', email: '', fullName: '', role: 'student' as 'student' | 'faculty' | 'librarian', school: '', department: '', course: '', studentYear: '', institutionalId: '' })
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditActors, setAuditActors] = useState<AuditActor[]>([])
  const [auditActorError, setAuditActorError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<AdminConfirm>(null)
  const [reviewDialog, setReviewDialog] = useState<{ id: number; decision: 'approved' | 'rejected'; reward: string; rejectionReason: string } | null>(null)
  const [revisionDialog, setRevisionDialog] = useState<{ id: number; feedback: string } | null>(null)
  const [memberToolModal, setMemberToolModal] = useState<'catalogs' | 'createMember' | null>(null)
  const [editingMember, setEditingMember] = useState<Profile | null>(null)
  const [memberEditForm, setMemberEditForm] = useState<MemberEditForm | null>(null)
  const [selectedMember, setSelectedMember] = useState<(Profile & { active_loans: number }) | null>(null)
  const [topUpMember, setTopUpMember] = useState<Profile | null>(null)
  const [memberSuspension, setMemberSuspension] = useState<MemberSuspensionState | null>(null)
  const [memberSuspensionDialog, setMemberSuspensionDialog] = useState<{ memberId: string; memberName: string; suspended: boolean; reason: string; error?: string } | null>(null)
  const [memberAccountHistory, setMemberAccountHistory] = useState<MemberAccountHistory | null>(null)
  const [memberAccountHistoryLoading, setMemberAccountHistoryLoading] = useState(false)
  const [memberAccountHistoryError, setMemberAccountHistoryError] = useState<string | null>(null)
  const [memberFineStatusAvailable, setMemberFineStatusAvailable] = useState(false)
  const [courseDraft, setCourseDraft] = useState('')
  const [facultyDraft, setFacultyDraft] = useState('')
  const [defaultLessonReward, setDefaultLessonReward] = useState(25)
  const [lessonPolicyError, setLessonPolicyError] = useState<string | null>(null)
  const [catalogRemoval, setCatalogRemoval] = useState<{ kind: 'faculty' | 'course'; id: number; name: string } | null>(null)

  const loadMemberSuspension = async (memberId: string) => {
    setMemberSuspension({ memberId, suspended: null, bannedUntil: null, loading: true, error: null })
    try {
      const response = await fetch(`/api/admin/students/${memberId}/suspension`)
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Unable to load account access status.')
      setMemberSuspension((current) => current?.memberId === memberId
        ? { memberId, suspended: Boolean(data.suspended), bannedUntil: data.bannedUntil ?? null, loading: false, error: null }
        : current)
    } catch (cause) {
      setMemberSuspension((current) => current?.memberId === memberId
        ? {
          memberId,
          suspended: null,
          bannedUntil: null,
          loading: false,
          error: cause instanceof Error ? cause.message : 'Unable to load account access status.',
        }
        : current)
    }
  }

  const executeMemberSuspensionChange = async () => {
    if (!memberSuspensionDialog || memberSuspensionDialog.reason.trim().length < 3) {
      setMemberSuspensionDialog((current) => current ? { ...current, error: 'Enter a reason of at least 3 characters.' } : current)
      return
    }
    const change = memberSuspensionDialog
    setSaving(true)
    setMemberSuspensionDialog((current) => current ? { ...current, error: undefined } : current)
    let updatedSuccessfully = false
    try {
      const response = await fetch(`/api/admin/students/${change.memberId}/suspension`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspended: change.suspended, reason: change.reason.trim() }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Unable to update account suspension.')
      setMemberSuspension({
        memberId: change.memberId,
        suspended: Boolean(result.suspended),
        bannedUntil: result.bannedUntil ?? null,
        loading: false,
        error: null,
      })
      setMemberSuspensionDialog(null)
      updatedSuccessfully = true
    } catch (cause) {
      setMemberSuspensionDialog((current) => current?.memberId === change.memberId
        ? { ...current, error: cause instanceof Error ? cause.message : 'Unable to update account suspension.' }
        : current)
    } finally {
      setSaving(false)
    }
    if (updatedSuccessfully) {
      await loadData().catch((cause: unknown) => {
        setDashboardLoadError(cause instanceof Error
          ? `Account access changed, but the admin data could not be refreshed. (${cause.message})`
          : 'Account access changed, but the admin data could not be refreshed.')
      })
      setActionSuccessTitle(change.suspended ? 'Account suspended' : 'Suspension lifted')
      setActionMessage(`${change.memberName} ${change.suspended ? 'can no longer sign in' : 'can sign in again'}. The action was recorded in the audit log.`)
    }
  }

  const openMemberDetails = (member: Profile & { active_loans: number }) => {
    setMemberAccountHistory(null)
    setMemberAccountHistoryError(null)
    setMemberFineStatusAvailable(false)
    setSelectedMember(member)
    void loadMemberSuspension(member.id)
  }

  const navigateToSection = (nextSection: string) => {
    setSection(nextSection)
    if (nextSection === 'physical' || nextSection === 'physical-finance') setPhysicalSectionVisited(true)
  }


  useEffect(() => {
    if (!sidebarOpen) return
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (!newBookOpen) return
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setNewBookOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [newBookOpen, saving])

  useEffect(() => {
    if (!pdfAttachmentOpen) return
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setPdfAttachmentOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [pdfAttachmentOpen, saving])

  const handleArchiveBook = (bookId: number, title: string) => {
    const book = books.find((item) => item.id === bookId)
    setConfirmAction({ type: 'archiveBook', id: bookId, label: title, isArchived: !book?.is_archived })
  }

  const setBookArchived = async (bookId: number, title: string, archived: boolean) => {
    setSaving(true)
    setError(null)
    setActionMessage(null)
    try {
      const { error: updateError } = await getSupabase()
        .from('books')
        .update({ is_archived: archived })
        .eq('id', bookId)
      if (updateError) throw new Error(updateError.message)
      setBooks((current) => current.map((book) => book.id === bookId ? { ...book, is_archived: archived } : book))
      setSelectedCatalogBook((current) => current?.id === bookId ? null : current)
      setEditingBookId(null)
      setBookPage(1)
      setActionMessage(archived
        ? `"${title}" was removed from the active catalog. Its loan history and records are preserved.`
        : `"${title}" was restored to the active catalog.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Unable to ${archived ? 'remove' : 'restore'} this title.`)
    } finally {
      setSaving(false)
    }
  }

  const permanentlyDeleteBook = async (bookId: number, title: string) => {
    setSaving(true)
    setError(null)
    setActionMessage(null)
    try {
      const { error: deleteError } = await getSupabase().rpc('admin_delete_catalog_book', { p_book_id: bookId })
      if (deleteError) throw new Error(deleteError.message)
      setBooks((current) => current.filter((book) => book.id !== bookId))
      setSelectedCatalogBook(null)
      setBookPage(1)
      setActionMessage(`“${title}” was permanently deleted.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to permanently delete this title.')
    } finally {
      setSaving(false)
      setConfirmAction(null)
    }
  }

  const startBookAccessEdit = (book: Book) => {
    setEditingBookDetailsId(null)
    setEditingBookId(book.id)
    setBookAccessDraft({
      mode: book.access_mode,
      costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, String(book.access_costs?.[String(days) as keyof DigitalAccessCosts] ?? getDigitalAccessCost(book.access_points, days))])),
    })
  }

  const openCatalogBook = (book: Book) => {
    setSelectedCatalogBook(book)
    setBookManagementTab('metadata')
    setEditingBookId(null)
    setEditingBookDetailsId(null)
  }

  const startBookDetailsEdit = (book: Book) => {
    setEditingBookId(null)
    setEditingBookDetailsId(book.id)
    setBookDetailsDraft({
      title: book.title, author: book.author, category: book.discipline ?? '',
      genre: book.genre ?? '', sourceType: book.source_type, courseCode: book.course_code ?? '',
      isbn: book.isbn ?? '', description: book.description ?? '', coverImageUrl: book.cover_image_url ?? '',
    })
  }

  const generateBookIsbn = (update: (isbn: string) => void, excludedBookId?: number) => {
    try {
      update(generateCatalogIsbn(books.filter((book) => book.id !== excludedBookId).map((book) => book.isbn)))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate a catalog identifier.')
    }
  }

  const saveBookDetailsEdit = async (event: FormEvent<HTMLFormElement>, book: Book) => {
    event.preventDefault()
    const title = bookDetailsDraft.title.trim()
    const author = bookDetailsDraft.author.trim()
    const discipline = bookDetailsDraft.category.trim()
    const genre = bookDetailsDraft.genre.trim()
    const category = discipline || genre
    const courseCode = bookDetailsDraft.courseCode.trim()
    if (!title || !author || !category) {
      setError('Title and author are required, and the book needs a discipline or genre.')
      return
    }
    if (courseCode.length > 32) {
      setError('Course code must be 32 characters or fewer.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: updateError } = await getSupabase().from('books').update({
      title, author, category, discipline: discipline || null, genre: genre || null,
      source_type: bookDetailsDraft.sourceType, course_code: courseCode || null,
      isbn: bookDetailsDraft.isbn.trim() || null,
      description: bookDetailsDraft.description.trim() || null,
      cover_image_url: bookDetailsDraft.coverImageUrl.trim() || null,
    }).eq('id', book.id).select('id,title,author,category,discipline,genre,source_type,course_code,isbn,description,cover_image_url').single()
    if (updateError) {
      setError(`Unable to update book details: ${updateError.message}`)
    } else {
      setBooks((current) => current.map((item) => item.id === book.id ? { ...item, ...data } : item))
      setSelectedCatalogBook((current) => current?.id === book.id ? { ...current, ...data } : current)
      setEditingBookDetailsId(null)
      setActionMessage(`Details for "${data.title}" were updated.`)
    }
    setSaving(false)
  }

  const saveBookAccessEdit = async (event: FormEvent<HTMLFormElement>, book: Book) => {
    event.preventDefault()
    const rawCosts = DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [String(days), bookAccessDraft.costs[String(days)]?.trim() ?? ''] as const)
    if (bookAccessDraft.mode === 'points' && rawCosts.some(([, value]) => value === '')) {
      setError('Enter a points cost for every access duration.')
      return
    }
    const costs: Record<string, number> = bookAccessDraft.mode === 'points'
      ? Object.fromEntries(rawCosts.map(([days, value]) => [days, Number(value)]))
      : {}
    if (Object.values(costs).some((cost) => !Number.isInteger(cost) || cost < 0)) {
      setError('Each access cost must be a whole number of points greater than or equal to zero.')
      return
    }

    setSaving(true)
    setError(null)
    const supabase = getSupabase()
    const { data, error: updateError } = await supabase
      .from('books')
      .update({
        access_mode: bookAccessDraft.mode,
        access_points: bookAccessDraft.mode === 'points' ? costs['7'] : 0,
        access_costs: costs,
      })
      .eq('id', book.id)
      .select('id, access_points, access_costs, access_mode, access_duration_days')
      .single()

    if (updateError) {
      setError(updateError.message)
    } else {
      setBooks((current) => current.map((item) => item.id === book.id ? {
        ...item,
        access_points: data.access_points,
        access_costs: data.access_costs as DigitalAccessCosts,
        access_mode: normalizeAccessMode(data.access_mode, data.access_points),
        access_duration_days: data.access_duration_days,
      } : item))
      setEditingBookId(null)
      setActionMessage(`Access settings for "${book.title}" were updated.`)
    }
    setSaving(false)
  }

  const loadData = async () => {
    setError(null)
    setDashboardLoadError(null)
    setActionMessage(null)
    const supabase = getSupabase()

    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      setDashboardLoadError(`Unable to verify your session. Refresh the page or sign in again. (${error.message})`)
      setLoading(false)
      return
    }
    const currentUser = user
    if (!currentUser) {
      router.replace('/login')
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role, email, full_name')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (profileError) {
      setDashboardLoadError(`Unable to load your profile. Apply the Supabase profile policies, then try again. (${profileError.message})`)
      setLoading(false)
      return
    }

    const role = profileData?.role ? String(profileData.role).trim().toLowerCase() : ''
    const email = profileData?.email ?? currentUser.email

    if (role === 'librarian') {
      router.replace('/dashboard/admin/physical')
      return
    }
    if (!isAdminRole(role)) {
      if (role === 'student' || role === 'faculty') {
        router.replace(role === 'faculty' ? '/dashboard/faculty' : '/dashboard/student')
      } else {
        router.replace('/dashboard')
      }
      return
    }

    setProfile({ email: email ?? '', role, full_name: profileData?.full_name ?? null })

    const [booksRes, requestsRes, historyRes, studentsRes, contributionsRes, auditRes, coursesRes, departmentsRes, physicalRequestsRes, pendingPhysicalRequestsRes, libraryPolicyRes] = await Promise.all([
      supabase
        .from('books')
        .select('id, title, author, isbn, category, discipline, genre, course_code, source_type, description, cover_image_url, pdf_url, catalog_type, storage_provider, storage_file_id, storage_path, access_points, access_costs, access_mode, access_duration_days, created_at, is_archived')
        .order('title', { ascending: true }),
      supabase
        .from('borrow_requests')
        .select('id, student_id, book_id, status, request_date, approved_at, due_date, returned_date, notes, duration_days')
        .order('request_date', { ascending: false }),
      supabase
        .from('digital_book_loan_history')
        .select('id, borrow_request_id, student_id, book_id, requested_at, borrowed_at, due_date, returned_at, duration_days, renewal_count, points_cost, status')
        .order('requested_at', { ascending: false })
        .limit(200),
      supabase
        .from('profiles')
        .select('id, email, username, institutional_id, role, created_at, points_balance, full_name, school, department, course, student_year')
        .in('role', ['student', 'faculty', 'librarian'])
        .order('created_at', { ascending: false }),
      supabase
        .from('book_contributions')
        .select('id, user_id, title, author, description, pdf_url, storage_provider, storage_file_id, storage_path, status, review_feedback, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('id,actor_id,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(1000),
      supabase.from('academic_courses').select('id,name,is_active').order('name'),
      supabase.from('academic_departments').select('id,name,is_active').order('name'),
      supabase.from('physical_book_requests').select('id,student_id,book_id,status,payment_status,payment_method,fee_amount,requested_at').order('requested_at', { ascending: false }).limit(5),
      supabase.from('physical_book_requests').select('id,student_id,book_id,status,payment_status,payment_method,fee_amount,requested_at').eq('status', 'pending').order('requested_at', { ascending: false }).limit(5),
      supabase.from('library_policy_settings').select('faculty_lesson_reward_points').eq('id', 1).single(),
    ])

    const requiredAdminError = [
      booksRes, requestsRes, historyRes, studentsRes, contributionsRes,
      auditRes, physicalRequestsRes, pendingPhysicalRequestsRes,
    ].find((result) => result.error)?.error
    if (requiredAdminError) {
      setDashboardLoadError(`Unable to load required admin or library records: ${requiredAdminError.message || 'Please check the Supabase schema.'}`)
      setLoading(false)
      return
    }
    const failedAcademicCatalog = [coursesRes, departmentsRes].find((result) => result.error)?.error
    if (failedAcademicCatalog) {
      setDashboardLoadError(`Unable to load the academic catalogs required for member accounts: ${failedAcademicCatalog.message}`)
      setLoading(false)
      return
    }
    setLessonPolicyError(libraryPolicyRes.error
      ? `Policy settings are unavailable; lesson approvals will use the default reward until the policy migration is applied. (${libraryPolicyRes.error.message})`
      : null)

    setBooks((booksRes.data ?? []).map((book) => ({
      ...book,
      access_mode: normalizeAccessMode(book.access_mode, book.access_points),
    })) as Book[])
    setRequests((requestsRes.data ?? []) as RequestItem[])
    const requestsForOverview = new Map<number, PhysicalRequestPreview>()
    ;[...(physicalRequestsRes.data ?? []), ...(pendingPhysicalRequestsRes.data ?? [])].forEach((request) => requestsForOverview.set(request.id, request as PhysicalRequestPreview))
    setPhysicalRequestPreview(Array.from(requestsForOverview.values())
      .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())
      .slice(0, 8))
    setDigitalLoanHistory((historyRes.data ?? []) as DigitalLoanHistoryItem[])
    setStudents((studentsRes.data ?? []) as Profile[])
    setAcademicCourses((coursesRes.data ?? []) as AcademicCourse[])
    setAcademicDepartments((departmentsRes.data ?? []) as AcademicDepartment[])
    setContributions((contributionsRes.data ?? []) as Contribution[])
    const auditRows = (auditRes.data ?? []) as AuditLog[]
    setAuditLogs(auditRows)
    if (!libraryPolicyRes.error && libraryPolicyRes.data) {
      setDefaultLessonReward(libraryPolicyRes.data.faculty_lesson_reward_points)
    }
    const auditActorIds = Array.from(new Set(auditRows.flatMap((log) => log.actor_id ? [log.actor_id] : [])))
    setAuditActorError(null)
    if (auditActorIds.length) {
      const { data: actorRows, error: actorError } = await supabase
        .from('profiles')
        .select('id,full_name,email,role')
        .in('id', auditActorIds)
      if (actorError) {
        setAuditActors([])
        setAuditActorError(`Unable to load audit actor names: ${actorError.message}`)
      } else {
        setAuditActors((actorRows ?? []) as AuditActor[])
      }
    } else {
      setAuditActors([])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadData().catch((cause: unknown) => {
      setDashboardLoadError(cause instanceof Error
        ? `Unable to load the admin dashboard. Refresh and try again. (${cause.message})`
        : 'Unable to load the admin dashboard. Refresh and try again.')
      setLoading(false)
    })
  }, [router])

  useEffect(() => {
    if (!profile || !isAdminRole(profile.role)) return

    const refreshCirculationSummary = async () => {
      const supabase = getSupabase()
      const [pendingRequests, lostLoans] = await Promise.all([
        supabase.from('physical_book_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('physical_book_loan_history').select('id', { count: 'exact', head: true }).eq('status', 'lost'),
      ])
      const failedCount = [pendingRequests, lostLoans].find((result) => result.error)
      if (failedCount?.error) {
        setError(`Unable to refresh physical circulation totals: ${failedCount.error.message}`)
        return
      }
      setCirculationSummary({
        pendingRequests: pendingRequests.count ?? 0,
        lostLoans: lostLoans.count ?? 0,
      })
    }
    void refreshCirculationSummary()

    const supabase = getSupabase()
    const channel = supabase
      .channel('admin-realtime-circulation-summary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_book_requests' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const deleted = payload.old as { id: number }
          setPhysicalRequestPreview((current) => current.filter((request) => request.id !== deleted.id))
        } else {
          const updated = payload.new as PhysicalRequestPreview
          setPhysicalRequestPreview((current) => [updated, ...current.filter((request) => request.id !== updated.id)]
            .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())
            .slice(0, 8))
        }
        void refreshCirculationSummary()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_book_loan_history' }, () => {
        void refreshCirculationSummary()
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [profile])

  useEffect(() => {
    if (!selectedMember) {
      setMemberAccountHistory(null)
      setMemberAccountHistoryError(null)
      setMemberAccountHistoryLoading(false)
      setMemberFineStatusAvailable(false)
      return
    }
    let active = true
    const loadMemberAccountHistory = async () => {
      setMemberAccountHistoryLoading(true)
      setMemberAccountHistory(null)
      setMemberAccountHistoryError(null)
      setMemberFineStatusAvailable(false)
      const supabase = getSupabase()
      const fineCalculation = await supabase.rpc('calculate_overdue_fines')
      if (!active) return
      const [digital, physicalRequests, physicalLoans, fines, printPayments, ebookPurchases, pointTransactions, activityLedger] = await Promise.all([
        supabase.from('digital_book_loan_history').select('id,borrow_request_id,student_id,book_id,requested_at,borrowed_at,due_date,returned_at,duration_days,renewal_count,points_cost,status').eq('student_id', selectedMember.id).order('requested_at', { ascending: false }),
        supabase.from('physical_book_requests').select('id,book_id,status,payment_status,payment_method,fee_amount,requested_at,checked_out_at,due_date,returned_at,receipt_number').eq('student_id', selectedMember.id).order('requested_at', { ascending: false }),
        supabase.from('physical_book_loan_history').select('id,request_id,book_id,copy_id,duration_days,fee_amount,payment_method,payment_status,checked_out_at,due_date,returned_at,return_condition,status,receipt_number,notes').eq('student_id', selectedMember.id).order('checked_out_at', { ascending: false }),
        supabase.from('fines').select('id,physical_book_request_id,borrow_request_id,amount,status,fine_type,fine_reason,waiver_reason,receipt_number,created_at,paid_at').eq('student_id', selectedMember.id).order('created_at', { ascending: false }),
        supabase.from('library_print_payments').select('id,amount,description,receipt_number,created_at').eq('student_id', selectedMember.id).order('created_at', { ascending: false }),
        supabase.from('ebook_purchase_requests').select('id,book_id,fee_amount,status,receipt_number,requested_at,reviewed_at').eq('student_id', selectedMember.id).order('requested_at', { ascending: false }),
        supabase.from('point_transactions').select('id,amount,transaction_type,description,created_at').eq('user_id', selectedMember.id).order('created_at', { ascending: false }),
        supabase.from('member_activity_ledger').select('id,occurred_at,event_type,summary,actor_role,receipt_number,related_request_type,related_request_id').eq('member_id', selectedMember.id).order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(100),
      ])
      if (!active) return
      const failed = [digital, physicalRequests, physicalLoans, fines, printPayments, ebookPurchases, pointTransactions, activityLedger].find((result) => result.error)?.error
      if (failed) {
        setMemberAccountHistoryError(`Some account history could not be loaded: ${failed.message}`)
      } else if (fineCalculation.error) {
        setMemberAccountHistoryError(`Account history loaded, but fine status could not be recalculated: ${fineCalculation.error.message}`)
      }
      setMemberFineStatusAvailable(!fines.error && !fineCalculation.error)
      setMemberAccountHistory({
        digitalLoans: (digital.data ?? []) as DigitalLoanHistoryItem[],
        physicalRequests: (physicalRequests.data ?? []) as MemberPhysicalRequest[],
        physicalLoans: (physicalLoans.data ?? []) as MemberPhysicalLoan[],
        fines: (fines.data ?? []) as MemberFine[],
        printPayments: (printPayments.data ?? []) as MemberPrintPayment[],
        ebookPurchases: (ebookPurchases.data ?? []) as MemberEbookPurchase[],
        pointTransactions: (pointTransactions.data ?? []) as MemberPointTransaction[],
        activityLedger: (activityLedger.data ?? []) as MemberLedgerEvent[],
      })
      setMemberAccountHistoryLoading(false)
    }
    void loadMemberAccountHistory()
    return () => { active = false }
  }, [selectedMember?.id])

  const bookMap = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])
  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])
  const bookFilterOptions = useMemo(() => {
    const digitalBooks = books.filter((book) => book.catalog_type !== 'physical' && book.is_archived === showArchivedBooks)
    return {
      categories: Array.from(new Set(digitalBooks.map((book) => book.category).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      authors: Array.from(new Set(digitalBooks.map((book) => book.author).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    }
  }, [books, showArchivedBooks])
  const filteredBooks = useMemo(() => {
    const digitalBooks = books.filter((book) => book.catalog_type !== 'physical' && book.is_archived === showArchivedBooks)
    const tokens = debouncedBookSearch.toLowerCase().trim().split(/\s+/)
    return digitalBooks.filter((b) =>
      (bookCategoryFilter === 'all' || b.category === bookCategoryFilter) &&
      (bookAuthorFilter === 'all' || b.author === bookAuthorFilter) &&
      (!debouncedBookSearch.trim() || tokens.every(
        (token) =>
          b.title.toLowerCase().includes(token) ||
          b.author.toLowerCase().includes(token) ||
          b.category.toLowerCase().includes(token) ||
          (b.isbn && b.isbn.toLowerCase().includes(token))
      ))
    )
  }, [books, debouncedBookSearch, bookCategoryFilter, bookAuthorFilter, showArchivedBooks])

  // Realtime subscription for incoming borrow requests
  useEffect(() => {
    if (!profile || !isAdminRole(profile.role)) return

    const supabase = getSupabase()
    const channel = supabase
      .channel('admin-realtime-requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'borrow_requests' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newReq = payload.new as RequestItem
            setRequests((prev) => (prev.some((r) => r.id === newReq.id) ? prev : [newReq, ...prev]))
            setActionMessage('New borrow request received!')
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as RequestItem
            setRequests((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: number }
            setRequests((prev) => prev.filter((r) => r.id !== deleted.id))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'book_contributions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newContribution = payload.new as Contribution
            setContributions((prev) => (prev.some((item) => item.id === newContribution.id) ? prev : [newContribution, ...prev]))
            setActionMessage('New contribution submitted!')
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Contribution
            setContributions((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as { id: number }
            setContributions((prev) => prev.filter((item) => item.id !== deleted.id))
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profile])

  const now = Date.now()
  const isActiveDigitalAccess = (request: RequestItem) =>
    request.status === 'approved' &&
    !request.returned_date &&
    Boolean(request.due_date && new Date(request.due_date).getTime() > now)
  const materials = useMemo(
    () =>
      books
        .filter((book) => book.catalog_type !== 'physical' && !!book.pdf_url)
        .map((book) => ({
          id: book.id,
          title: book.title,
          description: book.description,
          resource_url: book.pdf_url,
          created_at: book.created_at,
        })),
    [books]
  )

  const pendingRequests = requests.filter((request) => request.status === 'pending')
  const activeDigitalAccess = requests.filter(isActiveDigitalAccess)

  const activeLoansByStudent = new Map<string, number>()
  for (const request of requests) {
    if (isActiveDigitalAccess(request)) {
      activeLoansByStudent.set(request.student_id, (activeLoansByStudent.get(request.student_id) ?? 0) + 1)
    }
  }
  const studentDetails = students.map((student) => ({
    ...student,
    active_loans: activeLoansByStudent.get(student.id) ?? 0,
  }))

  const filteredStudentDetails = useMemo(() => {
    const query = debouncedUserSearch.trim().toLowerCase()
    return studentDetails.filter((student) => {
      const matchesQuery = !query || [
        student.full_name,
        student.email,
        student.role,
        student.school,
        student.department,
        student.course,
        student.student_year,
      ].filter(Boolean).join(' ').toLowerCase().includes(query)
      const matchesRole = userRoleFilter === 'all' || student.role === userRoleFilter
      const matchesLoanState = userLoanFilter === 'all'
        || (userLoanFilter === 'active' && student.active_loans > 0)
        || (userLoanFilter === 'none' && student.active_loans === 0)
      return matchesQuery && matchesRole && matchesLoanState
    })
  }, [debouncedUserSearch, studentDetails, userLoanFilter, userRoleFilter])

  const filteredDigitalLoanHistory = useMemo(() => {
    const query = debouncedDigitalHistorySearch.trim().toLowerCase()
    const now = Date.now()
    return digitalLoanHistory.filter((loan) => {
      const isReturned = Boolean(loan.returned_at)
      const request = requests.find((item) => item.id === loan.borrow_request_id)
      const isRevoked = request?.status === 'revoked' || loan.status === 'revoked'
      const isActive = request
        ? isActiveDigitalAccess(request)
        : !isReturned && Boolean(loan.due_date && new Date(loan.due_date).getTime() > now)
      const isExpired = !isReturned && !isRevoked && !isActive
      const matchesStatus = digitalHistoryStatus === 'all'
        || (digitalHistoryStatus === 'active' && isActive)
        || (digitalHistoryStatus === 'returned' && isReturned)
        || (digitalHistoryStatus === 'expired' && isExpired)
        || (digitalHistoryStatus === 'revoked' && isRevoked)
      const member = studentMap.get(loan.student_id)
      const book = bookMap.get(loan.book_id)
      const searchable = [member?.email, member?.full_name, book?.title, book?.author, loan.status, request?.status, String(loan.borrow_request_id), String(loan.id)]
        .filter(Boolean).join(' ').toLowerCase()
      return matchesStatus && (!query || searchable.includes(query))
    })
  }, [bookMap, debouncedDigitalHistorySearch, digitalHistoryStatus, digitalLoanHistory, requests, studentMap])

  const bookPageCount = Math.max(1, Math.ceil(filteredBooks.length / 10))
  const visibleBooks = filteredBooks.slice((Math.min(bookPage, bookPageCount) - 1) * 10, Math.min(bookPage, bookPageCount) * 10)
  const physicalBookTitle = (bookId: number) => books.find((book) => book.id === bookId)?.title ?? `Book #${bookId}`
  const physicalBorrowerName = (studentId: string) => students.find((student) => student.id === studentId)?.full_name?.trim() || 'Unknown borrower'
  const digitalHistoryPageCount = Math.max(1, Math.ceil(filteredDigitalLoanHistory.length / 10))
  const visibleDigitalLoanHistory = filteredDigitalLoanHistory.slice((Math.min(digitalHistoryPage, digitalHistoryPageCount) - 1) * 10, Math.min(digitalHistoryPage, digitalHistoryPageCount) * 10)
  const visibleActiveDigitalRequestIds = visibleDigitalLoanHistory.flatMap((loan) => {
    const request = requests.find((item) => item.id === loan.borrow_request_id)
    return request && isActiveDigitalAccess(request) ? [request.id] : []
  })
  const userPageCount = Math.max(1, Math.ceil(filteredStudentDetails.length / 10))
  const visibleStudentDetails = filteredStudentDetails.slice((Math.min(userPage, userPageCount) - 1) * 10, Math.min(userPage, userPageCount) * 10)
  const pendingContributions = contributions.filter((contribution) => contribution.status === 'pending')
  const contributionPageCount = Math.max(1, Math.ceil(pendingContributions.length / 10))
  const visiblePendingContributions = pendingContributions.slice((Math.min(contributionPage, contributionPageCount) - 1) * 10, Math.min(contributionPage, contributionPageCount) * 10)
  const reviewedContributions = contributions.filter((contribution) => contribution.status !== 'pending').sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
  const filteredAuditLogs = useMemo(() => {
    const query = auditSearch.trim().toLocaleLowerCase()
    if (!query) return auditLogs
    return auditLogs.filter((log) => {
      const actor = auditActors.find((item) => item.id === log.actor_id)
      const searchable = [
        log.action,
        log.target_type,
        String(log.target_id ?? ''),
        actor?.full_name,
        actor?.email,
        actor?.role,
        JSON.stringify(log.details),
      ].filter(Boolean).join(' ').toLocaleLowerCase()
      return searchable.includes(query)
    })
  }, [auditActors, auditLogs, auditSearch])
  const auditPageCount = Math.max(1, Math.ceil(filteredAuditLogs.length / 10))
  const visibleAuditLogs = filteredAuditLogs.slice((Math.min(auditPage, auditPageCount) - 1) * 10, Math.min(auditPage, auditPageCount) * 10)

  useEffect(() => { setBookPage(1) }, [debouncedBookSearch, bookCategoryFilter, bookAuthorFilter])
  useEffect(() => { setDigitalHistoryPage(1) }, [debouncedDigitalHistorySearch, digitalHistoryStatus])
  useEffect(() => { setUserPage(1) }, [debouncedUserSearch, userRoleFilter, userLoanFilter])
  useEffect(() => { setContributionPage(1) }, [contributions.length])
  useEffect(() => { setAuditPage(1) }, [auditLogs.length])
  useEffect(() => { setAuditPage(1) }, [auditSearch])

  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {}
    books.forEach((b) => {
      const cat = b.discipline?.trim() || 'Unspecified discipline'
      counts[cat] = (counts[cat] || 0) + 1
    })
    return Object.entries(counts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
  }, [books])

  const monthlyStats = useMemo(() => {
    // Group requests by month
    const monthsMap: Record<string, { requests: number; approved: number }> = {}
    const monthsList: string[] = []

    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date()
      d.setMonth(d.getMonth() - i)
      const label = d.toLocaleString('default', { month: 'short' })
      monthsMap[label] = { requests: 0, approved: 0 }
      monthsList.push(label)
    }

    requests.forEach((r) => {
      if (r.request_date) {
        const d = new Date(r.request_date)
        const label = d.toLocaleString('default', { month: 'short' })
        if (monthsMap[label]) {
          monthsMap[label].requests += 1
          if (r.status === 'approved') {
            monthsMap[label].approved += 1
          }
        }
      }
    })

    return monthsList.map((label) => ({
      label,
      requests: monthsMap[label].requests,
      approved: monthsMap[label].approved,
    }))
  }, [requests])

  const storageCount = useMemo(() => {
    return books.filter((b) => b.pdf_url && !b.pdf_url.startsWith('http://') && !b.pdf_url.startsWith('https://')).length
  }, [books])

  const handleLogout = async () => {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const handleRevoke = async (requestId: number) => {
    setConfirmAction({ type: 'revokeLoan', id: requestId })
  }

  const executeRevoke = async (requestId: number) => {
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const supabase = getSupabase()
    const { error } = await supabase.rpc('revoke_digital_loan', { request_id: requestId })
    if (error) {
      setError(error.message)
    } else {
      await loadData()
      setActionMessage('Digital access revoked.')
    }
    setSaving(false)
    setConfirmAction(null)
  }

  const executeBulkRevoke = async () => {
    const ids = selectedDigitalLoanIds
    if (!ids.length) return
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const supabase = getSupabase()
    const failed: number[] = []
    for (const requestId of ids) {
      const { error } = await supabase.rpc('revoke_digital_loan', { request_id: requestId })
      if (error) failed.push(requestId)
    }
    const succeeded = ids.length - failed.length
    setSelectedDigitalLoanIds(failed)
    if (succeeded) await loadData()
    setBulkRevokeOpen(false)
    setActionMessage(failed.length ? `Revoked ${succeeded} loan${succeeded === 1 ? '' : 's'}; ${failed.length} could not be revoked.` : `Revoked ${succeeded} digital loan${succeeded === 1 ? '' : 's'}.`)
    if (failed.length) setError(`Could not revoke request IDs: ${failed.join(', ')}. Review their current status and try again.`)
    setSaving(false)
  }

  const executeBulkContributionReview = async () => {
    if (!bulkContributionReview || !selectedContributionIds.length) return
    const { decision } = bulkContributionReview
    const reward = decision === 'approved' ? Number(bulkContributionReview.reward) : 0
    const rejectionReason = bulkContributionReview.rejectionReason
    if (decision === 'approved' && (!Number.isSafeInteger(reward) || reward < 0 || reward > 100)) {
      setError('Lesson reward must be a whole number between 0 and 100 points.')
      return
    }
    if (decision === 'rejected' && !['Poor Scan Quality', 'Copyright Violation', 'Incorrect Metadata'].includes(rejectionReason)) {
      setError('Choose a structured rejection reason.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = getSupabase()
    const failed: number[] = []
    for (const contributionId of selectedContributionIds) {
      const { error } = await supabase.rpc('admin_review_book_contribution', {
        contribution_id: contributionId, decision, reward_points: reward, access_points: 0,
        rejection_reason: rejectionReason || null,
      })
      if (error) failed.push(contributionId)
    }
    const succeeded = selectedContributionIds.length - failed.length
    setSelectedContributionIds(failed)
    setBulkContributionReview(null)
    if (succeeded) await loadData()
    setActionMessage(failed.length ? `Processed ${succeeded}; ${failed.length} lesson${failed.length === 1 ? '' : 's'} need review.` : `${succeeded} lesson${succeeded === 1 ? '' : 's'} ${decision}.`)
    if (failed.length) setError(`Could not process contribution IDs: ${failed.join(', ')}.`)
    setSaving(false)
  }

  const executeDeleteMember = async (memberId: string, label: string) => {
    setSaving(true)
    setError(null)
    setActionMessage(null)
    try {
      const response = await fetch('/api/admin/students', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: memberId }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setError(result?.error || 'Unable to delete the member account.')
      } else {
        setSelectedMember(null)
        await loadData()
        setActionMessage(`${label} account deleted.`)
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete the member account.')
    } finally {
      setSaving(false)
      setConfirmAction(null)
    }
  }

  const openMemberEditor = (member: Profile) => {
    setEditingMember(member)
    setMemberEditForm({
      role: member.role === 'faculty' ? 'faculty' : member.role === 'librarian' ? 'librarian' : 'student',
      school: member.school ?? '',
      department: member.department ?? '',
      course: memberCourseFormValue(member.course, academicCourses),
      studentYear: memberYearDisplay(member.student_year) === 'Not set' || memberYearDisplay(member.student_year) === 'Needs review' ? member.student_year ?? '' : memberYearDisplay(member.student_year),
      institutionalId: member.institutional_id ?? '',
    })
    setError(null)
  }

  const saveMemberProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingMember || !memberEditForm) return
    if (memberEditForm.role === 'student') {
      if (!academicCourses.some((course) => course.is_active && course.name === memberEditForm.course)) {
        setError('Choose an active course from the catalog before saving this student profile.')
        return
      }
      if (!['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].includes(memberEditForm.studentYear)) {
        setError('Choose a valid year level before saving this student profile.')
        return
      }
    }
    if (memberEditForm.role === 'faculty') {
      if (!academicDepartments.some((faculty) => faculty.is_active && faculty.name === memberEditForm.department)) {
        setError('Choose an active faculty before saving this profile.')
        return
      }
    }
    if (memberEditForm.role !== 'librarian' && !/^\d{4}-\d{5}$/.test(memberEditForm.institutionalId)) {
      setError('Enter a 9-digit institutional ID in NNNN-NNNNN format.')
      return
    }
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const { error } = await getSupabase().rpc('admin_update_member_academics', {
      target_user_id: editingMember.id,
      new_role: memberEditForm.role,
      new_school: memberEditForm.school.trim() || null,
      new_department: memberEditForm.role === 'faculty' ? memberEditForm.department.trim() || null : null,
      new_course: memberEditForm.role === 'student' ? memberEditForm.course.trim() || null : null,
      new_student_year: memberEditForm.role === 'student' ? memberEditForm.studentYear.trim() || null : null,
      new_faculty_rank_id: null,
      new_institutional_id: memberEditForm.role === 'librarian' ? null : memberEditForm.institutionalId,
    })
    if (error) {
      setError(error.message)
    } else {
      setEditingMember(null)
      setMemberEditForm(null)
      await loadData()
      setActionMessage('Member profile saved.')
    }
    setSaving(false)
  }

  const addAcademicCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = courseDraft.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const supabase = getSupabase()
    const { error } = await supabase.from('academic_courses').insert({ name })
    if (error) {
      setError(error.code === '23505' ? 'That course already exists.' : error.message)
    } else {
      setCourseDraft('')
      await loadData()
      setActionMessage('Course added.')
    }
    setSaving(false)
  }

  const addAcademicFaculty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = facultyDraft.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const { error } = await getSupabase().from('academic_departments').insert({ name, is_active: true })
    if (error) {
      setError(error.code === '23505' ? 'That faculty already exists.' : error.message)
    } else {
      setFacultyDraft('')
      await loadData()
      setActionMessage('Faculty added.')
    }
    setSaving(false)
  }

  const removeAcademicFaculty = async (faculty: AcademicDepartment) => {
    setSaving(true)
    setError(null)
    const { error } = await getSupabase().from('academic_departments').update({ is_active: false }).eq('id', faculty.id)
    if (error) setError(error.message)
    else {
      await loadData()
      setActionMessage(`${faculty.name} was removed from available faculty choices.`)
    }
    setSaving(false)
  }

  const removeAcademicCourse = async (course: AcademicCourse) => {
    setSaving(true)
    setError(null)
    const { error } = await getSupabase().from('academic_courses').update({ is_active: false }).eq('id', course.id)
    if (error) setError(error.message)
    else {
      await loadData()
      setActionMessage(`${course.name} was removed from the available course choices.`)
    }
    setSaving(false)
  }

  const handleContributionReview = async (contributionId: number, decision: 'approved' | 'rejected') => {
    setReviewDialog({ id: contributionId, decision, reward: decision === 'approved' ? String(defaultLessonReward) : '0', rejectionReason: '' })
  }

  const executeContributionReview = async () => {
    if (!reviewDialog) return
    const { id: contributionId, decision } = reviewDialog
    const reward = decision === 'approved' ? Number(reviewDialog.reward) : 0
    if (decision === 'approved' && (!Number.isSafeInteger(reward) || reward < 0 || reward > 100)) {
      setError('Lesson reward must be a whole number between 0 and 100 points.')
      return
    }
    if (decision === 'rejected' && !['Poor Scan Quality', 'Copyright Violation', 'Incorrect Metadata'].includes(reviewDialog.rejectionReason)) {
      setError('Choose a structured rejection reason.')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await getSupabase().rpc('admin_review_book_contribution', {
      contribution_id: contributionId,
      decision,
      reward_points: reward,
      access_points: 0,
      rejection_reason: reviewDialog.rejectionReason || null,
    })
    if (error) {
      setActionSuccessTitle(null)
      setError(error.message)
    } else {
      setReviewDialog(null)
      setActionSuccessTitle(decision === 'approved' ? 'Approved' : 'Rejected')
      setActionMessage(decision === 'approved' ? `Lesson approved. ${reward} points awarded.` : 'Lesson rejected.')
      if (inspectingContribution?.id === contributionId) setInspectingContribution(null)
      await loadData()
    }
    setSaving(false)
    setReviewDialog(null)
  }

  const handleContributionRevision = async (contributionId: number) => {
    setRevisionDialog({ id: contributionId, feedback: 'Please add clearer sources, structure, or explanations.' })
  }

  const executeContributionRevision = async () => {
    if (!revisionDialog || !revisionDialog.feedback.trim()) return
    const { id: contributionId, feedback } = revisionDialog
    setSaving(true)
    setError(null)
    const { error } = await getSupabase().rpc('admin_request_contribution_revision', { contribution_id: contributionId, feedback: feedback.trim() })
    if (error) setError(error.message)
    else { setActionMessage('Revision request sent to the student.'); await loadData() }
    setSaving(false)
    setRevisionDialog(null)
  }

  const handleCreateStudent = async (event: FormEvent<HTMLFormElement>): Promise<boolean> => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const response = await fetch('/api/admin/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStudent),
    })
    const data = await response.json()
    if (!response.ok) {
      setError(data.error || 'Unable to create student account.')
      setSaving(false)
      return false
    } else {
      setActionMessage(`Invitation sent to ${data.email}. Username: ${data.username}.`)
      setNewStudent({ username: '', email: '', fullName: '', role: 'student', school: '', department: '', course: '', studentYear: '', institutionalId: '' })
      await loadData()
    }
    setSaving(false)
    return true
  }

  const handleAddBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newBook.title.trim() || !newBook.author.trim() || (!newBook.category.trim() && !newBook.genre.trim()) || !newBook.isbn.trim()) {
      setError('Title, author, ISBN, and at least one discipline or genre are required.')
      return
    }
    setSaving(true)
    setActionMessage(null)
    setError(null)

    const rawAccessCosts = DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [String(days), newBook.access_costs[String(days)]?.trim() ?? ''] as const)
    if (newBook.access_mode === 'points' && rawAccessCosts.some(([, value]) => value === '')) {
      setError('Enter a points cost for every access duration.')
      setSaving(false)
      return
    }
    const parsedAccessCosts = Object.fromEntries(rawAccessCosts.map(([days, value]) => [days, Number(value || 0)]))
    if (newBook.access_mode === 'points' && Object.values(parsedAccessCosts).some((cost) => !Number.isInteger(cost) || cost < 0)) {
      setError('Each access cost must be a whole number of points greater than or equal to zero.')
      setSaving(false)
      return
    }

    const supabase = getSupabase()
    let finalPdfUrl = newBook.pdf_url.trim()
    let storageMetadata: Record<string, unknown> = { storage_provider: finalPdfUrl ? 'external' : 'supabase' }

    // If admin selected a PDF file to upload to Supabase Storage
    if (newBookFile) {
      setActionMessage('Uploading e-book to library storage...')
      const formData = new FormData()
      formData.append('file', newBookFile)
      formData.append('category', newBook.category || newBook.genre)
      formData.append('isbn', newBook.isbn.trim())
      formData.append('provider', 'supabase')
      formData.append('allow_fallback', 'false')
      const uploadResponse = await fetch('/api/storage/upload', { method: 'POST', body: formData })
      const uploadResult = await uploadResponse.json()
      if (!uploadResponse.ok) {
        setError(`Upload failed: ${uploadResult.error || 'Unable to upload PDF.'}`)
        setSaving(false)
        return
      }
      finalPdfUrl = uploadResult.pdf_url || uploadResult.storage_path || ''
      storageMetadata = { storage_provider: uploadResult.storage_provider, storage_file_id: uploadResult.storage_file_id || null, storage_path: uploadResult.storage_path || null, file_name: uploadResult.file_name || newBookFile.name, file_size: uploadResult.file_size || newBookFile.size, mime_type: uploadResult.mime_type || 'application/pdf' }
    }

    if (newBook.access_mode === 'points' && /^https?:\/\//i.test(finalPdfUrl)) {
      setError('Points-based resources must use a PDF uploaded to protected library storage.')
      setSaving(false)
      return
    }
    const { error } = await supabase.from('books').insert([
      {
        title: newBook.title,
        author: newBook.author,
        category: newBook.category.trim() || newBook.genre.trim(),
        discipline: newBook.category.trim() || null,
        genre: newBook.genre.trim() || null,
        course_code: newBook.course_code.trim() || null,
        source_type: newBook.source_type,
        isbn: newBook.isbn || null,
        pdf_url: finalPdfUrl || null,
        ...storageMetadata,
        description: newBook.description || null,
        access_points: newBook.access_mode === 'points' ? parsedAccessCosts['7'] : 0,
        access_costs: newBook.access_mode === 'points' ? parsedAccessCosts : {},
        access_mode: newBook.access_mode,
        catalog_type: 'digital',
        access_duration_days: Number(newBook.access_duration_days) || 30,
        total_copies: 0,
        available_copies: 0,
      },
    ])

    if (error) {
      setError(error.message)
    } else {
      setActionMessage('New e-book added to the online catalog.')
      setNewBook({ title: '', author: '', category: '', genre: '', source_type: 'staff_added', course_code: '', isbn: '', pdf_url: '', access_costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string>, access_mode: 'free', access_duration_days: '30', description: '' })
      setNewBookFile(null)
      setNewBookOpen(false)
      await loadData()
    }

    setSaving(false)
  }

  const openPdfAttachment = (bookId: number | null = null) => {
    setPdfBookId(bookId)
    setPdfUrl('')
    setMaterialFile(null)
    setPdfAttachmentOpen(true)
  }

  const attachPdfToBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!pdfBookId || (!pdfUrl && !materialFile)) {
      setError('Please select a book and either upload a PDF file or provide a URL.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = getSupabase()
    let finalUrl = pdfUrl.trim()
    let attachedStorage: Record<string, unknown> = { storage_provider: finalUrl ? 'external' : 'supabase' }
    if (materialFile) {
      setActionMessage('Uploading e-book to library storage...')
      const formData = new FormData()
      formData.append('file', materialFile)
      formData.append('category', 'Books')
      formData.append('isbn', books.find((book) => book.id === pdfBookId)?.isbn ?? '')
      formData.append('provider', 'supabase')
      formData.append('allow_fallback', 'false')
      const uploadResponse = await fetch('/api/storage/upload', { method: 'POST', body: formData })
      const uploadResult = await uploadResponse.json()
      if (!uploadResponse.ok) {
        setError(`Upload failed: ${uploadResult.error || 'Unable to upload PDF.'}`)
        setSaving(false)
        return
      }
      finalUrl = uploadResult.pdf_url || uploadResult.storage_path || ''
      attachedStorage = { storage_provider: uploadResult.storage_provider, storage_file_id: uploadResult.storage_file_id || null, storage_path: uploadResult.storage_path || null, file_name: uploadResult.file_name || materialFile.name, file_size: uploadResult.file_size || materialFile.size, mime_type: uploadResult.mime_type || 'application/pdf' }
    }
    const { error } = await supabase.from('books').update({ pdf_url: finalUrl, ...attachedStorage }).eq('id', pdfBookId)
    if (error) setError(error.message)
    else {
      setActionMessage('PDF attached to the catalog title successfully.')
      setPdfAttachmentOpen(false)
      setPdfBookId(null)
      setPdfUrl('')
      setMaterialFile(null)
      await loadData()
    }
    setSaving(false)
  }

  if (dashboardLoadError) {
    return <main className="surface-page flex min-h-screen items-center justify-center px-6 py-12">
      <section role="alert" className="surface-card w-full max-w-xl p-8">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Admin dashboard unavailable</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{dashboardLoadError}</p>
        <button type="button" disabled={loading} onClick={() => {
          setLoading(true)
          setDashboardLoadError(null)
          void loadData().catch((cause: unknown) => {
            setDashboardLoadError(cause instanceof Error
              ? `Unable to load the admin dashboard. Refresh and try again. (${cause.message})`
              : 'Unable to load the admin dashboard. Refresh and try again.')
            setLoading(false)
          })
        }} className="pine-action mt-6 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50">
          {loading ? 'Retrying…' : 'Retry'}
        </button>
      </section>
    </main>
  }

  return (
    <div className="dashboard-shell admin-shell min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      {sidebarOpen ? <button type="button" className="admin-sidebar-backdrop" aria-label="Close admin navigation" onClick={() => setSidebarOpen(false)} /> : null}
      <div className={`dashboard-layout admin-layout mx-auto max-w-[1500px] ${sidebarCollapsed ? 'dashboard-sidebar-collapsed admin-sidebar-collapsed' : ''}`}>
        <aside id="admin-navigation" className={`dashboard-sidebar admin-sidebar ${sidebarOpen ? 'dashboard-sidebar-open admin-sidebar-open' : ''}`}>
          <div className="admin-sidebar-brand mb-8 space-y-3">
            <div className="admin-sidebar-brand-row">
              <BrandLogo className="admin-brand-logo" iconSize="sm" subtitle="Admin workspace" />
              <button type="button" className="admin-sidebar-toggle" onClick={() => { if (sidebarOpen) setSidebarOpen(false); else setSidebarCollapsed((current) => !current) }} aria-controls="admin-navigation" aria-label={sidebarOpen ? 'Close admin navigation' : sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'} title={sidebarOpen ? 'Close admin navigation' : sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{sidebarOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d={sidebarCollapsed ? 'm9 18 6-6-6-6' : 'm15 18-6-6 6-6'} />}</svg></button>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Admin Menu</p>
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Control Panel</h2>
            </div>
          </div>
          <nav className="admin-nav-groups">
            {navGroups.map((group) => <div key={group.label} className="admin-nav-group">
              <p className="admin-nav-group-label">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => <button key={item.section} type="button" onClick={() => { navigateToSection(item.section); setSidebarOpen(false) }} aria-current={section === item.section ? 'page' : undefined} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined} className={`admin-nav-button w-full text-left rounded-2xl px-4 py-3 text-sm font-medium transition ${section === item.section ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80'}`}><span className="admin-nav-icon"><AdminNavIcon section={item.section} /></span><span>{item.label}</span></button>)}
              </div>
            </div>)}
          </nav>
          <div className="admin-sidebar-footer mt-8 space-y-3">
            <div className="admin-theme-control"><ThemeToggle /></div>
            <button
              type="button"
              onClick={() => router.push('/profile')}
              aria-label="Profile"
              title={sidebarCollapsed ? 'Profile' : undefined}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>
              <span>Profile</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              title={sidebarCollapsed ? 'Sign out' : undefined}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>
              <span>Sign out</span>
            </button>
          </div>
        </aside>

        <main className="dashboard-workspace admin-workspace space-y-6">
          {loading ? (
            <AdminDashboardSkeleton />
          ) : (
            <>
          <header className={`dashboard-hero rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40${section === 'overview' ? ' admin-welcome-hero' : ''}`}>
            <button type="button" className="admin-mobile-toggle" onClick={() => setSidebarOpen(true)} aria-controls="admin-navigation" aria-expanded={sidebarOpen} aria-label="Open admin navigation"><span aria-hidden="true">☰</span></button>
            <div className={`admin-welcome-layout${section === 'overview' ? ' admin-welcome-layout--overview' : ''}`}>
              <div className="admin-welcome-copy">
                {section === 'overview' ? <p className="admin-overview-kicker">Library administration</p> : null}
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Welcome back, {profile?.full_name?.trim() || 'Admin'}</h1>
                {section === 'overview' ? <p className="admin-welcome-caption">A clear view of what needs attention and how your library is doing.</p> : null}
              </div>
              {section === 'overview' ? <nav className="admin-overview-actions" aria-label="Quick actions">
                <button type="button" onClick={() => { setSection('users'); setMemberToolModal('createMember') }} className="admin-quick-action">
                  <span className="admin-quick-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0M19 8v6m-3-3h6" /></svg></span>
                  <span><strong>Invite a member</strong><small>Add a student or staff account</small></span><span className="admin-quick-action-arrow" aria-hidden="true">↗</span>
                </button>
                <button type="button" onClick={() => setSection('users')} className="admin-quick-action">
                  <span className="admin-quick-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5 14.6 9l6 .8-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6-4.3-4.2 6-.8L12 3.5Z" /></svg></span>
                  <span><strong>Record point top-up</strong><small>Choose a member and record cash</small></span><span className="admin-quick-action-arrow" aria-hidden="true">↗</span>
                </button>
                <button type="button" onClick={() => navigateToSection('physical')} className="admin-quick-action">
                  <span className="admin-quick-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5v-12Z" /><path d="M4 6v12m5-11h7m-7 4h7" /></svg></span>
                  <span><strong>Add a physical book</strong><small>Grow your physical catalog</small></span><span className="admin-quick-action-arrow" aria-hidden="true">↗</span>
                </button>
              </nav> : null}
            </div>
          </header>

          {section === 'overview' && (
            <section className="admin-overview">
              <section className="admin-overview-panel admin-attention-panel" aria-labelledby="admin-oversight-title">
                <div className="admin-overview-section-heading admin-attention-heading">
                  <div>
                    <p className="admin-overview-kicker">Needs a closer look</p>
                    <h2 id="admin-oversight-title">Management attention</h2>
                    <p>Review member and catalog activity here. Physical checkout and return processing stays with the librarian desk.</p>
                  </div>
                </div>
                <div className="admin-attention-grid">
                  <button type="button" onClick={() => navigateToSection('contributions')} aria-label={`Review ${pendingContributions.length} pending contributions`} className="admin-attention-card admin-attention-card--amber">
                    <span className="admin-attention-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 4 7v5c0 4.3 3.2 7.7 8 9 4.8-1.3 8-4.7 8-9V7l-8-4Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></svg></span>
                    <span className="admin-attention-label">Contributions</span>
                    <strong>{pendingContributions.length}</strong>
                    <span className="admin-attention-detail">{pendingContributions.length ? 'Waiting for your review' : 'Nothing waiting for review'}</span>
                    <span className="admin-attention-link">Review contributions <span aria-hidden="true">→</span></span>
                  </button>
                  <button type="button" onClick={() => navigateToSection('requests')} aria-label={`Open ${pendingRequests.length} digital access requests`} className="admin-attention-card admin-attention-card--blue">
                    <span className="admin-attention-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3.5h9l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5Z" /><path d="M14 4v5h5m-9 4h5m-5 3h5" /></svg></span>
                    <span className="admin-attention-label">Digital access</span>
                    <strong>{pendingRequests.length}</strong>
                    <span className="admin-attention-detail">{pendingRequests.length ? 'Requests awaiting review' : 'No requests awaiting review'}</span>
                    <span className="admin-attention-link">View request history <span aria-hidden="true">→</span></span>
                  </button>
                  <article className="admin-attention-card admin-attention-card--forest">
                    <span className="admin-attention-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4z" /><path d="M8 9h8m-8 3h8m-8 3h4" /><path d="M7 5V3m10 2V3" /></svg></span>
                    <span className="admin-attention-label">Physical requests</span>
                    <strong>{circulationSummary ? circulationSummary.pendingRequests : '—'}</strong>
                    <span className="admin-attention-detail">{circulationSummary ? 'At the librarian desk' : 'Circulation data unavailable'}</span>
                    <span className="admin-attention-note">Handled by a librarian</span>
                  </article>
                  <article className="admin-attention-card admin-attention-card--rose">
                    <span className="admin-attention-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.8 19h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></svg></span>
                    <span className="admin-attention-label">Items classified lost</span>
                    <strong>{circulationSummary ? circulationSummary.lostLoans : '—'}</strong>
                    <span className="admin-attention-detail">{circulationSummary?.lostLoans ? 'Needs librarian follow-up' : circulationSummary ? 'No lost items reported' : 'Circulation data unavailable'}</span>
                    <span className="admin-attention-note">Librarian follow-up</span>
                  </article>
                </div>
              </section>

              <section className="admin-overview-panel admin-glance-panel" aria-labelledby="admin-glance-title">
                <div className="admin-overview-section-heading">
                  <div>
                    <p className="admin-overview-kicker">The bigger picture</p>
                    <h2 id="admin-glance-title">Your library at a glance</h2>
                    <p>A live snapshot of the library’s reach and activity.</p>
                  </div>
                </div>
                <div className="admin-glance-grid">
                  {[
                    { label: 'Catalog titles', value: books.length, note: 'Across all formats', tone: 'sage', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5v-12Z" /><path d="M4 6v12m5-11h7m-7 4h7" /></svg> },
                    { label: 'Student accounts', value: students.length, note: 'In the community', tone: 'blue', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0m2-8a3.5 3.5 0 1 0 0-7m1 10a5.8 5.8 0 0 1 3 5" /></svg> },
                    { label: 'Active digital access', value: activeDigitalAccess.length, note: 'Available to members', tone: 'gold', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3.5h9l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5Z" /><path d="M14 4v5h5m-9 4 2 2 4-4" /></svg> },
                    { label: 'Digital access records', value: requests.length, note: 'All recorded requests', tone: 'plum', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v16H5z" /><path d="M8 8h8m-8 4h8m-8 4h5" /></svg> },
                  ].map((stat) => <article key={stat.label} className={`admin-glance-stat admin-glance-stat--${stat.tone}`}>
                    <span className="admin-glance-icon" aria-hidden="true">{stat.icon}</span>
                    <span className="admin-glance-label">{stat.label}</span>
                    <strong>{stat.value}</strong>
                    <span className="admin-glance-note">{stat.note}</span>
                  </article>)}
                </div>
              </section>
              <section id="admin-detailed-analytics" className="admin-overview-panel" aria-labelledby="admin-analytics-title">
                <div className="mb-5">
                  <p className="admin-overview-kicker">Trends and usage</p>
                  <h2 id="admin-analytics-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Library activity</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Borrowing, fulfillment, storage, and catalog trends in one place.</p>
                </div>
                <AdminAnalytics
                  totalBooks={books.length}
                  totalStudents={students.length}
                  totalRequests={requests.length}
                  totalApprovedRequests={requests.filter((request) => request.status === 'approved').length}
                  totalLoansActive={activeDigitalAccess.length}
                  totalReturned={requests.filter((request) => request.status === 'returned').length}
                  categoryStats={categoryStats}
                  monthlyStats={monthlyStats}
                  storageCount={storageCount}
                />
              </section>
            </section>
          )}

          {section === 'books' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6 space-y-4 border-b border-slate-200 pb-5 dark:border-slate-700">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                        {showArchivedBooks ? 'Archived books' : 'Digital catalog'}
                      </h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {filteredBooks.length} {filteredBooks.length === 1 ? 'title' : 'titles'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {showArchivedBooks
                        ? 'Archived titles hidden from members. Existing loan records remain preserved.'
                        : 'Manage digital e-books, access costs, format licenses, and attached PDF documents.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowArchivedBooks((current) => !current)
                        setBookPage(1)
                        setBookCategoryFilter('all')
                        setBookAuthorFilter('all')
                      }}
                      className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      {showArchivedBooks ? 'View active' : 'View archived'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewBookOpen(true)}
                      className="pine-action rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition"
                    >
                      + Add digital title
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                  <div className="relative flex-1">
                    <input
                      type="search"
                      value={bookSearch}
                      onChange={(e) => setBookSearch(e.target.value)}
                      placeholder="Search books by title, author, category..."
                      className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-3.5 pr-8 text-xs text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    {bookSearch ? (
                      <button
                        type="button"
                        onClick={() => setBookSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label="Clear book search"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={bookCategoryFilter}
                      onChange={(event) => setBookCategoryFilter(event.target.value)}
                      aria-label="Filter books by category"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="all">All categories</option>
                      {bookFilterOptions.categories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <select
                      value={bookAuthorFilter}
                      onChange={(event) => setBookAuthorFilter(event.target.value)}
                      aria-label="Filter books by author"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="all">All authors</option>
                      {bookFilterOptions.authors.map((author) => (
                        <option key={author} value={author}>{author}</option>
                      ))}
                    </select>
                    {(bookSearch || bookCategoryFilter !== 'all' || bookAuthorFilter !== 'all') ? (
                      <button
                        type="button"
                        onClick={() => {
                          setBookSearch('')
                          setBookCategoryFilter('all')
                          setBookAuthorFilter('all')
                        }}
                        className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Reset filters
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] table-fixed text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                      <tr><th className="w-[21%] px-2 py-3 sm:px-4">Title</th><th className="w-[13%] px-2 py-3 sm:px-4">Author</th><th className="w-[13%] px-2 py-3 sm:px-4">Category</th><th className="w-[9%] px-2 py-3 sm:px-4">Format</th><th className="w-[17%] px-2 py-3 sm:px-4">Access cost</th><th className="w-[9%] px-2 py-3 sm:px-4">File</th><th className="w-[18%] px-2 py-3 sm:px-4">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {visibleBooks.map((book) => <Fragment key={book.id}>
                        <tr className="bg-white align-top dark:bg-slate-900">
                          <td className="px-4 py-4"><p className="font-semibold text-slate-900 dark:text-slate-100">{book.title}</p>{book.is_archived ? <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Archived</span> : null}<p className="mt-1 text-xs text-slate-500">ISBN: {book.isbn || 'N/A'}</p></td>
                          <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{book.author}</td>
                          <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{book.category}</td>
                          <td className="px-4 py-4 capitalize text-slate-600 dark:text-slate-300">{book.catalog_type}</td>
                          <td className="px-4 py-4"><span className="font-medium text-slate-900 dark:text-slate-100">{book.access_mode === 'points' ? 'Points' : 'Free'}</span>{book.access_mode === 'points' ? <><span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">{book.access_costs?.['1'] ?? getDigitalAccessCost(book.access_points, 1)} pts · 1 day</span><details className="mt-1 text-xs"><summary className="w-fit cursor-pointer font-semibold text-emerald-800 underline dark:text-emerald-300">View tiers</summary><ul className="mt-1 space-y-0.5 text-slate-500 dark:text-slate-400">{DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => <li key={days}>{days} days: {book.access_costs?.[String(days) as keyof DigitalAccessCosts] ?? getDigitalAccessCost(book.access_points, days)} pts</li>)}</ul></details></> : null}</td>
                          <td className="px-4 py-4">{book.pdf_url || book.storage_file_id || book.storage_path ? <span className="rounded-md bg-pine-100 px-2 py-1 text-[10px] font-bold text-pine-700 dark:bg-forest-700 dark:text-pine-200">{book.storage_provider === 'external' ? 'External' : 'File ready'}</span> : <span className="text-xs text-slate-400">Missing</span>}</td>
                          <td className="px-4 py-4"><button type="button" disabled={saving} onClick={() => openCatalogBook(book)} className="rounded-xl border border-pine-300 px-3 py-2 text-xs font-semibold text-pine-800 transition hover:bg-pine-50 disabled:opacity-50 dark:border-pine-700 dark:text-pine-200 dark:hover:bg-pine-950/30">Manage book</button></td>
                        </tr>
                      </Fragment>) }
                      {filteredBooks.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-300">No matching books found.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
                <ListPagination page={Math.min(bookPage, bookPageCount)} pageCount={bookPageCount} total={filteredBooks.length} onPageChange={setBookPage} />
              </div>

              {selectedCatalogBook ? <div className="fixed inset-0 z-[60] bg-slate-950/60" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setSelectedCatalogBook(null); setEditingBookId(null); setEditingBookDetailsId(null) } }}>
                <section className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-7" role="dialog" aria-modal="true" aria-labelledby="catalog-book-details-title">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">Catalog book</p><h3 id="catalog-book-details-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{selectedCatalogBook.title}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedCatalogBook.author} · {selectedCatalogBook.discipline || selectedCatalogBook.genre || selectedCatalogBook.category}{selectedCatalogBook.genre && selectedCatalogBook.discipline ? ` · ${selectedCatalogBook.genre}` : ''}{selectedCatalogBook.course_code ? ` · Course ${selectedCatalogBook.course_code}` : ''}</p><p className="mt-1 text-xs capitalize text-slate-400">Source: {selectedCatalogBook.source_type.replace(/_/g, ' ')}</p></div>
                    <button type="button" onClick={() => { setSelectedCatalogBook(null); setEditingBookId(null) }} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">Format</p><p className="mt-1 font-semibold capitalize">{selectedCatalogBook.catalog_type}</p></div><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">Access</p><p className="mt-1 font-semibold capitalize">{selectedCatalogBook.access_mode}</p></div><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">ISBN</p><p className="mt-1 font-semibold">{selectedCatalogBook.isbn || 'Not set'}</p></div><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">File</p><p className="mt-1 font-semibold">{selectedCatalogBook.pdf_url || selectedCatalogBook.storage_path || selectedCatalogBook.storage_file_id ? 'Available' : 'Missing'}</p></div></div>
                  <div className="mt-6 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist" aria-label="Book management sections">
                    {([['metadata', 'Metadata'], ['attachments', 'Attachments'], ['permissions', 'Permissions']] as const).map(([tab, label]) => <button key={tab} type="button" role="tab" aria-selected={bookManagementTab === tab} onClick={() => { setBookManagementTab(tab); setEditingBookId(null); setEditingBookDetailsId(null) }} className={`rounded-lg px-2 py-2 text-sm font-semibold ${bookManagementTab === tab ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>{label}</button>)}
                  </div>
                  {bookManagementTab === 'metadata' ? <section role="tabpanel" className="mt-5 space-y-4">
                    {editingBookDetailsId === selectedCatalogBook.id ? null : <dl className="grid gap-x-4 gap-y-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-700">
                      <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Title</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCatalogBook.title}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Author</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCatalogBook.author}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">ISBN</dt><dd className="mt-1 break-all text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCatalogBook.isbn || 'Not listed'}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Discipline</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCatalogBook.discipline || selectedCatalogBook.category || 'Not set'}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Genre</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCatalogBook.genre || 'Not set'}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Course code</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCatalogBook.course_code || 'Not set'}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Source</dt><dd className="mt-1 text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">{selectedCatalogBook.source_type.replace(/_/g, ' ')}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Format and access</dt><dd className="mt-1 text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">{selectedCatalogBook.catalog_type} · {selectedCatalogBook.access_mode}</dd></div>
                      <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">File</dt><dd className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCatalogBook.pdf_url || selectedCatalogBook.storage_path || selectedCatalogBook.storage_file_id ? 'Available' : 'Missing'}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Description</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">{selectedCatalogBook.description || 'No description has been added.'}</dd></div>
                    </dl>}
                    {editingBookDetailsId === selectedCatalogBook.id ? <form onSubmit={(event) => void saveBookDetailsEdit(event, selectedCatalogBook)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold">Title<input required maxLength={300} value={bookDetailsDraft.title} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label>
                        <label className="text-xs font-semibold">Author<input required maxLength={200} value={bookDetailsDraft.author} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, author: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label>
                        <label className="text-xs font-semibold">Discipline<input maxLength={120} value={bookDetailsDraft.category} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label>
                        <label className="text-xs font-semibold">Genre<input maxLength={120} value={bookDetailsDraft.genre} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, genre: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label>
                        <label className="text-xs font-semibold">Course code<input maxLength={32} value={bookDetailsDraft.courseCode} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, courseCode: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label>
                        <label className="text-xs font-semibold">Source type<select value={bookDetailsDraft.sourceType} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, sourceType: event.target.value as Book['source_type'] }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900"><option value="catalog">Catalog</option><option value="staff_added">Staff-added</option><option value="community_contribution">Community contribution</option></select></label>
                        <label className="text-xs font-semibold">ISBN<input maxLength={32} value={bookDetailsDraft.isbn} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, isbn: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /><button type="button" onClick={() => generateBookIsbn((isbn) => setBookDetailsDraft((current) => ({ ...current, isbn })), selectedCatalogBook.id)} className="mt-2 text-sky-700 underline dark:text-sky-300">Generate ISBN-13</button></label>
                        <label className="text-xs font-semibold sm:col-span-2">Description<textarea maxLength={5000} rows={4} value={bookDetailsDraft.description} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label>
                      </div>
                      <div className="mt-4 flex gap-2"><button type="submit" disabled={saving} className="pine-action rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save details'}</button><button type="button" disabled={saving} onClick={() => setEditingBookDetailsId(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Cancel</button></div>
                    </form> : <button type="button" disabled={saving} onClick={() => startBookDetailsEdit(selectedCatalogBook)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Edit metadata</button>}
                  </section> : null}
                  {bookManagementTab === 'attachments' ? <section role="tabpanel" className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                    <h4 className="font-semibold">PDF attachment</h4>
                    <p className="mt-2 text-sm text-slate-500">{selectedCatalogBook.pdf_url || selectedCatalogBook.storage_path || selectedCatalogBook.storage_file_id ? 'A PDF is attached to this book.' : 'No PDF is attached.'}</p>
                    <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={saving || !(selectedCatalogBook.pdf_url || selectedCatalogBook.storage_path)} onClick={() => window.open(`/reader/${selectedCatalogBook.id}`, '_blank', 'noopener,noreferrer')} className="pine-action rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Open reader</button><button type="button" disabled={saving} onClick={() => openPdfAttachment(selectedCatalogBook.id)} className="rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-semibold text-sky-700 dark:border-sky-800 dark:text-sky-300">{selectedCatalogBook.pdf_url || selectedCatalogBook.storage_path ? 'Replace PDF' : 'Attach PDF'}</button></div>
                  </section> : null}
                  {bookManagementTab === 'permissions' ? <section role="tabpanel" className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><p className="text-sm">Access mode: <strong className="capitalize">{selectedCatalogBook.access_mode}</strong></p><p className="mt-1 text-xs text-slate-500">Configure access mode and point costs for each duration.</p></div>
                    {editingBookId === selectedCatalogBook.id ? <form onSubmit={(event) => void saveBookAccessEdit(event, selectedCatalogBook)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                      <label className="text-sm font-semibold">Mode<select value={bookAccessDraft.mode} onChange={(event) => setBookAccessDraft((current) => ({ ...current, mode: event.target.value as typeof current.mode }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="free">Free</option><option value="points">Points</option></select></label>
                      {bookAccessDraft.mode === 'points' ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => <label key={days} className="text-sm font-semibold">{days} days<input type="number" min="0" step="1" value={bookAccessDraft.costs[String(days)] ?? '0'} onChange={(event) => setBookAccessDraft((current) => ({ ...current, costs: { ...current.costs, [days]: event.target.value } }))} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label>)}</div> : null}
                      <div className="mt-4 flex gap-2"><button type="submit" disabled={saving} className="pine-action rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save permissions'}</button><button type="button" disabled={saving} onClick={() => setEditingBookId(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Cancel</button></div>
                    </form> : <button type="button" disabled={saving} onClick={() => startBookAccessEdit(selectedCatalogBook)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Edit access</button>}
                    <div className="border-t border-slate-200 pt-4 dark:border-slate-700"><button type="button" disabled={saving} onClick={() => handleArchiveBook(selectedCatalogBook.id, selectedCatalogBook.title)} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{selectedCatalogBook.is_archived ? 'Restore to catalog' : 'Archive book'}</button>{selectedCatalogBook.is_archived ? <button type="button" disabled={saving} onClick={() => setConfirmAction({ type: 'deleteBook', id: selectedCatalogBook.id, label: selectedCatalogBook.title })} className="ml-2 rounded-xl border border-rose-400 px-4 py-2.5 text-sm font-semibold text-rose-800 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300">Delete permanently</button> : null}</div>
                  </section> : null}
                </section>
              </div> : null}

              {newBookOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setNewBookOpen(false) }}>
              <form onSubmit={handleAddBook} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800/95" role="dialog" aria-modal="true" aria-labelledby="add-digital-title">
                <div className="mb-5 flex items-start justify-between gap-4"><div><h3 id="add-digital-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Add digital title</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create a catalog record and optionally attach its protected PDF.</p></div><button type="button" disabled={saving} onClick={() => setNewBookOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-600">Close</button></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Title</span>
                    <input
                      value={newBook.title}
                      onChange={(event) => setNewBook({ ...newBook, title: event.target.value })}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Author</span>
                    <input
                      value={newBook.author}
                      onChange={(event) => setNewBook({ ...newBook, author: event.target.value })}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Discipline (optional if genre is set)</span>
                    <input
                      value={newBook.category}
                      onChange={(event) => setNewBook({ ...newBook, category: event.target.value })}
                      maxLength={120}
                      placeholder="e.g. Biology"
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Genre (optional if discipline is set)</span>
                    <input
                      value={newBook.genre}
                      onChange={(event) => setNewBook({ ...newBook, genre: event.target.value })}
                      maxLength={120}
                      placeholder="e.g. Reference"
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Source type</span>
                    <select value={newBook.source_type} onChange={(event) => setNewBook({ ...newBook, source_type: event.target.value as typeof newBook.source_type })} className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="catalog">Catalog</option><option value="staff_added">Staff-added</option><option value="community_contribution">Community contribution</option></select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Course code (optional)</span>
                    <input
                      maxLength={32}
                      value={newBook.course_code}
                      onChange={(event) => setNewBook({ ...newBook, course_code: event.target.value })}
                      placeholder="e.g. BIO101"
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Access mode</span>
                    <select
                      value={newBook.access_mode}
                      onChange={(event) => setNewBook({ ...newBook, access_mode: event.target.value as typeof newBook.access_mode })}
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="free">Free access</option>
                      <option value="points">Points-based access</option>
                    </select>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Choose how members unlock this title.</span>
                  </label>
                  {newBook.access_mode === 'points' ? <fieldset className="sm:col-span-2">
                    <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Points per access period</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => <label key={days} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{days} {days === 1 ? 'day' : 'days'}
                        <input type="number" min="0" step="1" value={newBook.access_costs[String(days)] ?? '0'} onChange={(event) => setNewBook({ ...newBook, access_costs: { ...newBook.access_costs, [days]: event.target.value } })} required className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" />
                      </label>)}
                    </div>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Set the points required for each access period.</span>
                  </fieldset> : <p className="sm:col-span-2 text-sm text-slate-500 dark:text-slate-400">Free access unlocks immediately at no points cost.</p>}
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Access duration</span>
                    <select
                      value={newBook.access_duration_days}
                      onChange={(event) => setNewBook({ ...newBook, access_duration_days: event.target.value })}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}
                    </select>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Students receive this duration per unlock.</span>
                  </label>
                </div>
                <label className="mt-4 block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">ISBN</span>
                  <input
                    required value={newBook.isbn}
                    onChange={(event) => setNewBook({ ...newBook, isbn: event.target.value })}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <button type="button" onClick={() => generateBookIsbn((isbn) => setNewBook((current) => ({ ...current, isbn })))} className="mt-2 text-xs font-semibold text-sky-700 underline dark:text-sky-300">Generate ISBN-13</button>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Internal catalog ID, not a publisher-assigned ISBN.</span>
                </label>
                <div className="mt-4">
                  <EbookUploader
                    onFileSelected={(file) => setNewBookFile(file)}
                    onUrlEntered={(url) => setNewBook((prev) => ({ ...prev, pdf_url: url }))}
                    currentValue={newBook.pdf_url}
                    disabled={saving}
                  />
                </div>
                <label className="mt-4 block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Description</span>
                  <textarea
                    value={newBook.description}
                    onChange={(event) => setNewBook({ ...newBook, description: event.target.value })}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    rows={3}
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-6 w-full rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  {saving ? 'Saving...' : 'Add new book'}
                </button>
              </form>
              </div> : null}
              {pdfAttachmentOpen ? <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPdfAttachmentOpen(false) }}>
                <form onSubmit={(event) => void attachPdfToBook(event)} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800/95" role="dialog" aria-modal="true" aria-labelledby="attach-pdf-title">
                  <div className="flex items-start justify-between gap-4"><div><h3 id="attach-pdf-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Attach PDF to catalog title</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Attach or replace the protected reading file for an existing digital or hybrid book.</p></div><button type="button" disabled={saving} onClick={() => setPdfAttachmentOpen(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-600">Close</button></div>
                  <label className="mt-5 block"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Catalog title</span><select value={pdfBookId ?? ''} onChange={(event) => setPdfBookId(Number(event.target.value) || null)} required className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Choose a digital or hybrid title</option>{books.filter((book) => book.catalog_type !== 'physical').map((book) => <option key={book.id} value={book.id}>{book.title} ({book.author})</option>)}</select></label>
                  <div className="mt-5"><EbookUploader onFileSelected={(file) => setMaterialFile(file)} onUrlEntered={(url) => setPdfUrl(url)} currentValue={pdfUrl} disabled={saving} allowExternalUrl={false} /></div>
                  <button type="submit" disabled={saving} className="mt-6 w-full rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{saving ? 'Uploading and attaching...' : 'Attach PDF'}</button>
                </form>
              </div> : null}
            </section>
          )}

          {physicalSectionVisited ? (
            <div hidden={section !== 'physical' && section !== 'physical-finance'}>
              <PhysicalCirculationAdminPage
                active={section === 'physical' || section === 'physical-finance'}
                catalogOnly={section === 'physical'}
                finesOnly={section === 'physical-finance'}
                onOpenFines={() => navigateToSection('physical-finance')}
                onClose={() => navigateToSection('overview')}
              />
            </div>
          ) : null}

          {section === 'policy' ? <PhysicalCirculationAdminPage active policyOnly /> : null}

          {section === 'requests' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Digital history</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Eligible free and points access is automatic. Revoke active access only when necessary.</p>
              </div>
              {pendingRequests.length > 0 ? <details className="mb-5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                <summary className="cursor-pointer text-sm font-semibold text-amber-900 dark:text-amber-200">{pendingRequests.length} legacy pending requests · informational only</summary>
                <div className="mt-3 overflow-hidden rounded-lg border border-amber-200 dark:border-amber-900/60">
                  <table className="w-full table-fixed text-left text-xs sm:text-sm"><thead className="bg-white/70 text-slate-600 dark:bg-slate-900 dark:text-slate-300"><tr><th className="w-[35%] px-3 py-2">Member</th><th className="w-[40%] px-3 py-2">Book</th><th className="w-[25%] px-3 py-2">Requested</th></tr></thead><tbody className="divide-y divide-amber-100 dark:divide-amber-900/50">{pendingRequests.map((request) => <tr key={request.id}><td className="break-words px-3 py-2">{memberDisplayName(studentMap.get(request.student_id), 'Unknown member')}</td><td className="break-words px-3 py-2">{bookMap.get(request.book_id)?.title ?? 'Unknown book'}</td><td className="px-3 py-2">{request.request_date ? new Date(request.request_date).toLocaleDateString() : '—'}</td></tr>)}</tbody></table>
                </div>
              </details> : null}
              <div className="mt-8">
                <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <input type="search" value={digitalHistorySearch} onChange={(event) => setDigitalHistorySearch(event.target.value)} placeholder="Search member, book, or loan ID..." aria-label="Search digital loan history" className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <select value={digitalHistoryStatus} onChange={(event) => setDigitalHistoryStatus(event.target.value as typeof digitalHistoryStatus)} aria-label="Filter digital history" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <option value="all">All access / return states</option><option value="active">Active access</option><option value="revoked">Revoked access</option><option value="expired">Expired access</option><option value="returned">Returned</option>
                  </select>
                </div>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Showing {filteredDigitalLoanHistory.length} of {digitalLoanHistory.length} loans</p>
                {selectedDigitalLoanIds.length ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30"><span>{selectedDigitalLoanIds.length} active loan{selectedDigitalLoanIds.length === 1 ? '' : 's'} selected</span><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => setBulkRevokeOpen(true)} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-800 disabled:opacity-50 dark:text-rose-200">Revoke selected</button><button type="button" onClick={() => setSelectedDigitalLoanIds([])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700">Clear</button></div></div> : null}
                <div>
                  <table className="w-full table-fixed divide-y divide-slate-200 text-left text-xs sm:text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><tr><th className="w-10 px-2 py-3"><input type="checkbox" aria-label="Select active digital loans on this page" checked={visibleActiveDigitalRequestIds.length > 0 && visibleActiveDigitalRequestIds.every((id) => selectedDigitalLoanIds.includes(id))} onChange={(event) => setSelectedDigitalLoanIds((current) => event.target.checked ? Array.from(new Set([...current, ...visibleActiveDigitalRequestIds])) : current.filter((id) => !visibleActiveDigitalRequestIds.includes(id)))} /></th><th className="w-[17%] px-2 py-3 font-semibold sm:px-3">Member</th><th className="w-[17%] px-2 py-3 font-semibold sm:px-3">Book</th><th className="w-[12%] px-2 py-3 font-semibold sm:px-3">Issue date</th><th className="w-[18%] px-2 py-3 font-semibold sm:px-3">Return audit</th><th className="w-[16%] px-2 py-3 font-semibold sm:px-3">Loan</th><th className="w-[14%] px-2 py-3 font-semibold sm:px-3">Access status</th></tr></thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {visibleDigitalLoanHistory.map((loan) => {
                        const request = requests.find((item) => item.id === loan.borrow_request_id)
                        const active = request ? isActiveDigitalAccess(request) : false
                        const accessStatus = request?.status === 'revoked' || loan.status === 'revoked'
                          ? 'Revoked'
                          : active
                            ? 'Active'
                            : 'Expired'
                        return <tr key={loan.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/80">
                          <td className="px-2 py-3">{active && request ? <input type="checkbox" aria-label={`Select active loan for ${memberDisplayName(studentMap.get(loan.student_id))}`} checked={selectedDigitalLoanIds.includes(request.id)} onChange={(event) => setSelectedDigitalLoanIds((current) => event.target.checked ? [...current, request.id] : current.filter((id) => id !== request.id))} /> : null}</td>
                          <td className="break-words px-2 py-3 font-medium text-slate-800 dark:text-slate-100 sm:px-3">{memberDisplayName(studentMap.get(loan.student_id))}</td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3">{bookMap.get(loan.book_id)?.title ?? 'Unknown book'}</td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block text-[10px] uppercase tracking-wide text-slate-400">{loan.borrowed_at ? 'Borrowed' : 'Requested'}</span><time>{new Date(loan.borrowed_at ?? loan.requested_at).toLocaleDateString()}</time></td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block">Due date: {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</span>{loan.returned_at ? <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-300">Returned date: {new Date(loan.returned_at).toLocaleDateString()}</span> : <span className="mt-1 block text-xs text-slate-500">Not returned</span>}</td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block">{loan.duration_days} days</span><span className="block">{loan.renewal_count} renewals · {loan.points_cost} pts</span></td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block">{accessStatus}</span>{active && request ? <button type="button" disabled={saving} onClick={() => handleRevoke(request.id)} className="mt-2 inline-flex  items-center rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950">Revoke access</button> : null}</td>
                        </tr>
                      })}
                    </tbody>
                  </table>
                  {filteredDigitalLoanHistory.length === 0 ? <p className="px-3 py-6 text-sm text-slate-500">{digitalLoanHistory.length === 0 ? 'No digital loan history yet.' : 'No digital loans match this search or status.'}</p> : null}
                </div>
                <ListPagination page={Math.min(digitalHistoryPage, digitalHistoryPageCount)} pageCount={digitalHistoryPageCount} total={filteredDigitalLoanHistory.length} onPageChange={setDigitalHistoryPage} />
              </div>
            </section>
          )}

          {false && section === 'materials' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">PDF attachments</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">This is the file-management view for the same digital catalog records. It does not create a second catalog; it attaches or replaces the PDF on an existing digital or hybrid title.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">Reader</th>
                      <th className="px-4 py-3 font-semibold">Published</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {materials.length > 0 ? (
                      materials.map((material) => (
                        <tr key={material.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80">
                          <td className="px-4 py-4 text-slate-800 dark:text-slate-100">{material.title}</td>
                          <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                            <a href={`/reader/${material.id}`} className="text-sky-600 hover:text-sky-500 dark:text-sky-300">
                              Open reader
                            </a>
                          </td>
                          <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{material.created_at ? new Date(material.created_at).toLocaleDateString() : 'Unknown'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-slate-600 dark:text-slate-300">
                          No published PDF materials found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <form
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!pdfBookId || (!pdfUrl && !materialFile)) {
                    setError('Please select a book and either upload a PDF file or provide a URL.')
                    return
                  }
                  setSaving(true)
                  setError(null)
                  const supabase = getSupabase()

                  let finalUrl = pdfUrl.trim()
                  let attachedStorage: Record<string, unknown> = { storage_provider: finalUrl ? 'external' : 'supabase' }
                  if (materialFile) {
                    setActionMessage('Uploading e-book to library storage...')
                    const formData = new FormData()
                    formData.append('file', materialFile)
                    formData.append('category', 'Books')
                    formData.append('isbn', books.find((book) => book.id === pdfBookId)?.isbn ?? '')
                    formData.append('provider', 'supabase')
                    formData.append('allow_fallback', 'false')
                    const uploadResponse = await fetch('/api/storage/upload', { method: 'POST', body: formData })
                    const uploadResult = await uploadResponse.json()
                    if (!uploadResponse.ok) {
                      setError(`Upload failed: ${uploadResult.error || 'Unable to upload PDF.'}`)
                      setSaving(false)
                      return
                    }
                    finalUrl = uploadResult.pdf_url || uploadResult.storage_path || ''
                    attachedStorage = { storage_provider: uploadResult.storage_provider, storage_file_id: uploadResult.storage_file_id || null, storage_path: uploadResult.storage_path || null, file_name: uploadResult.file_name || materialFile.name, file_size: uploadResult.file_size || materialFile.size, mime_type: uploadResult.mime_type || 'application/pdf' }
                  }

                  const { error } = await supabase.from('books').update({ pdf_url: finalUrl, ...attachedStorage }).eq('id', pdfBookId)
                  if (error) {
                    setError(error.message)
                  } else {
                    setActionMessage('PDF attached to book successfully.')
                    setPdfBookId(null)
                    setPdfUrl('')
                    setMaterialFile(null)
                    await loadData()
                  }
                  setSaving(false)
                }}
                className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800/60"
              >
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">1. Choose the catalog book</span>
                    <select
                      value={pdfBookId ?? ''}
                      onChange={(event) => setPdfBookId(Number(event.target.value) || null)}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Choose a book</option>
                      {books.filter((book) => book.catalog_type !== 'physical').map((book) => (
                        <option key={book.id} value={book.id}>
                          {book.title} ({book.author})
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <EbookUploader
                      onFileSelected={(file) => setMaterialFile(file)}
                      onUrlEntered={(url) => setPdfUrl(url)}
                      currentValue={pdfUrl}
                      disabled={saving}
                      allowExternalUrl={false}
                    />

                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  {saving ? 'Uploading and attaching...' : '3. Upload and attach PDF'}
                </button>
              </form>
            </section>
          )}

          {section === 'audit' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Audit log</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review who performed recent actions, what changed, and when. The dashboard loads the latest 1,000 events.</p>
              <label className="mt-4 block max-w-xl text-sm font-medium">Search loaded events
                <input type="search" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Action, actor, target, or event detail" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" />
              </label>
              {auditActorError ? <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{auditActorError} Actor IDs remain visible below.</p> : null}
              <div className="mt-5 space-y-3">
                {visibleAuditLogs.map((log) => {
                  const actor = auditActors.find((item) => item.id === log.actor_id)
                  const detailEntries = Object.entries(log.details ?? {}).filter(([, value]) => value !== null && value !== undefined)
                  return <article key={log.id} className="rounded-2xl border border-paper-300 p-4 dark:border-forest-700">
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong className="capitalize">{log.action.replaceAll('_', ' ')}</strong>
                      <time className="text-xs text-slate-500" dateTime={log.created_at}>{new Date(log.created_at).toLocaleString()}</time>
                    </div>
                    <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      Actor: {actor ? `${actor.full_name?.trim() || actor.email} · ${actor.role}` : log.actor_id ? `Unknown actor (${log.actor_id.slice(0, 8)})` : 'System'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Target: {log.target_type}{log.target_id !== null ? ` #${log.target_id}` : ''}</p>
                    {detailEntries.length ? <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      {detailEntries.map(([key, value]) => {
                        const displayValue = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
                          ? String(value)
                          : JSON.stringify(value)
                        return <div key={key} className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                          <dt className="font-semibold capitalize text-slate-500">{key.replaceAll('_', ' ')}</dt>
                          <dd className="mt-0.5 break-words text-slate-800 dark:text-slate-200">{displayValue}</dd>
                        </div>
                      })}
                    </dl> : null}
                  </article>
                })}
                {auditLogs.length === 0 ? <p className="text-sm text-slate-500">No audit events recorded yet.</p> : null}
                {auditLogs.length > 0 && filteredAuditLogs.length === 0 ? <p className="text-sm text-slate-500">No loaded audit events match this search.</p> : null}
              </div>
              <ListPagination page={Math.min(auditPage, auditPageCount)} pageCount={auditPageCount} total={filteredAuditLogs.length} onPageChange={setAuditPage} />
            </section>
          )}

          {section === 'contributions' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Faculty lesson review</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review lesson PDFs before publishing. Approval adds the lesson to the resource shelf and offers the configured {defaultLessonReward}-point reward by default; it never creates a book.</p>
                {lessonPolicyError ? <p role="status" className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{lessonPolicyError}</p> : null}
                <button type="button" onClick={() => setShowContributionHistory((shown) => !shown)} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">{showContributionHistory ? 'Hide review history' : `Review history (${reviewedContributions.length})`}</button>
              </div>
              {pendingContributions.length ? <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visiblePendingContributions.length > 0 && visiblePendingContributions.every((item) => selectedContributionIds.includes(item.id))} onChange={(event) => setSelectedContributionIds((current) => event.target.checked ? Array.from(new Set([...current, ...visiblePendingContributions.map((item) => item.id)])) : current.filter((id) => !visiblePendingContributions.some((item) => item.id === id)))} />Select pending lessons on this page</label>{selectedContributionIds.length ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs">{selectedContributionIds.length} selected</span><button type="button" disabled={saving} onClick={() => setBulkContributionReview({ decision: 'approved', reward: String(defaultLessonReward), rejectionReason: '' })} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">Approve selected</button><button type="button" disabled={saving} onClick={() => setBulkContributionReview({ decision: 'rejected', reward: '0', rejectionReason: '' })} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-800 dark:text-rose-200">Reject selected</button><button type="button" onClick={() => setSelectedContributionIds([])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700">Clear</button></div> : null}</div> : null}
              <div className="space-y-3">
                {pendingContributions.length > 0 ? visiblePendingContributions.map((contribution) => (
                  <article key={contribution.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3"><input type="checkbox" className="mt-1 shrink-0" aria-label={`Select contribution ${contribution.title}`} checked={selectedContributionIds.includes(contribution.id)} onChange={(event) => setSelectedContributionIds((current) => event.target.checked ? [...current, contribution.id] : current.filter((id) => id !== contribution.id))} /><div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{contribution.title}</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">by {contribution.author} · from {memberDisplayName(students.find((student) => student.id === contribution.user_id), 'Unknown student')}</p>
                        {contribution.description ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{contribution.description}</p> : null}
                        {(contribution.pdf_url || contribution.storage_file_id || contribution.storage_path) ? <button type="button" onClick={() => setInspectingContribution(contribution)} className="mt-3 inline-block text-xs font-semibold text-sky-600 hover:underline dark:text-sky-300">Inspect submitted PDF</button> : <p className="mt-3 text-xs text-rose-600">No PDF attachment is available.</p>}
                      </div></div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" disabled={saving} onClick={() => void handleContributionRevision(contribution.id)} className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50 dark:border-amber-900/50 dark:text-amber-300">Request revision</button>
                        <button type="button" disabled={saving} onClick={() => void handleContributionReview(contribution.id, 'rejected')} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-300">Reject</button>
                        <button type="button" disabled={saving} onClick={() => void handleContributionReview(contribution.id, 'approved')} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Approve</button>
                      </div>
                    </div>
                  </article>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4z" /></svg></span><p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">No pending lessons</p><p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">Faculty lesson PDFs will appear here when they are ready for review.</p></div>
                )}
              </div>
              <ListPagination page={Math.min(contributionPage, contributionPageCount)} pageCount={contributionPageCount} total={pendingContributions.length} onPageChange={setContributionPage} />
              {showContributionHistory ? <section className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700"><h3 className="font-semibold">Reviewed contributions</h3>{reviewedContributions.length ? <div className="mt-3 space-y-2">{reviewedContributions.map((item) => <article key={`reviewed-${item.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><div><p className="font-medium">{item.title} <span className="font-normal text-slate-500">by {item.author}</span></p><p className="text-xs text-slate-500">Last updated {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'date unavailable'}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${item.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : item.status === 'rejected' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{item.status.replaceAll('_', ' ')}</span></article>)}</div> : <p className="mt-2 text-sm text-slate-500">Reviewed decisions will appear here.</p>}</section> : null}
            </section>
          )}

          {section === 'users' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Member management</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage accounts and academics. Select a member to review or correct profile details.</p>
              </div>
              <div className="mb-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setMemberToolModal('createMember')} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Invite member</button>
                <button type="button" onClick={() => setMemberToolModal('catalogs')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Manage academic catalogs</button>
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_10rem_12rem_auto]">
                <input type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search name, email, school, or course..." aria-label="Search members" className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                <select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value as typeof userRoleFilter)} aria-label="Filter members by role" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="all">All roles</option><option value="student">Students</option><option value="faculty">Faculty</option><option value="librarian">Librarians</option></select>
                <select value={userLoanFilter} onChange={(event) => setUserLoanFilter(event.target.value as typeof userLoanFilter)} aria-label="Filter members by digital access" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="all">Any loan activity</option><option value="active">Has active loans</option><option value="none">No active loans</option></select>
                <p className="self-center text-xs text-slate-500 dark:text-slate-400">{filteredStudentDetails.length} of {studentDetails.length} members</p>
              </div>
              {memberToolModal === 'catalogs' ? <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setMemberToolModal(null) }}><section className="my-6 w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="academic-catalogs-title">
                <div className="flex items-start justify-between gap-4"><div><h3 id="academic-catalogs-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Academic catalogs</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage available faculties and courses.</p></div><button type="button" disabled={saving} onClick={() => setMemberToolModal(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">Close</button></div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Faculty</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Faculty choices available when creating faculty accounts.</p>
                  <form onSubmit={(event) => void addAcademicFaculty(event)} className="mt-3 flex gap-2">
                    <input required maxLength={120} value={facultyDraft} onChange={(event) => setFacultyDraft(event.target.value)} placeholder="e.g. Information Technology" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Add faculty</button>
                  </form>
                  <ul className="mt-3 space-y-2">
                    {academicDepartments.filter((faculty) => faculty.is_active).map((faculty) => <li key={faculty.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-900"><span>{faculty.name}</span><button type="button" disabled={saving} onClick={() => setCatalogRemoval({ kind: 'faculty', id: faculty.id, name: faculty.name })} className="text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50 dark:text-rose-300">Remove</button></li>)}
                    {academicDepartments.filter((faculty) => faculty.is_active).length === 0 ? <li className="text-sm text-slate-500">No faculty choices are available.</li> : null}
                  </ul>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Courses</h3>
                  <form onSubmit={(event) => void addAcademicCourse(event)} className="mt-3 flex gap-2">
                    <input required maxLength={120} value={courseDraft} onChange={(event) => setCourseDraft(event.target.value)} placeholder="e.g. Computer Science" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Add course</button>
                  </form>
                  <ul className="mt-3 space-y-2">
                    {academicCourses.filter((course) => course.is_active).map((course) => <li key={course.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-900"><span>{course.name}</span><button type="button" disabled={saving} onClick={() => setCatalogRemoval({ kind: 'course', id: course.id, name: course.name })} className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300">Remove</button></li>)}
                    {academicCourses.filter((course) => course.is_active).length === 0 ? <li className="text-sm text-slate-500">No courses available. Add a course to make it selectable.</li> : null}
                  </ul>
                </section>
              </div></section></div> : null}
              <ActionModal
                open={catalogRemoval !== null}
                title={`Remove ${catalogRemoval?.kind ?? 'catalog item'}?`}
                description={catalogRemoval ? `${catalogRemoval.name} will no longer appear as a choice for new accounts or assignments. Existing member records and history will be kept.` : undefined}
                confirmLabel="Remove choice"
                tone="danger"
                busy={saving}
                onClose={() => setCatalogRemoval(null)}
                onConfirm={() => {
                  const pending = catalogRemoval
                  if (!pending) return
                  setCatalogRemoval(null)
                  if (pending.kind === 'faculty') {
                    const faculty = academicDepartments.find((item) => item.id === pending.id)
                    if (faculty) void removeAcademicFaculty(faculty)
                  } else {
                    const course = academicCourses.find((item) => item.id === pending.id)
                    if (course) void removeAcademicCourse(course)
                  }
                }}
              />
              {memberToolModal === 'createMember' ? <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setMemberToolModal(null) }}><section className="my-6 w-full max-w-3xl min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="create-member-title"><div className="flex items-start justify-between gap-4"><div><h3 id="create-member-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Invite member</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Send a secure email link so the member can set their password.</p></div><button type="button" disabled={saving} onClick={() => setMemberToolModal(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">Close</button></div>
              <form onSubmit={async (event) => { if (await handleCreateStudent(event)) setMemberToolModal(null) }} className="mt-5">
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <input type="text" required maxLength={120} value={newStudent.fullName} onChange={(event) => setNewStudent({ ...newStudent, fullName: event.target.value })} placeholder="Full name" className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input type="text" required minLength={3} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" autoComplete="off" value={newStudent.username} onChange={(event) => setNewStudent({ ...newStudent, username: event.target.value.toLowerCase() })} placeholder="Username (3–30 characters)" className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input type="email" required value={newStudent.email} onChange={(event) => setNewStudent({ ...newStudent, email: event.target.value })} placeholder="member@example.com" className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <select required aria-label="Account type" value={newStudent.role} onChange={(event) => setNewStudent({ ...newStudent, role: event.target.value as 'student' | 'faculty' | 'librarian', department: '' })} className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                    <option value="librarian">Librarian</option>
                  </select>
                  {newStudent.role !== 'librarian' ? <label className="block min-w-0 text-sm font-medium">Institutional ID<input required inputMode="numeric" maxLength={10} pattern="[0-9]{4}-?[0-9]{5}" value={newStudent.institutionalId} onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '').slice(0, 9)
                    setNewStudent({ ...newStudent, institutionalId: digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits })
                  }} placeholder="2026-01042" className="box-border mt-1.5 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" /></label> : null}
                  {newStudent.role === 'faculty' ? <label className="block min-w-0 text-sm font-medium">Department<select required value={newStudent.department} onChange={(event) => setNewStudent({ ...newStudent, department: event.target.value })} className="box-border mt-1.5 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Select department</option>{academicDepartments.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label> : null}
                  {newStudent.role === 'student' ? <select required value={newStudent.course} onChange={(event) => setNewStudent({ ...newStudent, course: event.target.value })} className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Course</option>{academicCourses.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select> : null}
                  {newStudent.role === 'student' ? <select required value={newStudent.studentYear} onChange={(event) => setNewStudent({ ...newStudent, studentYear: event.target.value })} className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Year level</option>{['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].map((year) => <option key={year} value={year}>{year}</option>)}</select> : null}
                </div>
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">The member will receive a secure email link to set their own password.</p>
                <button type="submit" disabled={saving} className="mt-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{saving ? 'Sending invite...' : 'Send invite'}</button>
              </form></section></div> : null}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Member</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Points</th>
                      <th className="px-4 py-3 font-semibold">Active loans</th>
                      <th className="px-4 py-3 font-semibold">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {visibleStudentDetails.map((student) => (
                      <tr key={student.id} tabIndex={0} aria-selected={selectedMember?.id === student.id} onClick={() => openMemberDetails(student)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openMemberDetails(student) } }} className={`group cursor-pointer transition-colors focus:outline-none ${selectedMember?.id === student.id ? 'bg-emerald-900 text-white' : 'hover:bg-emerald-900 hover:text-white focus:bg-emerald-900 focus:text-white'}`}>
                        <td className="px-4 py-4 text-slate-800 group-hover:text-white group-focus:text-white group-aria-selected:text-white dark:text-slate-100"><span className="block font-medium">{memberDisplayName(student, 'Unknown member')}</span>{student.username ? <span className="mt-1 block text-xs text-slate-500 group-hover:text-emerald-100 group-focus:text-emerald-100 group-aria-selected:text-emerald-100 dark:text-slate-400">@{student.username}</span> : null}</td>
                        <td className="max-w-[220px] break-all px-4 py-4 text-slate-600 group-hover:text-white group-focus:text-white group-aria-selected:text-white dark:text-slate-300">{student.email || 'No email'}</td>
                        <td className="px-4 py-4 capitalize text-slate-600 group-hover:text-white group-focus:text-white group-aria-selected:text-white dark:text-slate-300">{student.role}</td>
                        <td className="px-4 py-4 font-semibold text-slate-700 group-hover:text-white group-focus:text-white group-aria-selected:text-white dark:text-slate-200">{Number(student.points_balance ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-4 text-slate-600 group-hover:text-white group-focus:text-white group-aria-selected:text-white dark:text-slate-300">{student.active_loans}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-slate-600 group-hover:text-white group-focus:text-white group-aria-selected:text-white dark:text-slate-300">{student.created_at ? new Date(student.created_at).toLocaleDateString() : 'Not available'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredStudentDetails.length === 0 ? <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">No members match your search.</p> : null}
              </div>
              <ListPagination page={Math.min(userPage, userPageCount)} pageCount={userPageCount} total={filteredStudentDetails.length} onPageChange={setUserPage} />
            </section>
          )}
          </>
          )}
        </main>
        {selectedMember ? <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedMember(null) }}>
          <section className="my-6 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="member-details-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">Member profile</p>
                <h2 id="member-details-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{memberDisplayName(selectedMember, 'Member')}</h2>
                <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{selectedMember.email}</p>
                <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${memberAccountHistoryLoading || !memberFineStatusAvailable ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : memberAccountHistory?.fines.some((fine) => fine.status === 'unpaid') ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'}`}>
                  {memberAccountHistoryLoading ? 'Fine status loading' : !memberFineStatusAvailable ? 'Fine status unavailable' : memberAccountHistory?.fines.some((fine) => fine.status === 'unpaid') ? `Fined · ${memberAccountHistory.fines.filter((fine) => fine.status === 'unpaid').length} unpaid` : 'Clear · no unpaid fines'}
                </span>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">Close</button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Role</p><p className="mt-1 font-semibold capitalize">{selectedMember.role}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Points balance</p><p className="mt-1 font-semibold">{Number(selectedMember.points_balance ?? 0).toLocaleString()}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Active loans</p><p className="mt-1 font-semibold">{selectedMember.active_loans}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">Joined</p><p className="mt-1 font-semibold">{selectedMember.created_at ? new Date(selectedMember.created_at).toLocaleDateString() : '-'}</p></div>
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section><h3 className="font-semibold text-slate-900 dark:text-slate-100">Profile and academics</h3><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{selectedMember.role === 'student' ? <><div><dt className="text-slate-500">Course</dt><dd className="font-medium" title={selectedMember.course ? `Saved value: ${selectedMember.course}` : undefined}>{memberCourseDisplay(selectedMember.course, academicCourses)}{selectedMember.course && memberCourseDisplay(selectedMember.course, academicCourses) === 'Needs review' ? ` (${selectedMember.course})` : ''}</dd></div><div><dt className="text-slate-500">Year level</dt><dd className="font-medium" title={selectedMember.student_year ? `Saved value: ${selectedMember.student_year}` : undefined}>{memberYearDisplay(selectedMember.student_year)}{selectedMember.student_year && memberYearDisplay(selectedMember.student_year) === 'Needs review' ? ` (${selectedMember.student_year})` : ''}</dd></div></> : selectedMember.role === 'faculty' ? <div><dt className="text-slate-500">Faculty</dt><dd className="font-medium">{selectedMember.department || 'Not set'}</dd></div> : <div><dt className="text-slate-500">Account type</dt><dd className="font-medium">Librarian</dd></div>}</dl></section>
              <section><h3 className="font-semibold text-slate-900 dark:text-slate-100">Account summary</h3><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><p className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">{memberAccountHistory?.digitalLoans.length ?? 0} digital loan records</p><p className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">{memberAccountHistory?.physicalLoans.length ?? 0} physical checkouts</p><p className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">{memberFineStatusAvailable ? memberAccountHistory?.fines.filter((fine) => fine.status === 'unpaid').length ?? 0 : '—'} unpaid fines</p><p className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">{(memberAccountHistory?.printPayments.length ?? 0) + (memberAccountHistory?.ebookPurchases.length ?? 0)} payment records</p></div></section>
            </div>
            <section className="mt-6 rounded-2xl border border-slate-200 p-4 dark:border-slate-700" aria-labelledby="member-access-controls-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="member-access-controls-title" className="font-semibold text-slate-900 dark:text-slate-100">Account access &amp; restrictions</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Sign-in status: {memberSuspension?.memberId !== selectedMember.id || memberSuspension.loading
                      ? 'Checking…'
                      : memberSuspension.error
                        ? 'Unavailable'
                        : memberSuspension.suspended
                          ? `Suspended${memberSuspension.bannedUntil ? ` until ${new Date(memberSuspension.bannedUntil).toLocaleString()}` : ''}`
                          : 'Active'}
                  </p>
                  {memberSuspension?.memberId === selectedMember.id && memberSuspension.error
                    ? <p role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{memberSuspension.error}</p>
                    : null}
                </div>
                {profile?.role === 'admin' ? <button
                  type="button"
                  disabled={saving || memberSuspension?.memberId !== selectedMember.id || memberSuspension.loading || memberSuspension.suspended === null}
                  onClick={() => setMemberSuspensionDialog({
                    memberId: selectedMember.id,
                    memberName: memberDisplayName(selectedMember, selectedMember.email),
                    suspended: !memberSuspension?.suspended,
                    reason: '',
                  })}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${memberSuspension?.suspended ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-rose-700 hover:bg-rose-600'}`}
                >
                  {memberSuspension?.suspended ? 'Lift suspension' : 'Suspend sign-in'}
                </button> : null}
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Suspending blocks sign-in; lifting it restores account access. This does not erase account history or waive fines.</p>
              {memberAccountHistory ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {memberAccountHistory.fines.some((fine) => fine.status === 'unpaid')
                  ? <button type="button" onClick={() => router.push('/dashboard/admin/physical/finance')} className="rounded-lg border border-rose-200 px-3 py-2 font-semibold text-rose-800 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/30">Review unpaid fines &amp; payment options</button>
                  : <span className="rounded-lg bg-emerald-50 px-3 py-2 font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">No unpaid fine holds</span>}
                {memberAccountHistory.physicalLoans.some((loan) => (loan.status === 'checked_out' || loan.status === 'return_pending') && new Date(loan.due_date).getTime() < Date.now())
                  ? <span className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Overdue physical items require librarian-verified return or case resolution.</span>
                  : null}
                {memberAccountHistory.physicalLoans.filter((loan) => loan.status === 'checked_out' || loan.status === 'return_pending').length >= 3
                  ? <span className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Borrowing limit reached; a return is required before another checkout.</span>
                  : null}
              </div> : null}
            </section>
            <section className="mt-6 space-y-5" aria-labelledby="member-account-history-title">
              <div><h3 id="member-account-history-title" className="font-semibold text-slate-900 dark:text-slate-100">Account history</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Borrowing, fines, receipts, payments, points, and contributions recorded for this member.</p></div>
              {memberAccountHistoryError ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{memberAccountHistoryError}</p> : null}
              {memberAccountHistoryLoading ? <p className="text-sm text-slate-500">Loading complete account history”¦</p> : null}
              {memberAccountHistory ? <>
                <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Chronological activity · {memberAccountHistory.activityLedger.length}</summary><ol className="mt-3 grid max-h-80 gap-2 overflow-y-auto">{memberAccountHistory.activityLedger.map((event) => <li key={event.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><div className="flex flex-wrap items-start justify-between gap-2"><time className="text-xs text-slate-500">{new Date(event.occurred_at).toLocaleString()}</time><span className="text-xs capitalize text-slate-500">{event.actor_role === 'historical' ? 'Existing record' : event.actor_role === 'system' ? 'System' : `${event.actor_role} action`}</span></div><p className="mt-1 font-medium">{event.summary}</p>{event.related_request_id ? <p className="mt-1 text-xs text-slate-500">Related {event.related_request_type?.replace(/_/g, ' ')} #{event.related_request_id}</p> : null}{event.receipt_number ? <p className="mt-1 font-mono text-xs text-pine-700 dark:text-pine-200">Receipt {event.receipt_number}</p> : null}</li>)}{memberAccountHistory.activityLedger.length === 0 ? <li className="text-sm text-slate-500">No ledger events have been recorded for this account yet.</li> : null}</ol></details>
                <section><h4 className="text-sm font-semibold">Digital borrowing</h4><div className="mt-2 space-y-2">{memberAccountHistory.digitalLoans.map((loan) => <article key={`digital-${loan.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><div><p className="font-medium">{bookMap.get(loan.book_id)?.title ?? `Book #${loan.book_id}`}</p><p className="text-xs text-slate-500">Requested {new Date(loan.requested_at).toLocaleDateString()}{loan.due_date ? ` · Due ${new Date(loan.due_date).toLocaleDateString()}` : ''}{loan.returned_at ? ` · Returned ${new Date(loan.returned_at).toLocaleDateString()}` : ''}</p></div><span className="text-xs font-semibold capitalize">{loan.status.replace(/_/g, ' ')} · {loan.points_cost} points</span></article>)}{memberAccountHistory.digitalLoans.length === 0 ? <p className="text-sm text-slate-500">No digital borrowing records.</p> : null}</div></section>
                <section><h4 className="text-sm font-semibold">Physical circulation</h4><div className="mt-2 space-y-2">{memberAccountHistory.physicalLoans.map((loan) => <article key={`physical-loan-${loan.id}`} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{bookMap.get(loan.book_id)?.title ?? `Book #${loan.book_id}`}</p><span className="text-xs font-semibold capitalize">{loan.status.replace(/_/g, ' ')}{loan.return_condition ? ` · ${loan.return_condition}` : ''}</span></div><p className="mt-1 text-xs text-slate-500">Checked out {new Date(loan.checked_out_at).toLocaleDateString()} · Due {new Date(loan.due_date).toLocaleDateString()}{loan.returned_at ? ` · Returned ${new Date(loan.returned_at).toLocaleDateString()}` : ''} · ₱{Number(loan.fee_amount).toFixed(2)} · {loan.payment_method} / {loan.payment_status}</p>{loan.receipt_number ? <p className="mt-1 font-mono text-xs text-pine-700 dark:text-pine-200">Receipt {loan.receipt_number}</p> : null}{loan.notes ? <p className="mt-1 text-xs text-slate-500">Staff note: {loan.notes}</p> : null}</article>)}{memberAccountHistory.physicalRequests.filter((request) => !memberAccountHistory!.physicalLoans.some((loan) => loan.request_id === request.id)).map((request) => <article key={`physical-request-${request.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><div><p className="font-medium">{bookMap.get(request.book_id)?.title ?? `Book #${request.book_id}`}</p><p className="text-xs text-slate-500">Requested {new Date(request.requested_at).toLocaleDateString()} · ₱{Number(request.fee_amount).toFixed(2)} · {request.payment_method} / {request.payment_status}</p></div><span className="text-xs font-semibold capitalize">{request.status.replace(/_/g, ' ')}</span></article>)}{memberAccountHistory.physicalLoans.length === 0 && memberAccountHistory.physicalRequests.length === 0 ? <p className="text-sm text-slate-500">No physical requests or checkout records.</p> : null}</div></section>
                <section><h4 className="text-sm font-semibold">Fines &amp; penalties</h4><div className="mt-2 space-y-2">{memberAccountHistory.fines.map((fine) => <article key={`fine-${fine.id}`} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><div><p className="font-medium capitalize">{fine.fine_type.replace(/_/g, ' ')} · ₱{Number(fine.amount).toFixed(2)}</p><p className="text-xs text-slate-500">{fine.fine_reason || fine.waiver_reason || 'No reason recorded'} · {new Date(fine.created_at).toLocaleDateString()}</p>{fine.receipt_number ? <p className="font-mono text-xs text-pine-700 dark:text-pine-200">Receipt {fine.receipt_number}</p> : null}</div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${fine.status === 'unpaid' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200' : fine.status === 'paid' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{fine.status}</span></article>)}{memberAccountHistory.fines.length === 0 ? <p className="text-sm text-slate-500">No fines or penalties recorded.</p> : null}</div></section>
                <section><h4 className="text-sm font-semibold">Payments &amp; receipts</h4><div className="mt-2 space-y-2">{memberAccountHistory.printPayments.map((payment) => <article key={`print-payment-${payment.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><div><p className="font-medium">Print service · {payment.description}</p><p className="text-xs text-slate-500">₱{Number(payment.amount).toFixed(2)} · {new Date(payment.created_at).toLocaleDateString()}</p></div><span className="font-mono text-xs">{payment.receipt_number || 'Receipt unavailable'}</span></article>)}{memberAccountHistory.ebookPurchases.map((purchase) => <article key={`ebook-purchase-${purchase.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><div><p className="font-medium">Digital purchase · {bookMap.get(purchase.book_id)?.title ?? `Book #${purchase.book_id}`}</p><p className="text-xs text-slate-500">₱{Number(purchase.fee_amount).toFixed(2)} · {new Date(purchase.requested_at).toLocaleDateString()}</p></div><span className="text-xs font-semibold capitalize">{purchase.status.replace(/_/g, ' ')}{purchase.receipt_number ? ` · ${purchase.receipt_number}` : ''}</span></article>)}{memberAccountHistory.printPayments.length === 0 && memberAccountHistory.ebookPurchases.length === 0 ? <p className="text-sm text-slate-500">No print or digital purchase transactions.</p> : null}</div></section>
                <section><h4 className="text-sm font-semibold">Points transactions</h4><div className="mt-2 space-y-2">{memberAccountHistory.pointTransactions.map((transaction) => <article key={`points-${transaction.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><div><p className="font-medium">{transaction.description}</p><p className="text-xs text-slate-500">{transaction.transaction_type.replace(/_/g, ' ')} · {new Date(transaction.created_at).toLocaleDateString()}</p></div><span className={`font-semibold ${transaction.amount > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}>{transaction.amount > 0 ? '+' : ''}{transaction.amount} points</span></article>)}{memberAccountHistory.pointTransactions.length === 0 ? <p className="text-sm text-slate-500">No points transactions recorded.</p> : null}</div></section>
                <section><h4 className="text-sm font-semibold">Contributions</h4><div className="mt-2 space-y-2">{contributions.filter((contribution) => contribution.user_id === selectedMember.id).map((contribution) => <article key={`contribution-${contribution.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><div><p className="font-medium">{contribution.title}</p><p className="text-xs text-slate-500">Submitted {contribution.created_at ? new Date(contribution.created_at).toLocaleDateString() : 'Date unavailable'}</p></div><span className="text-xs font-semibold capitalize">{contribution.status.replace(/_/g, ' ')}</span></article>)}{contributions.every((contribution) => contribution.user_id !== selectedMember.id) ? <p className="text-sm text-slate-500">No contributions recorded.</p> : null}</div></section>
              </> : null}
            </section>
            <div className="mt-6 flex flex-wrap justify-end gap-2">{selectedMember.role === 'student' || selectedMember.role === 'faculty' ? <button type="button" onClick={() => { setTopUpMember(selectedMember); setSelectedMember(null) }} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Record cash top-up</button> : null}<button type="button" onClick={() => { setSelectedMember(null); openMemberEditor(selectedMember) }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Edit profile</button>{profile?.role === 'admin' ? <button type="button" onClick={() => { setSelectedMember(null); setConfirmAction({ type: 'deleteMember', id: selectedMember.id, label: memberDisplayName(selectedMember, selectedMember.email) }) }} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white">Delete account</button> : null}</div>
          </section>
        </div> : null}
        {editingMember && memberEditForm ? (
          <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setEditingMember(null); setMemberEditForm(null) } }}>
            <section className="my-6 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="member-edit-title">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="member-edit-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Edit member profile</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{memberDisplayName(editingMember)}</p>
                </div>
                <button type="button" disabled={saving} onClick={() => { setEditingMember(null); setMemberEditForm(null) }} className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">Close</button>
              </div>
              <form onSubmit={(event) => void saveMemberProfile(event)} className="mt-5 space-y-4">
                <label className="block text-sm font-medium">Role
                  <select value={memberEditForm.role} onChange={(event) => setMemberEditForm({ ...memberEditForm, role: event.target.value as 'student' | 'faculty' | 'librarian' })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                    <option value="student">Student</option>
                    <option value="faculty">Faculty member</option>
                    <option value="librarian">Librarian</option>
                  </select>
                </label>
                {memberEditForm.role !== 'librarian' ? <label className="block text-sm font-medium">Institutional ID
                  <input required inputMode="numeric" maxLength={10} pattern="[0-9]{4}-?[0-9]{5}" value={memberEditForm.institutionalId} onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '').slice(0, 9)
                    setMemberEditForm({ ...memberEditForm, institutionalId: digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits })
                  }} placeholder="2026-01042" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label> : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  {memberEditForm.role === 'faculty' ? <label className="block text-sm font-medium">Department<select required value={memberEditForm.department} onChange={(event) => setMemberEditForm({ ...memberEditForm, department: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"><option value="">Select department</option>{academicDepartments.filter((item) => item.is_active || item.name === memberEditForm.department).map((item) => <option key={item.id} value={item.name}>{item.name}{item.is_active ? '' : ' (inactive)'}</option>)}</select></label> : null}
                  {memberEditForm.role === 'student' ? <>
                    <label className="block text-sm font-medium">Course
                      <select required value={memberEditForm.course} onChange={(event) => setMemberEditForm({ ...memberEditForm, course: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                        <option value="">Select a course</option>
                        {memberEditForm.course && !academicCourses.some((item) => item.name.trim().toLocaleLowerCase() === memberEditForm.course.trim().toLocaleLowerCase()) ? <option value={memberEditForm.course}>{memberEditForm.course} (current; review catalog)</option> : null}
                        {academicCourses.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">Year level<select required value={memberEditForm.studentYear} onChange={(event) => setMemberEditForm({ ...memberEditForm, studentYear: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"><option value="">Select year</option>{memberEditForm.studentYear && memberYearDisplay(memberEditForm.studentYear) === 'Needs review' ? <option value={memberEditForm.studentYear}>Current value needs review: {memberEditForm.studentYear}</option> : null}{['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
                  </> : null}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" disabled={saving} onClick={() => { setEditingMember(null); setMemberEditForm(null) }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Cancel</button>
                  <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{saving ? 'Saving...' : 'Save profile'}</button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
        {inspectingContribution ? <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/60" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setInspectingContribution(null) }}>
          <aside className="flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl dark:bg-slate-950" role="dialog" aria-modal="true" aria-labelledby="contribution-inspection-title">
            <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-slate-800">
              <div className="min-w-0"><h2 id="contribution-inspection-title" className="truncate text-lg font-semibold">{inspectingContribution.title}</h2><p className="mt-1 text-sm text-slate-500">by {inspectingContribution.author} · submitted by {memberDisplayName(students.find((student) => student.id === inspectingContribution.user_id), 'Unknown student')}</p></div>
              <button type="button" onClick={() => setInspectingContribution(null)} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700">Close</button>
            </header>
            <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <iframe title={`PDF inspection: ${inspectingContribution.title}`} src={`/api/contributions/${inspectingContribution.id}/file`} className="h-full min-h-[50vh] w-full bg-slate-100 dark:bg-slate-900" />
              <section className="overflow-y-auto border-t border-slate-200 p-5 dark:border-slate-800 lg:border-l lg:border-t-0">
                <h3 className="font-semibold">Submission details</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{inspectingContribution.description || 'No description provided.'}</p>
                <p className="mt-4 text-xs text-slate-500">Use the PDF preview to inspect scan quality, rights statements, and metadata before making a decision.</p>
                <div className="mt-6 grid gap-2">
                  <button type="button" disabled={saving} onClick={() => { const id = inspectingContribution.id; setInspectingContribution(null); void handleContributionReview(id, 'approved') }} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Approve</button>
                  <button type="button" disabled={saving} onClick={() => { const id = inspectingContribution.id; setInspectingContribution(null); void handleContributionReview(id, 'rejected') }} className="rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300">Reject with reason</button>
                  <button type="button" disabled={saving} onClick={() => { setInspectingContribution(null); void handleContributionRevision(inspectingContribution.id) }} className="rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-800 disabled:opacity-50 dark:border-amber-900/60 dark:text-amber-200">Request revision</button>
                </div>
              </section>
            </div>
          </aside>
        </div> : null}
        <ActionModal
          open={confirmAction?.type === 'archiveBook'}
          title={confirmAction?.type === 'archiveBook' && confirmAction.isArchived ? 'Remove this book from the catalog?' : 'Restore this book?'}
          description={confirmAction?.type === 'archiveBook' ? confirmAction.isArchived
            ? `“${confirmAction.label ?? 'This title'}” will be hidden from members. Loan history and existing records will be preserved.`
            : `“${confirmAction.label ?? 'This title'}” will become available in the active catalog again.` : undefined}
          confirmLabel={confirmAction?.type === 'archiveBook' && confirmAction.isArchived ? 'Remove from catalog' : 'Restore book'}
          tone={confirmAction?.type === 'archiveBook' && confirmAction.isArchived ? 'danger' : 'default'}
          busy={saving}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction?.type !== 'archiveBook') return
            const { id, label, isArchived } = confirmAction
            setConfirmAction(null)
            void setBookArchived(id, label ?? 'Book', Boolean(isArchived))
          }}
        />
        <ActionModal
          open={confirmAction?.type === 'deleteBook'}
          title="Permanently delete this archived title?"
          description={confirmAction?.type === 'deleteBook' ? `“${confirmAction.label ?? 'This title'}” will be deleted only if it has no loans, payments, member activity, or attached file. This cannot be undone.` : undefined}
          confirmLabel="Permanently delete"
          tone="danger"
          busy={saving}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => { if (confirmAction?.type === 'deleteBook') void permanentlyDeleteBook(confirmAction.id, confirmAction.label ?? 'Book') }}
        />
        <ResultModal
          open={Boolean(error || (actionMessage && !actionMessage.startsWith('Uploading')))}
          status={error ? 'error' : 'success'}
          message={error || actionMessage || ''}
          successTitle={actionSuccessTitle ?? undefined}
          onClose={() => { setError(null); setActionMessage(null); setActionSuccessTitle(null) }}
        />
        <ActionModal
          open={confirmAction?.type === 'revokeLoan'}
          title="Revoke digital access?"
          description="The student will lose access to this approved resource immediately."
          confirmLabel="Revoke access"
          tone="danger"
          busy={saving}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => { if (confirmAction?.type === 'revokeLoan') void executeRevoke(confirmAction.id) }}
        />
        <ActionModal
          open={bulkRevokeOpen}
          title="Revoke selected digital loans?"
          description={`${selectedDigitalLoanIds.length} selected active loan${selectedDigitalLoanIds.length === 1 ? '' : 's'} will be revoked. If a loan changes before processing, it may fail and remain selected.`}
          confirmLabel="Revoke selected"
          tone="danger"
          busy={saving}
          onClose={() => setBulkRevokeOpen(false)}
          onConfirm={() => void executeBulkRevoke()}
        />
        <ActionModal
          open={confirmAction?.type === 'deleteMember'}
          title="Delete member account?"
          description={confirmAction?.type === 'deleteMember' ? `${confirmAction.label ?? 'This member'} will lose access and their account data will be permanently deleted. This cannot be undone.` : undefined}
          confirmLabel="Delete account"
          tone="danger"
          busy={saving}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => { if (confirmAction?.type === 'deleteMember') void executeDeleteMember(confirmAction.id, confirmAction.label ?? 'Member') }}
        />
        <ActionModal
          open={memberSuspensionDialog !== null}
          title={memberSuspensionDialog?.suspended ? 'Suspend member sign-in?' : 'Lift account suspension?'}
          description={memberSuspensionDialog?.suspended
            ? `${memberSuspensionDialog.memberName} will be blocked from signing in until an administrator lifts the suspension.`
            : `${memberSuspensionDialog?.memberName ?? 'This member'} will be able to sign in again. Existing fines and circulation holds remain in effect.`}
          confirmLabel={memberSuspensionDialog?.suspended ? 'Suspend sign-in' : 'Lift suspension'}
          tone={memberSuspensionDialog?.suspended ? 'danger' : 'default'}
          busy={saving}
          confirmDisabled={(memberSuspensionDialog?.reason.trim().length ?? 0) < 3}
          onClose={() => setMemberSuspensionDialog(null)}
          onConfirm={() => void executeMemberSuspensionChange()}
        >
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Required reason
            <textarea
              required
              minLength={3}
              maxLength={500}
              rows={3}
              value={memberSuspensionDialog?.reason ?? ''}
              onChange={(event) => setMemberSuspensionDialog((current) => current ? { ...current, reason: event.target.value, error: undefined } : current)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              placeholder={memberSuspensionDialog?.suspended ? 'Why is sign-in being suspended?' : 'Why is the suspension being lifted?'}
            />
          </label>
          {memberSuspensionDialog?.error ? <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{memberSuspensionDialog.error}</p> : null}
        </ActionModal>
        <StaffCashPointTopUpModal
          member={topUpMember}
          open={topUpMember !== null}
          onClose={() => setTopUpMember(null)}
          onCompleted={() => { void loadData() }}
        />
        <ActionModal
          open={reviewDialog !== null}
          title={reviewDialog?.decision === 'approved' ? 'Approve lesson' : 'Reject lesson'}
          description={reviewDialog?.decision === 'approved' ? `Approved lessons appear in the library; they never create book catalog entries. Set an optional reward of 0–100 points (default ${defaultLessonReward}).` : 'Reject this lesson and notify the faculty member.'}
          confirmLabel={reviewDialog?.decision === 'approved' ? 'Approve lesson' : 'Reject lesson'}
          confirmDisabled={reviewDialog?.decision === 'rejected' && !reviewDialog.rejectionReason}
          tone={reviewDialog?.decision === 'approved' ? 'default' : 'danger'}
          busy={saving}
          onClose={() => setReviewDialog(null)}
          onConfirm={() => void executeContributionReview()}
        >
          {reviewDialog?.decision === 'approved' ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Reward points<input type="number" min="0" step="1" value={reviewDialog.reward} onChange={(event) => setReviewDialog({ ...reviewDialog, reward: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
          </div> : reviewDialog ? <label className="block text-sm font-medium">Rejection reason<select required value={reviewDialog.rejectionReason} onChange={(event) => setReviewDialog({ ...reviewDialog, rejectionReason: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"><option value="">Select a reason</option><option>Poor Scan Quality</option><option>Copyright Violation</option><option>Incorrect Metadata</option></select></label> : null}
        </ActionModal>
        <ActionModal
          open={bulkContributionReview !== null}
          title={bulkContributionReview?.decision === 'approved' ? 'Approve selected lessons?' : 'Reject selected lessons?'}
          description={`${selectedContributionIds.length} pending lesson${selectedContributionIds.length === 1 ? '' : 's'} will be processed with the same decision. Some may fail if their state has changed.`}
          confirmLabel={bulkContributionReview?.decision === 'approved' ? 'Approve selected' : 'Reject selected'}
          tone={bulkContributionReview?.decision === 'rejected' ? 'danger' : 'default'}
          confirmDisabled={bulkContributionReview?.decision === 'rejected' && !bulkContributionReview.rejectionReason}
          busy={saving}
          onClose={() => setBulkContributionReview(null)}
          onConfirm={() => void executeBulkContributionReview()}
        >
          {bulkContributionReview?.decision === 'approved' ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Reward points per lesson (0–100)<input type="number" min="0" max="100" step="1" value={bulkContributionReview.reward} onChange={(event) => setBulkContributionReview({ ...bulkContributionReview, reward: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
          </div> : bulkContributionReview ? <label className="block text-sm font-medium">Rejection reason for all selected PDFs<select required value={bulkContributionReview.rejectionReason} onChange={(event) => setBulkContributionReview({ ...bulkContributionReview, rejectionReason: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"><option value="">Select a reason</option><option>Poor Scan Quality</option><option>Copyright Violation</option><option>Incorrect Metadata</option></select></label> : null}
        </ActionModal>
        <ActionModal
          open={revisionDialog !== null}
          title="Request a revision"
          description="Tell the student what needs to be improved before approval."
          confirmLabel="Send revision request"
          busy={saving}
          onClose={() => setRevisionDialog(null)}
          onConfirm={() => void executeContributionRevision()}
        >
          <textarea value={revisionDialog?.feedback ?? ''} onChange={(event) => revisionDialog && setRevisionDialog({ ...revisionDialog, feedback: event.target.value })} rows={5} maxLength={1000} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Explain what the student should revise..." />
        </ActionModal>
      </div>
    </div>
  )
}
