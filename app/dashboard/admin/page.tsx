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
import PasswordInput from '@/components/PasswordInput'
import { AdminDashboardSkeleton } from '@/components/skeletons'
import { useDebounce } from '@/utils/useDebounce'
import { DIGITAL_ACCESS_DURATION_OPTIONS, getDigitalAccessCost, normalizeAccessMode, type CanonicalAccessMode, type DigitalAccessCosts } from '@/utils/libraryContracts'
import PhysicalCirculationAdminPage from '@/components/PhysicalCirculationAdminPage'
import SearchableMemberSelect from '@/components/SearchableMemberSelect'
import { generateCatalogIsbn } from '@/utils/isbn'
import { isAdminRole } from '@/utils/roles'

const navGroups = [
  { label: 'Operations', items: [{ label: 'Overview', section: 'overview' }, { label: 'Physical lending', section: 'physical-requests' }, { label: 'Member accounts', section: 'users' }, { label: 'Digital history', section: 'requests' }, { label: 'Contributions', section: 'contributions' }] },
  { label: 'Library', items: [{ label: 'Catalog management', section: 'books' }, { label: 'Physical catalog', section: 'physical' }, { label: 'Borrowing policy', section: 'policy' }] },
  { label: 'Review & insights', items: [{ label: 'Analytics', section: 'analytics' }, { label: 'Audit log', section: 'audit' }] },
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
}

type AdminProfile = {
  email: string
  role: string
  full_name?: string | null
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
}

type AuditLog = { id: number; action: string; target_type: string; target_id: number | null; details: Record<string, unknown>; created_at: string }
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
    'physical-requests': <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /><circle cx="18" cy="18" r="3" /></>,
    'physical-fines': <><path d="M12 3v18M17 7.5c-.8-1-2.3-1.5-4.5-1.5-2.4 0-4 1-4 2.7 0 4.2 9 1.4 9 5.8 0 1.8-1.8 3-4.5 3-2.2 0-4-.7-5-1.9" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a2.5 2.5 0 1 0 0-5M16 14a5 5 0 0 1 4.5 6" /></>,
    physical: <><path d="M4 7h16v13H4z" /><path d="M8 7V4h8v3M8 12h8M8 16h5" /></>,
    policy: <><path d="M6 3h12v18l-6-3-6 3z" /><path d="M9 8h6M9 12h6" /></>,
    analytics: <><path d="M5 19V9M12 19V5M19 19v-8" /><path d="M3 19h18" /></>,
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
  const [overviewPhysicalAction, setOverviewPhysicalAction] = useState<{ panel: 'requests' | 'checkedOut' | 'history' | 'lost' | 'print' | 'addBook'; token: number; caseId?: number; requestId?: number } | null>(null)
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [physicalRequestPreview, setPhysicalRequestPreview] = useState<PhysicalRequestPreview[]>([])
  const [circulationSummary, setCirculationSummary] = useState({ pendingRequests: 0, activeLoans: 0, lostLoans: 0 })
  const [digitalLoanHistory, setDigitalLoanHistory] = useState<DigitalLoanHistoryItem[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [academicCourses, setAcademicCourses] = useState<AcademicCourse[]>([])
  const [academicDepartments, setAcademicDepartments] = useState<AcademicDepartment[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionSuccessTitle, setActionSuccessTitle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newBook, setNewBook] = useState({
    title: '',
    author: '',
    category: '',
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
  const [digitalHistoryStatus, setDigitalHistoryStatus] = useState<'all' | 'active' | 'returned' | 'expired'>('all')
  const [bookPage, setBookPage] = useState(1)
  const [digitalHistoryPage, setDigitalHistoryPage] = useState(1)
  const [selectedDigitalLoanIds, setSelectedDigitalLoanIds] = useState<number[]>([])
  const [bulkRevokeOpen, setBulkRevokeOpen] = useState(false)
  const [userPage, setUserPage] = useState(1)
  const [contributionPage, setContributionPage] = useState(1)
  const [selectedContributionIds, setSelectedContributionIds] = useState<number[]>([])
  const [bulkContributionReview, setBulkContributionReview] = useState<{ decision: 'approved' | 'rejected'; reward: string; accessPoints: string } | null>(null)
  const [showContributionHistory, setShowContributionHistory] = useState(false)
  const [auditPage, setAuditPage] = useState(1)
  const [editingBookId, setEditingBookId] = useState<number | null>(null)
  const [selectedCatalogBook, setSelectedCatalogBook] = useState<Book | null>(null)
  const [bookAccessDraft, setBookAccessDraft] = useState({ mode: 'free' as 'free' | 'points', costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string> })
  const [editingBookDetailsId, setEditingBookDetailsId] = useState<number | null>(null)
  const [bookDetailsDraft, setBookDetailsDraft] = useState({ title: '', author: '', category: '', isbn: '', description: '', coverImageUrl: '' })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({ username: '', email: '', password: '', fullName: '', role: 'student' as 'student' | 'faculty' | 'librarian', school: '', department: '', course: '', studentYear: '' })
  const [recognitionForm, setRecognitionForm] = useState({ studentId: '', category: 'academic_assistance', points: '10', reason: '' })
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [confirmAction, setConfirmAction] = useState<AdminConfirm>(null)
  const [reviewDialog, setReviewDialog] = useState<{ id: number; decision: 'approved' | 'rejected'; reward: string; accessPoints: string } | null>(null)
  const [revisionDialog, setRevisionDialog] = useState<{ id: number; feedback: string } | null>(null)
  const [quickAction, setQuickAction] = useState<'recognition' | null>(null)
  const [memberToolModal, setMemberToolModal] = useState<'catalogs' | 'createMember' | null>(null)
  const [editingMember, setEditingMember] = useState<Profile | null>(null)
  const [memberEditForm, setMemberEditForm] = useState<MemberEditForm | null>(null)
  const [selectedMember, setSelectedMember] = useState<(Profile & { active_loans: number }) | null>(null)
  const [memberAccountHistory, setMemberAccountHistory] = useState<MemberAccountHistory | null>(null)
  const [memberAccountHistoryLoading, setMemberAccountHistoryLoading] = useState(false)
  const [memberAccountHistoryError, setMemberAccountHistoryError] = useState<string | null>(null)
  const [memberFineStatusAvailable, setMemberFineStatusAvailable] = useState(false)
  const [courseDraft, setCourseDraft] = useState('')
  const [facultyDraft, setFacultyDraft] = useState('')
  const [catalogRemoval, setCatalogRemoval] = useState<{ kind: 'faculty' | 'course'; id: number; name: string } | null>(null)

  const openMemberDetails = (member: Profile & { active_loans: number }) => {
    setMemberAccountHistory(null)
    setMemberAccountHistoryError(null)
    setMemberFineStatusAvailable(false)
    setSelectedMember(member)
  }

  const navigateToSection = (nextSection: string) => {
    setSection(nextSection)
    if (nextSection !== 'overview') setOverviewPhysicalAction(null)
    if (nextSection === 'physical' || nextSection === 'physical-requests') setPhysicalSectionVisited(true)
  }

  const openOverviewCirculationPanel = (panel: NonNullable<typeof overviewPhysicalAction>['panel'], requestId?: number) => {
    setOverviewPhysicalAction((current) => ({ panel, token: (current?.token ?? 0) + 1, requestId }))
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
    setEditingBookId(null)
    setEditingBookDetailsId(null)
  }

  const startBookDetailsEdit = (book: Book) => {
    setEditingBookId(null)
    setEditingBookDetailsId(book.id)
    setBookDetailsDraft({ title: book.title, author: book.author, category: book.category, isbn: book.isbn ?? '', description: book.description ?? '', coverImageUrl: book.cover_image_url ?? '' })
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
    const category = bookDetailsDraft.category.trim()
    if (!title || !author || !category) {
      setError('Title, author, and category are required.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error: updateError } = await getSupabase().from('books').update({
      title, author, category,
      isbn: bookDetailsDraft.isbn.trim() || null,
      description: bookDetailsDraft.description.trim() || null,
      cover_image_url: bookDetailsDraft.coverImageUrl.trim() || null,
    }).eq('id', book.id).select('id,title,author,category,isbn,description,cover_image_url').single()
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
    setActionMessage(null)
    const supabase = getSupabase()

    const { data: { user }, error } = await supabase.auth.getUser()
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
      setError(`Unable to load your profile. Apply the Supabase profile policies, then try again. (${profileError.message})`)
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

    const isMissingTableError = (error: { code?: string; message?: string } | null) =>
      Boolean(error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')))

    const [booksRes, requestsRes, historyRes, studentsRes, contributionsRes, auditRes, coursesRes, departmentsRes, physicalRequestsRes, pendingPhysicalRequestsRes] = await Promise.all([
      supabase
        .from('books')
        .select('id, title, author, isbn, category, description, cover_image_url, pdf_url, catalog_type, storage_provider, storage_file_id, storage_path, access_points, access_costs, access_mode, access_duration_days, created_at, is_archived')
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
        .select('id, email, username, role, created_at, points_balance, full_name, school, department, course, student_year')
        .in('role', ['student', 'faculty', 'librarian'])
        .order('created_at', { ascending: false }),
      supabase
        .from('book_contributions')
        .select('id, user_id, title, author, description, pdf_url, storage_provider, storage_file_id, storage_path, status, review_feedback, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('id,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('academic_courses').select('id,name,is_active').order('name'),
      supabase.from('academic_departments').select('id,name,is_active').order('name'),
      supabase.from('physical_book_requests').select('id,student_id,book_id,status,payment_status,payment_method,fee_amount,requested_at').order('requested_at', { ascending: false }).limit(5),
      supabase.from('physical_book_requests').select('id,student_id,book_id,status,payment_status,payment_method,fee_amount,requested_at').eq('status', 'pending').order('requested_at', { ascending: false }).limit(5),
    ])

    // Optional insights modules may not exist yet in older Supabase projects.
    // Keep the control panel usable while those sections remain empty.
    if (booksRes.error || requestsRes.error || historyRes.error || studentsRes.error || contributionsRes.error || coursesRes.error || departmentsRes.error) {
      const failedResource = [booksRes, requestsRes, historyRes, studentsRes, contributionsRes, coursesRes, departmentsRes].find((result) => result.error && !isMissingTableError(result.error))?.error
      if (failedResource) {
        setError(`Failed to load admin data: ${failedResource.message || 'Please check the Supabase schema.'}`)
      } else if (coursesRes.error || departmentsRes.error) {
        setError('Academic catalogs are not configured. Apply the academic catalog migrations in Supabase.')
      }
    }

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
    setAuditLogs((auditRes.data ?? []) as AuditLog[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [router])

  useEffect(() => {
    if (!profile || !isAdminRole(profile.role)) return

    const refreshCirculationSummary = async () => {
      const supabase = getSupabase()
      const [pendingRequests, activeLoans, lostLoans] = await Promise.all([
        supabase.from('physical_book_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('physical_book_loan_history').select('id', { count: 'exact', head: true }).in('status', ['checked_out', 'return_pending']),
        supabase.from('physical_book_loan_history').select('id', { count: 'exact', head: true }).eq('status', 'lost'),
      ])
      setCirculationSummary({
        pendingRequests: pendingRequests.count ?? 0,
        activeLoans: activeLoans.count ?? 0,
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
      const isActive = !isReturned && Boolean(loan.due_date && new Date(loan.due_date).getTime() > now)
      const isExpired = !isReturned && Boolean(loan.due_date && new Date(loan.due_date).getTime() <= now)
      const matchesStatus = digitalHistoryStatus === 'all'
        || (digitalHistoryStatus === 'active' && isActive)
        || (digitalHistoryStatus === 'returned' && isReturned)
        || (digitalHistoryStatus === 'expired' && isExpired)
      const member = studentMap.get(loan.student_id)
      const book = bookMap.get(loan.book_id)
      const searchable = [member?.email, member?.full_name, book?.title, book?.author, loan.status, String(loan.borrow_request_id), String(loan.id)]
        .filter(Boolean).join(' ').toLowerCase()
      return matchesStatus && (!query || searchable.includes(query))
    })
  }, [bookMap, debouncedDigitalHistorySearch, digitalHistoryStatus, digitalLoanHistory, studentMap])

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
  const auditPageCount = Math.max(1, Math.ceil(auditLogs.length / 10))
  const visibleAuditLogs = auditLogs.slice((Math.min(auditPage, auditPageCount) - 1) * 10, Math.min(auditPage, auditPageCount) * 10)

  useEffect(() => { setBookPage(1) }, [debouncedBookSearch, bookCategoryFilter, bookAuthorFilter])
  useEffect(() => { setDigitalHistoryPage(1) }, [debouncedDigitalHistorySearch, digitalHistoryStatus])
  useEffect(() => { setUserPage(1) }, [debouncedUserSearch, userRoleFilter, userLoanFilter])
  useEffect(() => { setContributionPage(1) }, [contributions.length])
  useEffect(() => { setAuditPage(1) }, [auditLogs.length])

  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {}
    books.forEach((b) => {
      const cat = b.category?.trim() || 'Uncategorized'
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
    const accessPoints = decision === 'approved' ? Number(bulkContributionReview.accessPoints) : 0
    if (decision === 'approved' && (!Number.isSafeInteger(reward) || reward < 0 || !Number.isSafeInteger(accessPoints) || accessPoints < 0)) {
      setError('Reward and access cost must be nonnegative whole numbers of points.')
      return
    }
    setSaving(true)
    setError(null)
    const supabase = getSupabase()
    const failed: number[] = []
    for (const contributionId of selectedContributionIds) {
      const { error } = await supabase.rpc('admin_review_book_contribution', {
        contribution_id: contributionId, decision, reward_points: reward, access_points: accessPoints,
      })
      if (error) failed.push(contributionId)
    }
    const succeeded = selectedContributionIds.length - failed.length
    setSelectedContributionIds(failed)
    setBulkContributionReview(null)
    if (succeeded) await loadData()
    setActionMessage(failed.length ? `Processed ${succeeded}; ${failed.length} contribution${failed.length === 1 ? '' : 's'} need review.` : `${succeeded} contribution${succeeded === 1 ? '' : 's'} ${decision}.`)
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
    setReviewDialog({ id: contributionId, decision, reward: decision === 'approved' ? '25' : '0', accessPoints: '0' })
  }

  const executeContributionReview = async () => {
    if (!reviewDialog) return
    const { id: contributionId, decision } = reviewDialog
    const reward = decision === 'approved' ? Number(reviewDialog.reward) : 0
    const accessPoints = decision === 'approved' ? Number(reviewDialog.accessPoints) : 0
    if (decision === 'approved' && (!Number.isSafeInteger(reward) || reward < 0)) {
      setError('Reward must be a nonnegative whole number of points.')
      return
    }
    if (decision === 'approved' && (!Number.isInteger(accessPoints) || accessPoints < 0)) {
      setError('Access cost must be a whole number of 0 or more points.')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await getSupabase().rpc('admin_review_book_contribution', {
      contribution_id: contributionId,
      decision,
      reward_points: reward,
      access_points: accessPoints,
    })
    if (error) {
      setActionSuccessTitle(null)
      setError(error.message)
    } else {
      setReviewDialog(null)
      setActionSuccessTitle(decision === 'approved' ? 'Approved' : 'Rejected')
      setActionMessage(decision === 'approved' ? `Contribution approved. ${reward} points awarded.` : 'Contribution rejected.')
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
      setActionMessage(`Member account created for ${data.email}. Username: ${data.username}.`)
      setNewStudent({ username: '', email: '', password: '', fullName: '', role: 'student', school: '', department: '', course: '', studentYear: '' })
      await loadData()
    }
    setSaving(false)
    return true
  }

  const submitRecognition = async () => {
    const awardPoints = Number(recognitionForm.points)
    if (!Number.isSafeInteger(awardPoints) || awardPoints <= 0) {
      setError('Enter a positive whole number of points.')
      return
    }
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const { error } = await getSupabase().rpc('admin_award_recognition', {
      target_user_id: recognitionForm.studentId,
      award_category: recognitionForm.category,
      award_points: awardPoints,
      award_reason: recognitionForm.reason,
    })
    if (error) setError(error.message)
    else {
      setActionMessage('Recognition points awarded successfully.')
      setRecognitionForm({ studentId: '', category: 'academic_assistance', points: '10', reason: '' })
      setQuickAction(null)
    }
    setSaving(false)
  }

  const handleAddBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newBook.title.trim() || !newBook.author.trim() || !newBook.category.trim() || !newBook.isbn.trim()) {
      setError('Title, author, category, and ISBN are required.')
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
      formData.append('category', newBook.category || 'Books')
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
        category: newBook.category,
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
      setNewBook({ title: '', author: '', category: '', isbn: '', pdf_url: '', access_costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string>, access_mode: 'free', access_duration_days: '30', description: '' })
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

  return (
    <div className="dashboard-shell admin-shell min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      {sidebarOpen ? <button type="button" className="admin-sidebar-backdrop" aria-label="Close admin navigation" onClick={() => setSidebarOpen(false)} /> : null}
      <div className={`dashboard-layout admin-layout mx-auto max-w-[1500px] ${sidebarCollapsed ? 'dashboard-sidebar-collapsed admin-sidebar-collapsed' : ''}`}>
        <aside id="admin-navigation" className={`dashboard-sidebar admin-sidebar ${sidebarOpen ? 'dashboard-sidebar-open admin-sidebar-open' : ''}`}>
          <div className="admin-sidebar-brand mb-8 space-y-3">
            <div className="admin-sidebar-brand-row">
              <BrandLogo className="admin-brand-logo" iconSize="sm" subtitle="Admin workspace" />
              <button type="button" className="admin-sidebar-toggle" onClick={() => { if (sidebarOpen) setSidebarOpen(false); else setSidebarCollapsed((current) => !current) }} aria-label={sidebarOpen ? 'Close admin navigation' : sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'} title={sidebarOpen ? 'Close admin navigation' : sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">{sidebarOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg></button>
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
                {group.items.map((item) => <button key={item.section} type="button" onClick={() => { navigateToSection(item.section); setSidebarOpen(false) }} aria-label={item.label} title={sidebarCollapsed ? item.label : undefined} className={`admin-nav-button w-full text-left rounded-2xl px-4 py-3 text-sm font-medium transition ${section === item.section ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80'}`}><span className="admin-nav-icon"><AdminNavIcon section={item.section} /></span><span>{item.label}</span></button>)}
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
          <header className="dashboard-hero rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
            <button type="button" className="admin-mobile-toggle" onClick={() => setSidebarOpen(true)} aria-controls="admin-navigation" aria-expanded={sidebarOpen} aria-label="Open admin navigation"><span aria-hidden="true">☰</span></button>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Welcome back, {profile?.full_name?.trim() || 'Admin'}</h1>
              <div className="rounded-[1.5rem] bg-slate-100 p-4 text-sm font-medium text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                Active role: <span className="font-semibold text-slate-900 dark:text-slate-100">{profile?.role}</span>
              </div>
            </div>
          </header>

          {section === 'overview' && (
            <section className="admin-overview space-y-6">
              <section className="admin-overview-card admin-quick-actions rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6" aria-labelledby="quick-actions-title">
                <div className="admin-overview-section-heading"><div><h2 id="quick-actions-title">Quick actions</h2><p>Common tasks, one click away.</p></div></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button type="button" onClick={() => { setSection('users'); setMemberToolModal('createMember') }} className="admin-quick-action admin-quick-action-primary"><strong>Create account</strong><span>Provision a student, faculty, or librarian</span></button>
                  <button type="button" onClick={() => setQuickAction('recognition')} className="admin-quick-action admin-quick-action-primary"><strong>Give points</strong><span>Recognize a member</span></button>
                  <button type="button" onClick={() => setSection('contributions')} className="admin-quick-action"><strong>Review contributions · {pendingContributions.length} pending</strong><span>Check pending academic materials</span></button>
                  <button type="button" onClick={() => navigateToSection('physical')} className="admin-quick-action"><strong>Add a physical book</strong><span>Create a title, copies, and QR labels</span></button>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Library Analytics & Intelligence</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">High-level telemetry of collection health, borrowing activity, fulfillment rates, and storage.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateToSection('analytics')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    View detailed analytics →
                  </button>
                </div>
                <AdminAnalytics
                  totalBooks={books.length}
                  totalStudents={students.length}
                  totalRequests={requests.length}
                  totalLoansActive={activeDigitalAccess.length}
                  totalReturned={requests.filter((r) => r.status === 'returned').length}
                  categoryStats={categoryStats}
                  monthlyStats={monthlyStats}
                  storageCount={storageCount}
                />
              </section>
            </section>
          )}

          {section === 'analytics' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Library Analytics & Intelligence</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track borrowing velocity, inventory health, fulfillment rates, and storage utilization.</p>
                </div>
              </div>
              <AdminAnalytics
                totalBooks={books.length}
                totalStudents={students.length}
                totalRequests={requests.length}
                totalLoansActive={activeDigitalAccess.length}
                totalReturned={requests.filter((r) => r.status === 'returned').length}
                categoryStats={categoryStats}
                monthlyStats={monthlyStats}
                storageCount={storageCount}
              />
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

              {selectedCatalogBook ? <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setSelectedCatalogBook(null); setEditingBookId(null) } }}>
                <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="catalog-book-details-title">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">Catalog book</p><h3 id="catalog-book-details-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{selectedCatalogBook.title}</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedCatalogBook.author} · {selectedCatalogBook.category}</p></div>
                    <button type="button" onClick={() => { setSelectedCatalogBook(null); setEditingBookId(null) }} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700">Close</button>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">Format</p><p className="mt-1 font-semibold capitalize">{selectedCatalogBook.catalog_type}</p></div><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">Access</p><p className="mt-1 font-semibold capitalize">{selectedCatalogBook.access_mode}</p></div><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">ISBN</p><p className="mt-1 font-semibold">{selectedCatalogBook.isbn || 'Not set'}</p></div><div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800"><p className="text-xs text-slate-500">File</p><p className="mt-1 font-semibold">{selectedCatalogBook.pdf_url || selectedCatalogBook.storage_path || selectedCatalogBook.storage_file_id ? 'Available' : 'Missing'}</p></div></div>
                  {selectedCatalogBook.description ? <p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-300">{selectedCatalogBook.description}</p> : null}
                  {editingBookDetailsId === selectedCatalogBook.id ? <form onSubmit={(event) => void saveBookDetailsEdit(event, selectedCatalogBook)} className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Edit book information</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Title<input required maxLength={300} value={bookDetailsDraft.title} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label><label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Author<input required maxLength={200} value={bookDetailsDraft.author} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, author: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label><label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Category<input required maxLength={120} value={bookDetailsDraft.category} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, category: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label><div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300">ISBN<input maxLength={32} value={bookDetailsDraft.isbn} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, isbn: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label><button type="button" onClick={() => generateBookIsbn((isbn) => setBookDetailsDraft((current) => ({ ...current, isbn })), selectedCatalogBook.id)} className="mt-2 text-xs font-semibold text-sky-700 underline dark:text-sky-300">Generate ISBN-13</button><span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">Internal catalog ID, not a publisher-assigned ISBN.</span></div></div><label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">Description<textarea maxLength={5000} rows={4} value={bookDetailsDraft.description} onChange={(event) => setBookDetailsDraft((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label><div className="mt-4 flex flex-wrap gap-2"><button type="submit" disabled={saving} className="pine-action rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save book details'}</button><button type="button" disabled={saving} onClick={() => setEditingBookDetailsId(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Cancel</button></div></form> : editingBookId === selectedCatalogBook.id ? <form onSubmit={(event) => void saveBookAccessEdit(event, selectedCatalogBook)} className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70"><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Edit access settings</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Mode<select value={bookAccessDraft.mode} onChange={(event) => setBookAccessDraft((current) => ({ ...current, mode: event.target.value as typeof current.mode }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900"><option value="free">Free</option><option value="points">Points</option></select></label>{bookAccessDraft.mode === 'points' ? DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => <label key={days} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{days} {days === 1 ? 'day' : 'days'}<input type="number" min="0" step="1" value={bookAccessDraft.costs[String(days)] ?? '0'} onChange={(event) => setBookAccessDraft((current) => ({ ...current, costs: { ...current.costs, [days]: event.target.value } }))} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900" /></label>) : <p className="text-sm text-slate-500 dark:text-slate-400">Free access unlocks immediately. No points are deducted.</p>}</div><div className="mt-4 flex flex-wrap gap-2"><button type="submit" disabled={saving} className="pine-action rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : 'Save access'}</button><button type="button" onClick={() => setEditingBookId(null)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Cancel</button></div></form> : <div className="mt-6 flex flex-wrap gap-2"><button type="button" disabled={saving || !(selectedCatalogBook.pdf_url || selectedCatalogBook.storage_path)} onClick={() => window.open(`/reader/${selectedCatalogBook.id}`, '_blank', 'noopener,noreferrer')} className="pine-action rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Open reader</button><button type="button" disabled={saving} onClick={() => openPdfAttachment(selectedCatalogBook.id)} className="rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/30">{selectedCatalogBook.pdf_url || selectedCatalogBook.storage_path ? 'Replace PDF' : 'Attach PDF'}</button><button type="button" disabled={saving} onClick={() => startBookDetailsEdit(selectedCatalogBook)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Edit details</button><button type="button" disabled={saving} onClick={() => startBookAccessEdit(selectedCatalogBook)} className="pine-action rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Edit access</button><button type="button" disabled={saving} onClick={() => handleArchiveBook(selectedCatalogBook.id, selectedCatalogBook.title)} className="!bg-rose-700 !text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:!bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:!bg-rose-700 dark:hover:!bg-rose-600">{selectedCatalogBook.is_archived ? 'Restore to catalog' : 'Archive book'}</button>{selectedCatalogBook.is_archived ? <button type="button" disabled={saving} onClick={() => setConfirmAction({ type: 'deleteBook', id: selectedCatalogBook.id, label: selectedCatalogBook.title })} className="rounded-xl border border-rose-400 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300">Delete permanently</button> : null}</div>}
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
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Category</span>
                    <input
                      value={newBook.category}
                      onChange={(event) => setNewBook({ ...newBook, category: event.target.value })}
                      required
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
              {pdfAttachmentOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setPdfAttachmentOpen(false) }}>
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
            <div hidden={section !== 'physical' && section !== 'physical-requests'}>
              <PhysicalCirculationAdminPage
                active={section === 'physical' || section === 'physical-requests'}
                requestsOnly={section === 'physical-requests'}
                catalogOnly={section === 'physical'}
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
                  <select value={digitalHistoryStatus} onChange={(event) => setDigitalHistoryStatus(event.target.value as typeof digitalHistoryStatus)} aria-label="Filter digital loan history by status" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <option value="all">All loan states</option><option value="active">Active</option><option value="returned">Returned</option><option value="expired">Expired</option>
                  </select>
                </div>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Showing {filteredDigitalLoanHistory.length} of {digitalLoanHistory.length} loans</p>
                {selectedDigitalLoanIds.length ? <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/30"><span>{selectedDigitalLoanIds.length} active loan{selectedDigitalLoanIds.length === 1 ? '' : 's'} selected</span><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => setBulkRevokeOpen(true)} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-800 disabled:opacity-50 dark:text-rose-200">Revoke selected</button><button type="button" onClick={() => setSelectedDigitalLoanIds([])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700">Clear</button></div></div> : null}
                <div>
                  <table className="w-full table-fixed divide-y divide-slate-200 text-left text-xs sm:text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><tr><th className="w-10 px-2 py-3"><input type="checkbox" aria-label="Select active digital loans on this page" checked={visibleActiveDigitalRequestIds.length > 0 && visibleActiveDigitalRequestIds.every((id) => selectedDigitalLoanIds.includes(id))} onChange={(event) => setSelectedDigitalLoanIds((current) => event.target.checked ? Array.from(new Set([...current, ...visibleActiveDigitalRequestIds])) : current.filter((id) => !visibleActiveDigitalRequestIds.includes(id)))} /></th><th className="w-[17%] px-2 py-3 font-semibold sm:px-3">Member</th><th className="w-[17%] px-2 py-3 font-semibold sm:px-3">Book</th><th className="w-[14%] px-2 py-3 font-semibold sm:px-3">Issue date</th><th className="w-[18%] px-2 py-3 font-semibold sm:px-3">Due / returned</th><th className="w-[16%] px-2 py-3 font-semibold sm:px-3">Loan</th><th className="w-[14%] px-2 py-3 font-semibold sm:px-3">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {visibleDigitalLoanHistory.map((loan) => {
                        const request = requests.find((item) => item.id === loan.borrow_request_id)
                        const active = request ? isActiveDigitalAccess(request) : false
                        return <tr key={loan.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/80">
                          <td className="px-2 py-3">{active && request ? <input type="checkbox" aria-label={`Select active loan for ${memberDisplayName(studentMap.get(loan.student_id))}`} checked={selectedDigitalLoanIds.includes(request.id)} onChange={(event) => setSelectedDigitalLoanIds((current) => event.target.checked ? [...current, request.id] : current.filter((id) => id !== request.id))} /> : null}</td>
                          <td className="break-words px-2 py-3 font-medium text-slate-800 dark:text-slate-100 sm:px-3">{memberDisplayName(studentMap.get(loan.student_id))}</td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3">{bookMap.get(loan.book_id)?.title ?? 'Unknown book'}</td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block text-[10px] uppercase tracking-wide text-slate-400">{loan.borrowed_at ? 'Borrowed' : 'Requested'}</span><time>{new Date(loan.borrowed_at ?? loan.requested_at).toLocaleDateString()}</time></td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block">Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}</span>{loan.returned_at ? <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-300">Returned {new Date(loan.returned_at).toLocaleDateString()}</span> : null}</td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block">{loan.duration_days} days</span><span className="block">{loan.renewal_count} renewals · {loan.points_cost} pts</span></td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block capitalize">{loan.status.replace('_', ' ')}</span>{active && request ? <button type="button" disabled={saving} onClick={() => handleRevoke(request.id)} className="mt-2 inline-flex items-center rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200 dark:hover:bg-rose-950">Revoke access</button> : null}</td>
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
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Audit log</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review recent point, recognition, contribution, and access actions.</p>
              <div className="mt-5 space-y-3">{visibleAuditLogs.map((log) => <article key={log.id} className="rounded-2xl border border-paper-300 p-4 dark:border-forest-700"><div className="flex flex-wrap justify-between gap-2"><strong className="capitalize">{log.action.replaceAll('_', ' ')}</strong><span className="text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</span></div><p className="mt-1 text-xs text-slate-500">{log.target_type} #{log.target_id ?? '—'}</p></article>)}{auditLogs.length === 0 ? <p className="text-sm text-slate-500">No audit events recorded yet.</p> : null}</div>
              <ListPagination page={Math.min(auditPage, auditPageCount)} pageCount={auditPageCount} total={auditLogs.length} onPageChange={setAuditPage} />
            </section>
          )}

          {section === 'contributions' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Community contributions</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review each submitted PDF before deciding whether to approve, request a revision, or reject it.</p>
                <button type="button" onClick={() => setShowContributionHistory((shown) => !shown)} className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">{showContributionHistory ? 'Hide review history' : `Review history (${reviewedContributions.length})`}</button>
              </div>
              {pendingContributions.length ? <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visiblePendingContributions.length > 0 && visiblePendingContributions.every((item) => selectedContributionIds.includes(item.id))} onChange={(event) => setSelectedContributionIds((current) => event.target.checked ? Array.from(new Set([...current, ...visiblePendingContributions.map((item) => item.id)])) : current.filter((id) => !visiblePendingContributions.some((item) => item.id === id)))} />Select pending contributions on this page</label>{selectedContributionIds.length ? <div className="flex flex-wrap items-center gap-2"><span className="text-xs">{selectedContributionIds.length} selected</span><button type="button" disabled={saving} onClick={() => setBulkContributionReview({ decision: 'approved', reward: '25', accessPoints: '0' })} className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">Approve selected</button><button type="button" disabled={saving} onClick={() => setBulkContributionReview({ decision: 'rejected', reward: '0', accessPoints: '0' })} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-800 dark:text-rose-200">Reject selected</button><button type="button" onClick={() => setSelectedContributionIds([])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-700">Clear</button></div> : null}</div> : null}
              <div className="space-y-3">
                {pendingContributions.length > 0 ? visiblePendingContributions.map((contribution) => (
                  <article key={contribution.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3"><input type="checkbox" className="mt-1 shrink-0" aria-label={`Select contribution ${contribution.title}`} checked={selectedContributionIds.includes(contribution.id)} onChange={(event) => setSelectedContributionIds((current) => event.target.checked ? [...current, contribution.id] : current.filter((id) => id !== contribution.id))} /><div className="min-w-0">
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{contribution.title}</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">by {contribution.author} · from {memberDisplayName(students.find((student) => student.id === contribution.user_id), 'Unknown student')}</p>
                        {contribution.description ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{contribution.description}</p> : null}
                        {(contribution.pdf_url || contribution.storage_file_id || contribution.storage_path) ? <a href={`/api/contributions/${contribution.id}/file`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-sky-600 hover:underline dark:text-sky-300">Open submitted PDF</a> : null}
                      </div></div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" disabled={saving} onClick={() => void handleContributionRevision(contribution.id)} className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50 dark:border-amber-900/50 dark:text-amber-300">Request revision</button>
                        <button type="button" disabled={saving} onClick={() => void handleContributionReview(contribution.id, 'rejected')} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-300">Reject</button>
                        <button type="button" disabled={saving} onClick={() => void handleContributionReview(contribution.id, 'approved')} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Approve</button>
                      </div>
                    </div>
                  </article>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-6 w-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4z" /></svg></span><p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">No pending contributions</p><p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">Member-submitted books will appear here when they are ready for review.</p></div>
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
                <button type="button" onClick={() => setMemberToolModal('createMember')} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Create member account</button>
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
              {memberToolModal === 'createMember' ? <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setMemberToolModal(null) }}><section className="my-6 w-full max-w-3xl min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="create-member-title"><div className="flex items-start justify-between gap-4"><div><h3 id="create-member-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Create member account</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Provision a student, faculty, or librarian account with its academic details.</p></div><button type="button" disabled={saving} onClick={() => setMemberToolModal(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">Close</button></div>
              <form onSubmit={async (event) => { if (await handleCreateStudent(event)) setMemberToolModal(null) }} className="mt-5">
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <input type="text" required maxLength={120} value={newStudent.fullName} onChange={(event) => setNewStudent({ ...newStudent, fullName: event.target.value })} placeholder="Full name" className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input type="text" required minLength={3} maxLength={30} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,29}" autoComplete="off" value={newStudent.username} onChange={(event) => setNewStudent({ ...newStudent, username: event.target.value.toLowerCase() })} placeholder="Username (3–30 characters)" className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input type="email" required value={newStudent.email} onChange={(event) => setNewStudent({ ...newStudent, email: event.target.value })} placeholder="member@example.com" className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <PasswordInput required minLength={8} value={newStudent.password} onChange={(event) => setNewStudent({ ...newStudent, password: event.target.value })} placeholder="Temporary password" className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <select required aria-label="Account type" value={newStudent.role} onChange={(event) => setNewStudent({ ...newStudent, role: event.target.value as 'student' | 'faculty' | 'librarian', department: '' })} className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                    <option value="librarian">Librarian</option>
                  </select>
                  {newStudent.role === 'faculty' ? <label className="block min-w-0 text-sm font-medium">Department<select required value={newStudent.department} onChange={(event) => setNewStudent({ ...newStudent, department: event.target.value })} className="box-border mt-1.5 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Select department</option>{academicDepartments.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label> : null}
                  {newStudent.role === 'student' ? <select required value={newStudent.course} onChange={(event) => setNewStudent({ ...newStudent, course: event.target.value })} className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Course</option>{academicCourses.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select> : null}
                  {newStudent.role === 'student' ? <select required value={newStudent.studentYear} onChange={(event) => setNewStudent({ ...newStudent, studentYear: event.target.value })} className="box-border w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"><option value="">Year level</option>{['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].map((year) => <option key={year} value={year}>{year}</option>)}</select> : null}
                </div>
                <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{saving ? 'Creating...' : 'Create member account'}</button>
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
            <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setRecognitionForm((current) => ({ ...current, studentId: selectedMember.id })); setSelectedMember(null); setQuickAction('recognition') }} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Give points</button><button type="button" onClick={() => { setSelectedMember(null); openMemberEditor(selectedMember) }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Edit profile</button>{profile?.role === 'admin' ? <button type="button" onClick={() => { setSelectedMember(null); setConfirmAction({ type: 'deleteMember', id: selectedMember.id, label: memberDisplayName(selectedMember, selectedMember.email) }) }} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white">Delete account</button> : null}</div>
          </section>
        </div> : null}
        <ActionModal
          open={quickAction === 'recognition'}
          title="Give student points"
          description="Award verified recognition points directly from the admin dashboard."
          confirmLabel="Award points"
          busy={saving}
          onClose={() => { if (!saving) setQuickAction(null) }}
          onConfirm={() => {
            if (!recognitionForm.studentId || !recognitionForm.reason.trim()) {
              setError('Choose a student and enter a reason before awarding points.')
              return
            }
            void submitRecognition()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><SearchableMemberSelect members={students.filter((student) => student.role === 'student')} value={recognitionForm.studentId} onChange={(studentId) => setRecognitionForm((current) => ({ ...current, studentId }))} label="Student" placeholder="Type a student name or email”¦" /></div>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Points
              <input required type="text" inputMode="numeric" pattern="[0-9]+" value={recognitionForm.points} onChange={(event) => setRecognitionForm((current) => ({ ...current, points: event.target.value }))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Category
              <select value={recognitionForm.category} onChange={(event) => setRecognitionForm({ ...recognitionForm, category: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"><option value="academic_assistance">Academic assistance</option><option value="community_contribution">Community contribution</option><option value="volunteer_work">Volunteer work</option><option value="academic_achievement">Academic achievement</option><option value="special_recognition">Special recognition</option></select>
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Reason
              <textarea required maxLength={500} value={recognitionForm.reason} onChange={(event) => setRecognitionForm((current) => ({ ...current, reason: event.target.value }))} rows={3} placeholder="What did the student do?" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
            </label>
          </div>
        </ActionModal>
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
          open={reviewDialog !== null}
          title={reviewDialog?.decision === 'approved' ? 'Approve contribution' : 'Reject contribution'}
          description={reviewDialog?.decision === 'approved' ? 'Set the reward and the points cost for each seven-day access period.' : 'Reject this contribution and notify the student.'}
          confirmLabel={reviewDialog?.decision === 'approved' ? 'Approve contribution' : 'Reject contribution'}
          tone={reviewDialog?.decision === 'approved' ? 'default' : 'danger'}
          busy={saving}
          onClose={() => setReviewDialog(null)}
          onConfirm={() => void executeContributionReview()}
        >
          {reviewDialog?.decision === 'approved' ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Reward points<input type="number" min="0" step="1" value={reviewDialog.reward} onChange={(event) => setReviewDialog({ ...reviewDialog, reward: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Access cost / 7 days<input type="number" min="0" value={reviewDialog.accessPoints} onChange={(event) => setReviewDialog({ ...reviewDialog, accessPoints: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
          </div> : null}
        </ActionModal>
        <ActionModal
          open={bulkContributionReview !== null}
          title={bulkContributionReview?.decision === 'approved' ? 'Approve selected contributions?' : 'Reject selected contributions?'}
          description={`${selectedContributionIds.length} pending contribution${selectedContributionIds.length === 1 ? '' : 's'} will be processed with the same decision. Some may fail if their state has changed.`}
          confirmLabel={bulkContributionReview?.decision === 'approved' ? 'Approve selected' : 'Reject selected'}
          tone={bulkContributionReview?.decision === 'rejected' ? 'danger' : 'default'}
          busy={saving}
          onClose={() => setBulkContributionReview(null)}
          onConfirm={() => void executeBulkContributionReview()}
        >
          {bulkContributionReview?.decision === 'approved' ? <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Reward points per contribution<input type="number" min="0" step="1" value={bulkContributionReview.reward} onChange={(event) => setBulkContributionReview({ ...bulkContributionReview, reward: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-sm font-medium">Access cost / 7 days<input type="number" min="0" step="1" value={bulkContributionReview.accessPoints} onChange={(event) => setBulkContributionReview({ ...bulkContributionReview, accessPoints: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
          </div> : null}
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
