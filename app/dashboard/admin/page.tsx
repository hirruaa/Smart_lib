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
import { isStaffRole } from '@/utils/roles'

const navGroups = [
  { label: 'Operations', items: [{ label: 'Overview', section: 'overview' }, { label: 'Digital access history', section: 'requests' }, { label: 'Physical requests', section: 'physical-requests' }, { label: 'Users', section: 'users' }] },
  { label: 'Library', items: [{ label: 'E-book catalog', section: 'books' }, { label: 'Physical catalog', section: 'physical' }] },
  { label: 'Intelligence', items: [{ label: 'Analytics', section: 'analytics' }] },
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
  pdf_url: string | null
  catalog_type: 'digital' | 'physical' | 'hybrid'
  storage_provider?: string | null
  storage_file_id?: string | null
  storage_path?: string | null
  access_points: number
  access_costs: DigitalAccessCosts | null
  access_mode: CanonicalAccessMode
  premium_price: number
  access_duration_days: number
  created_at: string | null
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

type Profile = {
  id: string
  email: string
  role: string
  created_at: string | null
  points_balance?: number | null
  full_name?: string | null
  school?: string | null
  department?: string | null
  course?: string | null
  student_year?: string | null
  faculty_rank_id?: number | null
}

type FacultyRank = { id: number; title: string; is_active: boolean }
type AcademicCourse = { id: number; name: string; is_active: boolean }
type AcademicDepartment = { id: number; name: string; is_active: boolean }
type FacultyCourse = { faculty_id: string; course_id: number }
type MemberEditForm = {
  role: 'student' | 'faculty' | 'librarian'
  school: string
  department: string
  course: string
  studentYear: string
  facultyRankId: string
  courseIds: string[]
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
  ai_screening_result?: {
    recommendation: string
    relevance_score: number
    summary: string
    usefulness: string
    concerns: string[]
    human_review_required: true
  } | null
}

type AuditLog = { id: number; action: string; target_type: string; target_id: number | null; details: Record<string, unknown>; created_at: string }
type AdminConfirm = { type: 'deleteBook' | 'revokeLoan'; id: number; label?: string } | { type: 'deleteMember'; id: string; label?: string } | null

function memberDisplayName(member?: Pick<Profile, 'full_name' | 'email'> | null, fallback = 'Member') {
  return member?.full_name?.trim() || fallback
}

function AdminNavIcon({ section }: { section: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    books: <><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" /><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19M9 7h6M9 10h4" /></>,
    requests: <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></>,
    'physical-requests': <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /><circle cx="18" cy="18" r="3" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a2.5 2.5 0 1 0 0-5M16 14a5 5 0 0 1 4.5 6" /></>,
    physical: <><path d="M4 7h16v13H4z" /><path d="M8 7V4h8v3M8 12h8M8 16h5" /></>,
    analytics: <><path d="M5 19V9M12 19V5M19 19v-8" /><path d="M3 19h18" /></>,
    materials: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    backups: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 1 4 16.5z" /><path d="M4 8h13M4 16h13M9 12h6" /></>,
  }

  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[section]}</svg>
}

export default function AdminPage() {
  const router = useRouter()
  const [section, setSection] = useState('overview')
  const [physicalRequestsOpen, setPhysicalRequestsOpen] = useState(false)
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [physicalRequestPreview, setPhysicalRequestPreview] = useState<PhysicalRequestPreview[]>([])
  const [digitalLoanHistory, setDigitalLoanHistory] = useState<DigitalLoanHistoryItem[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [facultyRanks, setFacultyRanks] = useState<FacultyRank[]>([])
  const [academicCourses, setAcademicCourses] = useState<AcademicCourse[]>([])
  const [academicDepartments, setAcademicDepartments] = useState<AcademicDepartment[]>([])
  const [facultyCourses, setFacultyCourses] = useState<FacultyCourse[]>([])
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [screeningId, setScreeningId] = useState<number | null>(null)
  const [newBook, setNewBook] = useState({
    title: '',
    author: '',
    category: '',
    isbn: '',
    pdf_url: '',
    access_costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string>,
    access_mode: 'free' as 'free' | 'points' | 'premium',
    premium_price: '',
    access_duration_days: '30',
    description: '',
  })
  const [pdfBookId, setPdfBookId] = useState<number | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfAttachmentOpen, setPdfAttachmentOpen] = useState(false)
  const [newBookFile, setNewBookFile] = useState<File | null>(null)
  const [newBookOpen, setNewBookOpen] = useState(false)
  const [newBookStorageProvider, setNewBookStorageProvider] = useState<'google_drive' | 'supabase'>('supabase')
  const [materialFile, setMaterialFile] = useState<File | null>(null)
  const [materialStorageProvider, setMaterialStorageProvider] = useState<'google_drive' | 'supabase'>('supabase')
  const [bookSearch, setBookSearch] = useState('')
  const debouncedBookSearch = useDebounce(bookSearch, 200)
  const [userSearch, setUserSearch] = useState('')
  const debouncedUserSearch = useDebounce(userSearch, 200)
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'student' | 'faculty' | 'librarian'>('all')
  const [userLoanFilter, setUserLoanFilter] = useState<'all' | 'active' | 'none'>('all')
  const [digitalHistorySearch, setDigitalHistorySearch] = useState('')
  const debouncedDigitalHistorySearch = useDebounce(digitalHistorySearch, 200)
  const [digitalHistoryStatus, setDigitalHistoryStatus] = useState<'all' | 'active' | 'returned' | 'expired'>('all')
  const [bookPage, setBookPage] = useState(1)
  const [digitalHistoryPage, setDigitalHistoryPage] = useState(1)
  const [userPage, setUserPage] = useState(1)
  const [contributionPage, setContributionPage] = useState(1)
  const [auditPage, setAuditPage] = useState(1)
  const [editingBookId, setEditingBookId] = useState<number | null>(null)
  const [bookAccessDraft, setBookAccessDraft] = useState({ mode: 'free' as 'free' | 'points' | 'premium', premiumPrice: '0', costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string> })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({ email: '', password: '', fullName: '', role: 'student' as 'student' | 'faculty' | 'librarian', school: '', department: '', course: '', studentYear: '' })
  const [recognitionForm, setRecognitionForm] = useState({ studentId: '', category: 'academic_assistance', points: '10', reason: '' })
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [grantForm, setGrantForm] = useState({ studentId: '', bookId: '', duration: '7', reason: '' })
  const [confirmAction, setConfirmAction] = useState<AdminConfirm>(null)
  const [reviewDialog, setReviewDialog] = useState<{ id: number; decision: 'approved' | 'rejected'; reward: string; accessPoints: string } | null>(null)
  const [revisionDialog, setRevisionDialog] = useState<{ id: number; feedback: string } | null>(null)
  const [quickAction, setQuickAction] = useState<'recognition' | 'grant' | null>(null)
  const [memberToolModal, setMemberToolModal] = useState<'catalogs' | 'createMember' | null>(null)
  const [editingMember, setEditingMember] = useState<Profile | null>(null)
  const [memberEditForm, setMemberEditForm] = useState<MemberEditForm | null>(null)
  const [selectedMember, setSelectedMember] = useState<(Profile & { active_loans: number }) | null>(null)
  const [rankDraft, setRankDraft] = useState('')
  const [courseDraft, setCourseDraft] = useState('')
  const [departmentDraft, setDepartmentDraft] = useState('')

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

  const handleDeleteBook = async (bookId: number, title: string) => {
    setConfirmAction({ type: 'deleteBook', id: bookId, label: title })
  }

  const executeDeleteBook = async (bookId: number, title: string) => {
    setSaving(true)
    setError(null)
    const supabase = getSupabase()
    const { error: delError } = await supabase.from('books').delete().eq('id', bookId)
    if (delError) {
      const message = delError.message.toLowerCase()
      if (delError.code === '23503' && message.includes('digital_book_loan_history')) {
        setError(`"${title}" cannot be deleted because it has digital loan history. Keep the title for audit records and remove or replace its PDF instead.`)
      } else if (delError.code === '23503' && message.includes('physical_book_loan_history')) {
        setError(`"${title}" cannot be deleted because it has physical circulation history. Keep the title for audit records and manage its copies instead.`)
      } else {
        setError(delError.message)
      }
    } else {
      setActionMessage(`"${title}" was removed from the catalog.`)
      await loadData()
    }
    setSaving(false)
  }

  const startBookAccessEdit = (book: Book) => {
    setEditingBookId(book.id)
    setBookAccessDraft({
      mode: book.access_mode,
      premiumPrice: String(book.premium_price ?? 0),
      costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, String(book.access_costs?.[String(days) as keyof DigitalAccessCosts] ?? getDigitalAccessCost(book.access_points, days))])),
    })
  }

  const saveBookAccessEdit = async (event: FormEvent<HTMLFormElement>, book: Book) => {
    event.preventDefault()
    const costs = Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [String(days), Number(bookAccessDraft.costs[String(days)])]))
    if (Object.values(costs).some((cost) => !Number.isInteger(cost) || cost < 0)) {
      setError('Each access cost must be a whole number of points greater than or equal to zero.')
      return
    }
    const premiumPrice = Number(bookAccessDraft.premiumPrice)
    if (bookAccessDraft.mode === 'premium' && (!Number.isFinite(premiumPrice) || premiumPrice <= 0)) {
      setError('Set a premium price greater than zero.')
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
        premium_price: bookAccessDraft.mode === 'premium' ? premiumPrice : 0,
      })
      .eq('id', book.id)
      .select('id, access_points, access_costs, access_mode, premium_price, access_duration_days')
      .single()

    if (updateError) {
      setError(updateError.message)
    } else {
      setBooks((current) => current.map((item) => item.id === book.id ? {
        ...item,
        access_points: data.access_points,
        access_costs: data.access_costs as DigitalAccessCosts,
        access_mode: normalizeAccessMode(data.access_mode, data.access_points),
        premium_price: Number(data.premium_price ?? 0),
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

    if (!isStaffRole(role)) {
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

    const [booksRes, requestsRes, historyRes, studentsRes, contributionsRes, auditRes, ranksRes, coursesRes, facultyCoursesRes, departmentsRes, physicalRequestsRes] = await Promise.all([
      supabase
        .from('books')
        .select('id, title, author, isbn, category, description, pdf_url, catalog_type, storage_provider, storage_file_id, storage_path, access_points, access_costs, access_mode, premium_price, access_duration_days, created_at')
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
        .select('id, email, role, created_at, points_balance, full_name, school, department, course, student_year, faculty_rank_id')
        .in('role', ['student', 'faculty', 'librarian'])
        .order('created_at', { ascending: false }),
      supabase
        .from('book_contributions')
        .select('id, user_id, title, author, description, pdf_url, storage_provider, storage_file_id, storage_path, status, review_feedback, ai_screening_result, ai_screened_at, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('id,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('faculty_ranks').select('id,title,is_active').order('title'),
      supabase.from('academic_courses').select('id,name,is_active').order('name'),
      supabase.from('faculty_courses').select('faculty_id,course_id'),
      supabase.from('academic_departments').select('id,name,is_active').order('name'),
      supabase.from('physical_book_requests').select('id,student_id,book_id,status,payment_status,payment_method,fee_amount,requested_at').order('requested_at', { ascending: false }).limit(10),
    ])

    // Optional insights modules may not exist yet in older Supabase projects.
    // Keep the control panel usable while those sections remain empty.
    if (booksRes.error || requestsRes.error || historyRes.error || studentsRes.error || contributionsRes.error || ranksRes.error || coursesRes.error || facultyCoursesRes.error || departmentsRes.error) {
      const failedResource = [booksRes, requestsRes, historyRes, studentsRes, contributionsRes, ranksRes, coursesRes, facultyCoursesRes, departmentsRes].find((result) => result.error && !isMissingTableError(result.error))?.error
      if (failedResource) {
        setError(`Failed to load admin data: ${failedResource.message || 'Please check the Supabase schema.'}`)
      } else if (ranksRes.error || coursesRes.error || facultyCoursesRes.error || departmentsRes.error) {
        setError('Academic catalogs are not configured. Apply the academic catalog and faculty signup migrations in Supabase.')
      }
    }

    setBooks((booksRes.data ?? []).map((book) => ({
      ...book,
      access_mode: normalizeAccessMode(book.access_mode, book.access_points),
    })) as Book[])
    setRequests((requestsRes.data ?? []) as RequestItem[])
    setPhysicalRequestPreview((physicalRequestsRes.data ?? []) as PhysicalRequestPreview[])
    setDigitalLoanHistory((historyRes.data ?? []) as DigitalLoanHistoryItem[])
    setStudents((studentsRes.data ?? []) as Profile[])
    setFacultyRanks((ranksRes.data ?? []) as FacultyRank[])
    setAcademicCourses((coursesRes.data ?? []) as AcademicCourse[])
    setAcademicDepartments((departmentsRes.data ?? []) as AcademicDepartment[])
    setFacultyCourses((facultyCoursesRes.data ?? []) as FacultyCourse[])
    setContributions((contributionsRes.data ?? []) as Contribution[])
    setAuditLogs((auditRes.data ?? []) as AuditLog[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [router])

  const bookMap = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])
  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])
  const facultyRankMap = useMemo(() => new Map(facultyRanks.map((rank) => [rank.id, rank.title])), [facultyRanks])
  const academicCourseMap = useMemo(() => new Map(academicCourses.map((course) => [course.id, course.name])), [academicCourses])
  const facultyCourseMap = useMemo(() => {
    const coursesByFaculty = new Map<string, string[]>()
    facultyCourses.forEach(({ faculty_id, course_id }) => {
      const name = academicCourseMap.get(course_id)
      if (name) coursesByFaculty.set(faculty_id, [...(coursesByFaculty.get(faculty_id) ?? []), name])
    })
    return coursesByFaculty
  }, [facultyCourses, academicCourseMap])
  const filteredBooks = useMemo(() => {
    const digitalBooks = books.filter((book) => book.catalog_type !== 'physical')
    if (!debouncedBookSearch.trim()) return digitalBooks
    const tokens = debouncedBookSearch.toLowerCase().trim().split(/\s+/)
    return digitalBooks.filter((b) =>
      tokens.every(
        (token) =>
          b.title.toLowerCase().includes(token) ||
          b.author.toLowerCase().includes(token) ||
          b.category.toLowerCase().includes(token) ||
          (b.isbn && b.isbn.toLowerCase().includes(token))
      )
    )
  }, [books, debouncedBookSearch])

  // Realtime subscription for incoming borrow requests
  useEffect(() => {
    if (!profile || !isStaffRole(profile.role)) return

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
        student.faculty_rank_id ? facultyRankMap.get(student.faculty_rank_id) : '',
        ...(student.role === 'faculty' ? (facultyCourseMap.get(student.id) ?? []) : []),
      ].filter(Boolean).join(' ').toLowerCase().includes(query)
      const matchesRole = userRoleFilter === 'all' || student.role === userRoleFilter
      const matchesLoanState = userLoanFilter === 'all'
        || (userLoanFilter === 'active' && student.active_loans > 0)
        || (userLoanFilter === 'none' && student.active_loans === 0)
      return matchesQuery && matchesRole && matchesLoanState
    })
  }, [debouncedUserSearch, facultyCourseMap, facultyRankMap, studentDetails, userLoanFilter, userRoleFilter])

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
  const userPageCount = Math.max(1, Math.ceil(filteredStudentDetails.length / 10))
  const visibleStudentDetails = filteredStudentDetails.slice((Math.min(userPage, userPageCount) - 1) * 10, Math.min(userPage, userPageCount) * 10)
  const pendingContributions = contributions.filter((contribution) => contribution.status === 'pending')
  const contributionPageCount = Math.max(1, Math.ceil(pendingContributions.length / 10))
  const visiblePendingContributions = pendingContributions.slice((Math.min(contributionPage, contributionPageCount) - 1) * 10, Math.min(contributionPage, contributionPageCount) * 10)
  const auditPageCount = Math.max(1, Math.ceil(auditLogs.length / 10))
  const visibleAuditLogs = auditLogs.slice((Math.min(auditPage, auditPageCount) - 1) * 10, Math.min(auditPage, auditPageCount) * 10)

  useEffect(() => { setBookPage(1) }, [debouncedBookSearch])
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
      course: member.course ?? '',
      studentYear: member.student_year ?? '',
      facultyRankId: member.faculty_rank_id ? String(member.faculty_rank_id) : '',
      courseIds: facultyCourses.filter((assignment) => assignment.faculty_id === member.id).map((assignment) => String(assignment.course_id)),
    })
    setError(null)
  }

  const saveMemberProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingMember || !memberEditForm) return
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const { error } = await getSupabase().rpc('admin_update_member_academics', {
      target_user_id: editingMember.id,
      new_role: memberEditForm.role,
      new_school: memberEditForm.school.trim() || null,
      new_department: memberEditForm.department.trim() || null,
      new_course: memberEditForm.course.trim() || null,
      new_student_year: memberEditForm.studentYear.trim() || null,
      new_faculty_rank_id: memberEditForm.role === 'faculty' && memberEditForm.facultyRankId ? Number(memberEditForm.facultyRankId) : null,
      new_course_ids: memberEditForm.role === 'faculty' ? memberEditForm.courseIds.map(Number) : [],
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

  const addAcademicCatalogItem = async (kind: 'rank' | 'course' | 'department', event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = (kind === 'rank' ? rankDraft : kind === 'course' ? courseDraft : departmentDraft).trim()
    if (!name) return
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const supabase = getSupabase()
    const { error } = kind === 'rank'
      ? await supabase.from('faculty_ranks').insert({ title: name })
      : kind === 'course'
        ? await supabase.from('academic_courses').insert({ name })
        : await supabase.from('academic_departments').insert({ name })
    if (error) {
      setError(error.code === '23505' ? `That ${kind === 'rank' ? 'title' : kind === 'course' ? 'course' : 'department'} already exists.` : error.message)
    } else {
      if (kind === 'rank') setRankDraft('')
      else if (kind === 'course') setCourseDraft('')
      else setDepartmentDraft('')
      await loadData()
      setActionMessage(`${kind === 'rank' ? 'Faculty title' : kind === 'course' ? 'Course' : 'Department'} added.`)
    }
    setSaving(false)
  }

  const setAcademicCatalogItemActive = async (kind: 'rank' | 'course' | 'department', id: number, isActive: boolean) => {
    setSaving(true)
    setError(null)
    const table = kind === 'rank' ? 'faculty_ranks' : kind === 'course' ? 'academic_courses' : 'academic_departments'
    const { error } = await getSupabase().from(table).update({ is_active: isActive }).eq('id', id)
    if (error) setError(error.message)
    else {
      await loadData()
      setActionMessage(`${kind === 'rank' ? 'Faculty title' : kind === 'course' ? 'Course' : 'Department'} ${isActive ? 'activated' : 'deactivated'}.`)
    }
    setSaving(false)
  }

  const handleContributionReview = async (contributionId: number, decision: 'approved' | 'rejected') => {
    setReviewDialog({ id: contributionId, decision, reward: decision === 'approved' ? '25' : '0', accessPoints: '0' })
  }

  const handleContributionScreen = async (contributionId: number) => {
    setScreeningId(contributionId)
    setError(null)
    setActionMessage(null)
    try {
      const response = await fetch(`/api/admin/contributions/${contributionId}/screen`, { method: 'POST' })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'AI screening failed.')
        return
      }
      setContributions((current) => current.map((item) => item.id === contributionId ? { ...item, ai_screening_result: result } : item))
      setActionMessage('AI screening finished. Its suggestions are advisory; you must make the final decision.')
    } catch (screenError) {
      setError(screenError instanceof Error ? screenError.message : 'AI screening failed.')
    } finally {
      setScreeningId(null)
    }
  }

  const executeContributionReview = async () => {
    if (!reviewDialog) return
    const { id: contributionId, decision } = reviewDialog
    const reward = decision === 'approved' ? Number(reviewDialog.reward) : 0
    const accessPoints = decision === 'approved' ? Number(reviewDialog.accessPoints) : 0
    if (decision === 'approved' && (!Number.isInteger(reward) || reward < 0 || reward > 100)) {
      setError('Reward must be a whole number between 0 and 100 points.')
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
      setError(error.message)
    } else {
      setActionMessage(decision === 'approved' ? `Contribution approved and ${reward} points awarded.` : 'Contribution rejected.')
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

  const handleCreateStudent = async (event: FormEvent<HTMLFormElement>) => {
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
    } else {
      setActionMessage(`Member account created for ${data.email}.`)
      setNewStudent({ email: '', password: '', fullName: '', role: 'student', school: '', department: '', course: '', studentYear: '' })
      await loadData()
    }
    setSaving(false)
  }

  const submitRecognition = async () => {
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const { error } = await getSupabase().rpc('admin_award_recognition', {
      target_user_id: recognitionForm.studentId,
      award_category: recognitionForm.category,
      award_points: Number(recognitionForm.points),
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

  const submitGrantAccess = async () => {
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const { error } = await getSupabase().rpc('admin_grant_book_access', {
      target_user_id: grantForm.studentId,
      target_book_id: Number(grantForm.bookId),
      duration_days: Number(grantForm.duration),
      grant_reason: grantForm.reason,
    })
    if (error) setError(error.message)
    else { setActionMessage('Temporary access granted.'); setGrantForm({ studentId: '', bookId: '', duration: '7', reason: '' }); setQuickAction(null); await loadData() }
    setSaving(false)
  }

  const handleAddBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setActionMessage(null)
    setError(null)

    const supabase = getSupabase()
    let finalPdfUrl = newBook.pdf_url.trim()
    let storageMetadata: Record<string, unknown> = { storage_provider: finalPdfUrl ? 'external' : 'supabase' }

    // If admin selected a PDF file to upload to Supabase Storage
    if (newBookFile) {
      setActionMessage('Uploading e-book to library storage...')
      const formData = new FormData()
      formData.append('file', newBookFile)
      formData.append('category', newBook.category || 'Books')
      formData.append('provider', newBookStorageProvider)
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

    if (newBook.access_mode !== 'free' && /^https?:\/\//i.test(finalPdfUrl)) {
      setError('Paid resources must use a PDF uploaded to protected library storage.')
      setSaving(false)
      return
    }
    const premiumPrice = Number(newBook.premium_price)
    if (newBook.access_mode === 'premium' && (!Number.isFinite(premiumPrice) || premiumPrice <= 0)) {
      setError('Set a premium price greater than zero.')
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
        access_points: Number(newBook.access_costs['7']) || 0,
        access_costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [String(days), Number(newBook.access_costs[String(days)] ?? 0)])),
        access_mode: newBook.access_mode,
        premium_price: newBook.access_mode === 'premium' ? premiumPrice : 0,
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
      setNewBook({ title: '', author: '', category: '', isbn: '', pdf_url: '', access_costs: Object.fromEntries(DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => [days, '0'])) as Record<string, string>, access_mode: 'free', premium_price: '', access_duration_days: '30', description: '' })
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
      formData.append('provider', materialStorageProvider)
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

  const exportLoanReport = () => {
    const rows = requests.map((request) => [
      request.id,
      memberDisplayName(studentMap.get(request.student_id), 'Unknown member'),
      bookMap.get(request.book_id)?.title ?? 'Unknown',
      request.status,
      request.request_date ?? '',
      request.due_date ?? '',
    ])
    const csv = [['Request ID', 'Student', 'Book', 'Status', 'Requested', 'Due'], ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `smart-lib-loans-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const createBackup = async () => {
    setBackupLoading(true)
    setBackupMessage(null)
    try {
      const response = await fetch('/api/admin/backups', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Backup failed.')
      const { backup } = result
      const skipped = backup.skippedTables?.length
        ? ` Incomplete schema: these tables were absent and skipped: ${backup.skippedTables.join(', ')}.`
        : ''
      setBackupMessage(`Backup created: ${backup.fileName} · ${backup.rows} table rows · ${backup.authUsers} user accounts · ${backup.storageObjects + backup.drivePdfs} files.${skipped}`)
    } catch (backupError) {
      setBackupMessage(backupError instanceof Error ? backupError.message : 'Backup failed.')
    } finally {
      setBackupLoading(false)
    }
  }

  return (
    <div className="dashboard-shell admin-shell min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      {sidebarOpen ? <button type="button" className="admin-sidebar-backdrop" aria-label="Close admin navigation" onClick={() => setSidebarOpen(false)} /> : null}
      <div className={`dashboard-layout admin-layout mx-auto max-w-[1500px] ${sidebarCollapsed ? 'dashboard-sidebar-collapsed admin-sidebar-collapsed' : ''}`}>
        <aside id="admin-navigation" className={`dashboard-sidebar admin-sidebar ${sidebarOpen ? 'dashboard-sidebar-open admin-sidebar-open' : ''}`}>
          <div className="mb-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Admin Menu</p>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Control Panel</h2>
          </div>
          <button type="button" className="admin-sidebar-toggle" onClick={() => { if (sidebarOpen) setSidebarOpen(false); else setSidebarCollapsed((current) => !current) }} aria-label={sidebarOpen ? 'Close admin navigation' : sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'} title={sidebarOpen ? 'Close admin navigation' : sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">{sidebarOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg></button>
          <nav className="admin-nav-groups">
            {navGroups.map((group) => <div key={group.label} className="admin-nav-group">
              <p className="admin-nav-group-label">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => <button key={item.section} type="button" onClick={() => { if (item.section === 'physical-requests') setPhysicalRequestsOpen(true); else setSection(item.section); setSidebarOpen(false) }} className={`admin-nav-button w-full text-left rounded-2xl px-4 py-3 text-sm font-medium transition ${section === item.section ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80'}`}><span className="admin-nav-icon"><AdminNavIcon section={item.section} /></span><span>{item.label}</span></button>)}
              </div>
            </div>)}
          </nav>
          <div className="admin-sidebar-footer mt-8 space-y-3">
            <div className="admin-theme-control"><ThemeToggle /></div>
            <button
              type="button"
              onClick={() => router.push('/profile')}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span>Profile</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              <span>Logout</span>
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
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Admin</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Welcome back, {profile?.full_name?.trim() || 'Admin'}</h1>
              </div>
              <div className="rounded-[1.5rem] bg-slate-100 p-4 text-sm font-medium text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                Active role: <span className="font-semibold text-slate-900 dark:text-slate-100">{profile?.role}</span>
              </div>
            </div>
          </header>

          {section === 'overview' && (
            <section className="admin-overview-grid grid items-start gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-6 xl:col-start-1 xl:row-start-1">
              <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Library operations</h2></div>
                  <button type="button" onClick={exportLoanReport} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Export digital loan report</button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setPhysicalRequestsOpen(true)} className="admin-action-tile rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left dark:border-emerald-900/50 dark:bg-emerald-950/20"><span className="text-xs font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Physical requests</span><strong className="mt-2 block text-lg text-emerald-950 dark:text-emerald-100">Open librarian queue</strong><span className="text-xs text-emerald-800/75 dark:text-emerald-300/80">Verify payment and confirm checkout</span></button>
                  <button type="button" onClick={() => setSection('requests')} className="admin-action-tile rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left dark:border-sky-900/50 dark:bg-sky-950/20"><span className="text-xs font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-300">Active digital access</span><strong className="mt-2 block text-2xl text-sky-950 dark:text-sky-100">{activeDigitalAccess.length}</strong><span className="text-xs text-sky-800/75 dark:text-sky-300/80">Granted automatically · view history</span></button>
                </div>
              </div>
              <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Physical borrow requests</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review the newest requests waiting for librarian confirmation.</p></div><button type="button" onClick={() => setPhysicalRequestsOpen(true)} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950">View all requests</button></div>
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-slate-200 uppercase text-slate-500 dark:border-slate-700"><tr><th className="px-2 py-2">Borrower</th><th className="px-2 py-2">Book</th><th className="px-2 py-2">Payment</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Action</th></tr></thead><tbody>{physicalRequestPreview.map((request) => <tr key={request.id} className="border-b border-slate-100 dark:border-slate-800"><td className="px-2 py-3 font-medium">{physicalBorrowerName(request.student_id)}</td><td className="px-2 py-3">{physicalBookTitle(request.book_id)}</td><td className="px-2 py-3 capitalize">{request.payment_method} · ₱{Number(request.fee_amount).toFixed(2)}</td><td className="px-2 py-3 capitalize">{request.status.replace('_', ' ')}<span className="block text-slate-500">{request.payment_status.replace('_', ' ')}</span></td><td className="px-2 py-3"><button type="button" onClick={() => setPhysicalRequestsOpen(true)} className="font-semibold text-emerald-700 hover:underline dark:text-emerald-300">Review</button></td></tr>)}{physicalRequestPreview.length === 0 ? <tr><td colSpan={5} className="px-2 py-6 text-center text-slate-500">No physical borrow requests yet.</td></tr> : null}</tbody></table></div>
              </div>
              </div>
              <div className="space-y-6 xl:col-start-2 xl:row-start-1">
                <div className="rounded-[2rem] border border-sky-200 bg-sky-50/80 p-6 shadow-xl shadow-slate-900/5 dark:border-sky-900/50 dark:bg-sky-950/20">
                  <div className="flex items-start justify-between gap-3">
                    <div><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Quick actions</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Complete common member actions without leaving the dashboard.</p></div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-slate-900 dark:text-sky-300">Admin</span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => setQuickAction('recognition')} className="rounded-2xl bg-slate-900 px-4 py-4 text-left text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"><strong className="block text-sm">Give points</strong><span className="mt-1 block text-xs opacity-75">Recognize a student instantly</span></button>
                    <button type="button" onClick={() => setQuickAction('grant')} className="rounded-2xl border border-sky-200 bg-white px-4 py-4 text-left text-sky-900 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-slate-900 dark:text-sky-200 dark:hover:bg-slate-800"><strong className="block text-sm">Grant access</strong><span className="mt-1 block text-xs opacity-75">Unlock a resource temporarily</span></button>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => setSection('users')} className="rounded-xl border border-sky-200 bg-white/70 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-white dark:border-sky-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800">Manage members</button>
                    <button type="button" onClick={() => setSection('contributions')} className="rounded-xl border border-sky-200 bg-white/70 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-white dark:border-sky-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800">Review contributions</button>
                    <button type="button" onClick={() => { setSection('books'); openPdfAttachment() }} className="rounded-xl border border-sky-200 bg-white/70 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-white dark:border-sky-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800">Manage PDF attachments</button>
                    <button type="button" onClick={() => void createBackup()} disabled={backupLoading} className="rounded-xl border border-sky-200 bg-white/70 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-50 dark:border-sky-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800">{backupLoading ? 'Creating backup...' : 'Create backup'}</button>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => setSection('requests')} className="rounded-xl border border-sky-200 bg-white/70 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-sky-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800">Digital loan history</button><button type="button" onClick={() => setSection('audit')} className="rounded-xl border border-sky-200 bg-white/70 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-sky-800 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-800">View audit log</button></div>
                  {backupMessage ? <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{backupMessage}</p> : null}
                </div>
                {false && <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80"><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Library health</h2><div className="mt-5 space-y-4"><div><div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Digital materials</span><strong className="text-slate-900 dark:text-slate-100">{materials.length} / {books.length || 1}</strong></div><div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, books.length ? materials.length / books.length * 100 : 0)}%` }} /></div></div><div><div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Active access</span><strong className="text-slate-900 dark:text-slate-100">{activeDigitalAccess.length}</strong></div><div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, requests.length ? activeDigitalAccess.length / requests.length * 100 : 0)}%` }} /></div></div></div></div>}
                <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80"><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recent activity</h2><div className="mt-4 space-y-3">{requests.slice(0, 5).map((request) => <div key={`activity-${request.id}`} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 text-sm last:border-0 dark:border-slate-800"><div><p className="font-medium text-slate-800 dark:text-slate-100">{memberDisplayName(studentMap.get(request.student_id), 'Student')} requested {bookMap.get(request.book_id)?.title ?? 'a resource'}</p><p className="mt-1 text-xs text-slate-500">{request.request_date ? new Date(request.request_date).toLocaleDateString() : 'Recently'}</p></div><span className="capitalize text-xs text-slate-500">{request.status}</span></div>)}{requests.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : null}</div></div>
              </div>
            </section>
          )}

          {section === 'analytics' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Library Analytics & Intelligence</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track borrowing velocity, inventory health, fulfillment rates, and storage utilization.</p>
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
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Digital catalog</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage digital and hybrid titles, protected PDFs, access terms, and storage. Physical-only books are managed in the physical catalog.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={bookSearch}
                    onChange={(e) => setBookSearch(e.target.value)}
                    placeholder="Search books by title, author, category..."
                    className="w-64 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  {bookSearch ? (
                    <button
                      type="button"
                      onClick={() => setBookSearch('')}
                      className="rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300"
                    >
                      ✕
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setNewBookOpen(true)} className="pine-action rounded-2xl px-4 py-2 text-xs font-semibold">Add digital title</button>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="overflow-hidden">
                  <table className="w-full table-fixed text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-800/70 dark:text-slate-300">
                      <tr><th className="w-[22%] px-2 py-3 sm:px-4">Title</th><th className="w-[14%] px-2 py-3 sm:px-4">Author</th><th className="w-[14%] px-2 py-3 sm:px-4">Category</th><th className="w-[10%] px-2 py-3 sm:px-4">Format</th><th className="w-[17%] px-2 py-3 sm:px-4">Access cost</th><th className="w-[10%] px-2 py-3 sm:px-4">File</th><th className="w-[23%] px-2 py-3 sm:px-4">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {visibleBooks.map((book) => <Fragment key={book.id}>
                        <tr className="bg-white align-top dark:bg-slate-900">
                          <td className="px-4 py-4"><p className="font-semibold text-slate-900 dark:text-slate-100">{book.title}</p><p className="mt-1 text-xs text-slate-500">ISBN: {book.isbn || 'N/A'}</p></td>
                          <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{book.author}</td>
                          <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{book.category}</td>
                          <td className="px-4 py-4 capitalize text-slate-600 dark:text-slate-300">{book.catalog_type}</td>
                          <td className="px-4 py-4"><span className="font-medium text-slate-900 dark:text-slate-100">{book.access_mode === 'premium' ? `Premium · ₱${Number(book.premium_price).toFixed(2)}` : book.access_mode === 'points' ? 'Points' : 'Free'}</span>{book.access_mode === 'points' ? <span className="mt-1 block text-xs text-slate-500">{DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => `${days}d: ${book.access_costs?.[String(days) as keyof DigitalAccessCosts] ?? getDigitalAccessCost(book.access_points, days)} pts`).join(' · ')}</span> : book.access_mode === 'premium' ? <span className="mt-1 block text-xs text-slate-500">Staff verifies payment before permanent access.</span> : null}</td>
                          <td className="px-4 py-4">{book.pdf_url || book.storage_file_id || book.storage_path ? <span className="rounded-md bg-pine-100 px-2 py-1 text-[10px] font-bold text-pine-700 dark:bg-forest-700 dark:text-pine-200">{book.storage_provider === 'google_drive' ? 'Drive' : book.storage_provider === 'external' ? 'External' : 'PDF ready'}</span> : <span className="text-xs text-slate-400">Missing</span>}</td>
                          <td className="px-4 py-4"><div className="flex flex-wrap gap-2">{book.pdf_url || book.storage_path ? <a href={`/reader/${book.id}`} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30">Open reader</a> : null}<button type="button" disabled={saving} onClick={() => openPdfAttachment(book.id)} className="rounded-xl border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950/30">{book.pdf_url || book.storage_path ? 'Replace PDF' : 'Attach PDF'}</button><button type="button" disabled={saving} onClick={() => startBookAccessEdit(book)} className="pine-action rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50">Edit access</button><button type="button" disabled={saving} onClick={() => handleDeleteBook(book.id, book.title)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40">Delete</button></div></td>
                        </tr>
                        {editingBookId === book.id ? <tr className="bg-paper-50/70 dark:bg-forest-800/40"><td colSpan={7} className="px-4 py-4"><form onSubmit={(event) => void saveBookAccessEdit(event, book)}><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Edit access settings for {book.title}</p><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-7"><label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Mode<select value={bookAccessDraft.mode} onChange={(event) => setBookAccessDraft((current) => ({ ...current, mode: event.target.value as typeof current.mode }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-normal dark:border-slate-700 dark:bg-slate-900"><option value="free">Free</option><option value="points">Points</option><option value="premium">Premium</option></select></label><label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Premium price (₱)<input type="number" min="0.01" step="0.01" value={bookAccessDraft.premiumPrice} onChange={(event) => setBookAccessDraft((current) => ({ ...current, premiumPrice: event.target.value }))} disabled={bookAccessDraft.mode !== 'premium'} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-normal disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900" /></label>{DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => <label key={days} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{days} {days === 1 ? 'day' : 'days'}<input type="number" min="0" step="1" value={bookAccessDraft.costs[String(days)] ?? '0'} onChange={(event) => setBookAccessDraft((current) => ({ ...current, costs: { ...current.costs, [days]: event.target.value } }))} disabled={bookAccessDraft.mode !== 'points'} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-normal disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900" /></label>)}</div><div className="mt-3 flex gap-2"><button type="submit" disabled={saving} className="pine-action rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50">{saving ? 'Saving...' : 'Save access'}</button><button type="button" onClick={() => setEditingBookId(null)} className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold">Cancel</button></div></form></td></tr> : null}
                      </Fragment>) }
                      {filteredBooks.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-300">No matching books found.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
                <ListPagination page={Math.min(bookPage, bookPageCount)} pageCount={bookPageCount} total={filteredBooks.length} onPageChange={setBookPage} />
              </div>

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
                  <fieldset className="sm:col-span-2">
                    <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Points per access period</legend>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {DIGITAL_ACCESS_DURATION_OPTIONS.map((days) => <label key={days} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{days} {days === 1 ? 'day' : 'days'}
                        <input type="number" min="0" step="1" value={newBook.access_costs[String(days)] ?? '0'} onChange={(event) => setNewBook({ ...newBook, access_costs: { ...newBook.access_costs, [days]: event.target.value } })} disabled={newBook.access_mode === 'free'} required className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900" />
                      </label>)}
                    </div>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Set a separate cost for each supported access period. Free access ignores these values.</span>
                  </fieldset>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Access mode</span>
                    <select
                      value={newBook.access_mode}
                      onChange={(event) => setNewBook({ ...newBook, access_mode: event.target.value as typeof newBook.access_mode })}
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="free">Free access</option>
                      <option value="points">Points-based access</option>
                      <option value="premium">Premium paid access</option>
                    </select>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Free and points access unlock immediately. Premium access requires the member to submit payment evidence for staff verification.</span>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Premium price (₱)</span>
                    <input type="number" min="0.01" step="0.01" value={newBook.premium_price} onChange={(event) => setNewBook({ ...newBook, premium_price: event.target.value })} disabled={newBook.access_mode !== 'premium'} required={newBook.access_mode === 'premium'} className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Premium purchases grant permanent access after staff verifies payment.</span>
                  </label>
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
                    value={newBook.isbn}
                    onChange={(event) => setNewBook({ ...newBook, isbn: event.target.value })}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <div className="mt-4">
                  <EbookUploader
                    onFileSelected={(file) => setNewBookFile(file)}
                    onUrlEntered={(url) => setNewBook((prev) => ({ ...prev, pdf_url: url }))}
                    currentValue={newBook.pdf_url}
                    disabled={saving}
                  />
                  <label className="mt-3 block max-w-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Storage provider</span>
                    <select value={newBookStorageProvider} onChange={(event) => setNewBookStorageProvider(event.target.value as typeof newBookStorageProvider)} disabled={saving} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
                      <option value="supabase">Supabase Storage</option>
                      <option value="google_drive">Google Drive</option>
                    </select>
                  </label>
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
                  <div className="mt-5"><EbookUploader onFileSelected={(file) => setMaterialFile(file)} onUrlEntered={(url) => setPdfUrl(url)} currentValue={pdfUrl} disabled={saving} allowExternalUrl={false} /><label className="mt-3 block"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Storage provider</span><select value={materialStorageProvider} onChange={(event) => setMaterialStorageProvider(event.target.value as typeof materialStorageProvider)} disabled={saving} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="supabase">Supabase Storage</option><option value="google_drive">Google Drive</option></select></label></div>
                  <button type="submit" disabled={saving} className="mt-6 w-full rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{saving ? 'Uploading and attaching...' : 'Attach PDF'}</button>
                </form>
              </div> : null}
            </section>
          )}

          {section === 'physical' && <PhysicalCirculationAdminPage />}
          {section === 'physical-requests' && <PhysicalCirculationAdminPage initialPanel="requests" />}
          {physicalRequestsOpen && <PhysicalCirculationAdminPage initialPanel="requests" requestsOnly onClose={() => setPhysicalRequestsOpen(false)} />}

          {section === 'requests' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Digital loan history</h2>
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
                <div>
                  <table className="w-full table-fixed divide-y divide-slate-200 text-left text-xs sm:text-sm dark:divide-slate-700">
                    <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300"><tr><th className="w-[30%] px-2 py-3 font-semibold sm:px-3">Member / book</th><th className="w-[34%] px-2 py-3 font-semibold sm:px-3">Timeline</th><th className="w-[19%] px-2 py-3 font-semibold sm:px-3">Loan</th><th className="w-[17%] px-2 py-3 font-semibold sm:px-3">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {visibleDigitalLoanHistory.map((loan) => {
                        const request = requests.find((item) => item.id === loan.borrow_request_id)
                        const active = request ? isActiveDigitalAccess(request) : false
                        return <tr key={loan.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/80">
                          <td className="break-words px-2 py-3 text-slate-800 dark:text-slate-100 sm:px-3"><span className="block font-medium">{memberDisplayName(studentMap.get(loan.student_id))}</span><span className="mt-1 block text-slate-600 dark:text-slate-300">{bookMap.get(loan.book_id)?.title ?? 'Unknown book'}</span></td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block">Requested · {new Date(loan.requested_at).toLocaleDateString()}</span><span className="block">Borrowed · {loan.borrowed_at ? new Date(loan.borrowed_at).toLocaleDateString() : '—'}</span><span className="block">Due · {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '—'}{loan.returned_at ? ` · Returned ${new Date(loan.returned_at).toLocaleDateString()}` : ''}</span></td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block">{loan.duration_days} days</span><span className="block">{loan.renewal_count} renewals · {loan.points_cost} pts</span></td>
                          <td className="break-words px-2 py-3 text-slate-600 dark:text-slate-300 sm:px-3"><span className="block capitalize">{loan.status.replace('_', ' ')}</span>{active && request ? <button type="button" disabled={saving} onClick={() => handleRevoke(request.id)} className="mt-2 rounded-lg border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300">Revoke</button> : null}</td>
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
                    formData.append('provider', materialStorageProvider)
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
                    <label className="mt-3 block max-w-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">2. Choose where to store the PDF</span>
                      <select value={materialStorageProvider} onChange={(event) => setMaterialStorageProvider(event.target.value as typeof materialStorageProvider)} disabled={saving} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
                        <option value="supabase">Supabase Storage</option>
                        <option value="google_drive">Google Drive</option>
                      </select>
                      <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Google Drive uses your connected Drive account. Supabase Storage keeps the file inside this project.</span>
                    </label>
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

          {section === 'backups' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Data backups</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                Create a compressed snapshot in the configured Google Drive backup folder whenever needed. Backups are never automatically deleted.
              </p>
              <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
                Snapshots include application database rows, account identity/profile metadata, and Supabase Storage files. Passwords and active sessions are not exportable. Restrict access to the Drive backup folder and verify restores in an isolated Supabase project.
              </div>
              {backupMessage ? <p role="status" className="mt-4 break-words text-sm text-slate-700 dark:text-slate-200">{backupMessage}</p> : null}
              <button type="button" onClick={() => void createBackup()} disabled={backupLoading} className="pine-action mt-5 rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50">
                {backupLoading ? 'Creating backup…' : 'Create backup now'}
              </button>
            </section>
          )}

          {section === 'contributions' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Community contributions</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">AI screening is advisory only. Check the submitted PDF and make the final approval decision yourself.</p>
              </div>
              <div className="space-y-3">
                {pendingContributions.length > 0 ? visiblePendingContributions.map((contribution) => (
                  <article key={contribution.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{contribution.title}</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">by {contribution.author} · from {memberDisplayName(students.find((student) => student.id === contribution.user_id), 'Unknown student')}</p>
                        {contribution.description ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{contribution.description}</p> : null}
                        {(contribution.pdf_url || contribution.storage_file_id || contribution.storage_path) ? <a href={`/api/contributions/${contribution.id}/file`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-sky-600 hover:underline dark:text-sky-300">Open submitted PDF</a> : null}
                        {contribution.ai_screening_result ? <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-900/50 dark:bg-sky-950/20">
                          <p className="font-semibold text-sky-900 dark:text-sky-200">Gemini screening · {contribution.ai_screening_result.relevance_score}/100 · {contribution.ai_screening_result.recommendation}</p>
                          <p className="mt-1 text-slate-700 dark:text-slate-300">{contribution.ai_screening_result.summary}</p>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{contribution.ai_screening_result.usefulness}</p>
                          {contribution.ai_screening_result.concerns.length ? <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 dark:text-amber-300">{contribution.ai_screening_result.concerns.map((concern, index) => <li key={index}>{concern}</li>)}</ul> : null}
                          <p className="mt-2 text-xs font-semibold text-sky-800 dark:text-sky-300">Always requires human review. AI does not verify copyright or authorship.</p>
                        </div> : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" disabled={saving || screeningId !== null} onClick={() => void handleContributionScreen(contribution.id)} className="rounded-xl border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-700 disabled:opacity-50 dark:border-sky-900/50 dark:text-sky-300">{screeningId === contribution.id ? 'Screening...' : contribution.ai_screening_result ? 'Screen again' : 'Screen with Gemini'}</button>
                        <button type="button" disabled={saving} onClick={() => void handleContributionRevision(contribution.id)} className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50 dark:border-amber-900/50 dark:text-amber-300">Request revision</button>
                        <button type="button" disabled={saving} onClick={() => void handleContributionReview(contribution.id, 'rejected')} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-300">Reject</button>
                        <button type="button" disabled={saving} onClick={() => void handleContributionReview(contribution.id, 'approved')} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Approve</button>
                      </div>
                    </div>
                  </article>
                )) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">No pending contributions.</div>
                )}
              </div>
              <ListPagination page={Math.min(contributionPage, contributionPageCount)} pageCount={contributionPageCount} total={pendingContributions.length} onPageChange={setContributionPage} />
            </section>
          )}

          {section === 'users' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Member management</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage student and faculty accounts, academic details, and loan activity.</p>
              </div>
              <div className="mb-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setMemberToolModal('createMember')} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Create member account</button>
                <button type="button" onClick={() => setMemberToolModal('catalogs')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Manage academic catalogs</button>
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_10rem_12rem_auto]">
                <input type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search name, email, school, or program..." aria-label="Search members" className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                <select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value as typeof userRoleFilter)} aria-label="Filter members by role" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="all">All roles</option><option value="student">Students</option><option value="faculty">Faculty</option><option value="librarian">Librarians</option></select>
                <select value={userLoanFilter} onChange={(event) => setUserLoanFilter(event.target.value as typeof userLoanFilter)} aria-label="Filter members by digital access" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="all">Any loan activity</option><option value="active">Has active loans</option><option value="none">No active loans</option></select>
                <p className="self-center text-xs text-slate-500 dark:text-slate-400">{filteredStudentDetails.length} of {studentDetails.length} members</p>
              </div>
              {memberToolModal === 'catalogs' ? <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setMemberToolModal(null) }}><section className="my-6 w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="academic-catalogs-title">
                <div className="flex items-start justify-between gap-4"><div><h3 id="academic-catalogs-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Academic catalogs</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage faculty titles, courses, and departments.</p></div><button type="button" disabled={saving} onClick={() => setMemberToolModal(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">Close</button></div>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Faculty titles and ranks</h3>
                  <form onSubmit={(event) => void addAcademicCatalogItem('rank', event)} className="mt-3 flex gap-2">
                    <input required maxLength={100} value={rankDraft} onChange={(event) => setRankDraft(event.target.value)} placeholder="e.g. Lecturer" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Add title</button>
                  </form>
                  <ul className="mt-3 space-y-2">
                    {facultyRanks.map((rank) => <li key={rank.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-900"><span className={rank.is_active ? '' : 'text-slate-400 line-through'}>{rank.title}{rank.is_active ? '' : ' (inactive)'}</span><button type="button" disabled={saving} onClick={() => void setAcademicCatalogItemActive('rank', rank.id, !rank.is_active)} className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">{rank.is_active ? 'Deactivate' : 'Reactivate'}</button></li>)}
                    {facultyRanks.length === 0 ? <li className="text-sm text-slate-500">No titles added yet.</li> : null}
                  </ul>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Courses and programs</h3>
                  <form onSubmit={(event) => void addAcademicCatalogItem('course', event)} className="mt-3 flex gap-2">
                    <input required maxLength={120} value={courseDraft} onChange={(event) => setCourseDraft(event.target.value)} placeholder="e.g. Computer Science" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Add course</button>
                  </form>
                  <ul className="mt-3 space-y-2">
                    {academicCourses.map((course) => <li key={course.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-900"><span className={course.is_active ? '' : 'text-slate-400 line-through'}>{course.name}{course.is_active ? '' : ' (inactive)'}</span><button type="button" disabled={saving} onClick={() => void setAcademicCatalogItemActive('course', course.id, !course.is_active)} className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">{course.is_active ? 'Deactivate' : 'Reactivate'}</button></li>)}
                    {academicCourses.length === 0 ? <li className="text-sm text-slate-500">No courses added yet.</li> : null}
                  </ul>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Departments</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Active departments are shown as choices when faculty members register.</p>
                  <form onSubmit={(event) => void addAcademicCatalogItem('department', event)} className="mt-3 flex gap-2">
                    <input required maxLength={120} value={departmentDraft} onChange={(event) => setDepartmentDraft(event.target.value)} placeholder="e.g. Computer Science" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
                    <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Add department</button>
                  </form>
                  <ul className="mt-3 space-y-2">
                    {academicDepartments.map((department) => <li key={department.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm dark:bg-slate-900"><span className={department.is_active ? '' : 'text-slate-400 line-through'}>{department.name}{department.is_active ? '' : ' (inactive)'}</span><button type="button" disabled={saving} onClick={() => void setAcademicCatalogItemActive('department', department.id, !department.is_active)} className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">{department.is_active ? 'Deactivate' : 'Reactivate'}</button></li>)}
                    {academicDepartments.length === 0 ? <li className="text-sm text-slate-500">No departments added yet.</li> : null}
                  </ul>
                </section>
              </div></section></div> : null}
              {memberToolModal === 'createMember' ? <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setMemberToolModal(null) }}><section className="my-6 w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="create-member-title"><div className="flex items-start justify-between gap-4"><div><h3 id="create-member-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Create member account</h3><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create a student or faculty account that can sign in immediately.</p></div><button type="button" disabled={saving} onClick={() => setMemberToolModal(null)} className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">Close</button></div>
              <form onSubmit={async (event) => { await handleCreateStudent(event); setMemberToolModal(null) }} className="mt-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <input type="text" maxLength={120} value={newStudent.fullName} onChange={(event) => setNewStudent({ ...newStudent, fullName: event.target.value })} placeholder="Full name" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input type="email" required value={newStudent.email} onChange={(event) => setNewStudent({ ...newStudent, email: event.target.value })} placeholder="member@example.com" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <PasswordInput required minLength={8} value={newStudent.password} onChange={(event) => setNewStudent({ ...newStudent, password: event.target.value })} placeholder="Temporary password" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <select value={newStudent.role} onChange={(event) => setNewStudent({ ...newStudent, role: event.target.value as 'student' | 'faculty' | 'librarian', department: '' })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                    <option value="librarian">Librarian</option>
                  </select>
                  <input maxLength={120} value={newStudent.school} onChange={(event) => setNewStudent({ ...newStudent, school: event.target.value })} placeholder="School or college" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <select required={newStudent.role === 'faculty'} value={newStudent.department} onChange={(event) => setNewStudent({ ...newStudent, department: event.target.value })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="">Department{newStudent.role === 'faculty' ? ' (required)' : ' (optional)'}</option>
                    {academicDepartments.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                  </select>
                  <input maxLength={120} value={newStudent.course} onChange={(event) => setNewStudent({ ...newStudent, course: event.target.value })} placeholder="Course or program (students)" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input maxLength={40} value={newStudent.studentYear} onChange={(event) => setNewStudent({ ...newStudent, studentYear: event.target.value })} placeholder="Year level (students)" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
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
                      <th className="px-4 py-3 font-semibold">School / department</th>
                      <th className="px-4 py-3 font-semibold">Program / teaching</th>
                      <th className="px-4 py-3 font-semibold">Title / year</th>
                      <th className="px-4 py-3 font-semibold">Points</th>
                      <th className="px-4 py-3 font-semibold">Active loans</th>
                      <th className="px-4 py-3 font-semibold">Joined</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {visibleStudentDetails.map((student) => (
                      <tr key={student.id} tabIndex={0} onClick={() => setSelectedMember(student)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedMember(student) } }} className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-800/80 dark:focus:bg-slate-800/80">
                        <td className="px-4 py-4 text-slate-800 dark:text-slate-100"><span className="block font-medium">{memberDisplayName(student, '—')}</span><span className="text-xs capitalize text-slate-500">{student.role}</span></td>
                        <td className="max-w-[220px] break-all px-4 py-4 text-slate-600 dark:text-slate-300">{student.email || '—'}</td>
                        <td className="px-4 py-4 capitalize text-slate-600 dark:text-slate-300">{student.role}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{[student.school, student.department].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.role === 'faculty' ? (facultyCourseMap.get(student.id)?.join(', ') || '—') : (student.course || '—')}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.role === 'faculty' ? (student.faculty_rank_id ? facultyRankMap.get(student.faculty_rank_id) || '—' : '—') : (student.student_year || '—')}</td>
                        <td className="px-4 py-4 font-semibold text-slate-700 dark:text-slate-200">{Number(student.points_balance ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.active_loans}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-slate-600 dark:text-slate-300">{student.created_at ? new Date(student.created_at).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => { setRecognitionForm((current) => ({ ...current, studentId: student.id })); setQuickAction('recognition') }} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">Give points</button><button type="button" disabled={saving} onClick={() => openMemberEditor(student)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800">Edit profile</button>{profile?.role === 'admin' && (student.role === 'student' || student.role === 'faculty') ? <button type="button" disabled={saving} onClick={() => setConfirmAction({ type: 'deleteMember', id: student.id, label: memberDisplayName(student, student.email) })} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/30">Delete account</button> : null}</div></td>
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
          <section className="my-6 w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="member-details-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">Member profile</p>
                <h2 id="member-details-title" className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{memberDisplayName(selectedMember, 'Member')}</h2>
                <p className="mt-1 break-all text-sm text-slate-500 dark:text-slate-400">{selectedMember.email}</p>
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
              <section><h3 className="font-semibold text-slate-900 dark:text-slate-100">Profile and academics</h3><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">School</dt><dd className="font-medium">{selectedMember.school || '-'}</dd></div><div><dt className="text-slate-500">Department</dt><dd className="font-medium">{selectedMember.department || '-'}</dd></div><div><dt className="text-slate-500">Course / program</dt><dd className="font-medium">{selectedMember.course || '-'}</dd></div><div><dt className="text-slate-500">Year level</dt><dd className="font-medium">{selectedMember.student_year || '-'}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">Faculty title / courses</dt><dd className="font-medium">{selectedMember.role === 'faculty' ? [selectedMember.faculty_rank_id ? facultyRankMap.get(selectedMember.faculty_rank_id) : '', ...(facultyCourseMap.get(selectedMember.id) ?? [])].filter(Boolean).join(' · ') || '-' : 'Not applicable'}</dd></div></dl></section>
              <section><h3 className="font-semibold text-slate-900 dark:text-slate-100">Account activity</h3><div className="mt-3 space-y-2 text-sm"><p>{digitalLoanHistory.filter((loan) => loan.student_id === selectedMember.id).length} digital loan record(s)</p><p>{physicalRequestPreview.filter((request) => request.student_id === selectedMember.id).length} recent physical request(s)</p><p>{contributions.filter((contribution) => contribution.user_id === selectedMember.id).length} contribution(s)</p></div></section>
            </div>
            <section className="mt-6"><h3 className="font-semibold text-slate-900 dark:text-slate-100">Recent digital loans</h3><div className="mt-3 space-y-2">{digitalLoanHistory.filter((loan) => loan.student_id === selectedMember.id).slice(0, 5).map((loan) => <div key={loan.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><span>{bookMap.get(loan.book_id)?.title ?? 'Unknown resource'}</span><span className="text-xs capitalize text-slate-500">{loan.status.replace('_', ' ')} · {loan.points_cost} points</span></div>)}{digitalLoanHistory.every((loan) => loan.student_id !== selectedMember.id) ? <p className="text-sm text-slate-500">No digital loan history.</p> : null}</div></section>
            <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { setSelectedMember(null); openMemberEditor(selectedMember) }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Edit profile</button>{profile?.role === 'admin' && (selectedMember.role === 'student' || selectedMember.role === 'faculty') ? <button type="button" onClick={() => { setSelectedMember(null); setConfirmAction({ type: 'deleteMember', id: selectedMember.id, label: memberDisplayName(selectedMember, selectedMember.email) }) }} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white">Delete account</button> : null}</div>
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
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Student
                  <select required value={recognitionForm.studentId} onChange={(event) => setRecognitionForm({ ...recognitionForm, studentId: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"><option value="">Select a student</option>{students.map((student) => <option key={student.id} value={student.id}>{memberDisplayName(student)}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Points
              <input required type="number" min="1" max="100" value={recognitionForm.points} onChange={(event) => setRecognitionForm({ ...recognitionForm, points: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Category
              <select value={recognitionForm.category} onChange={(event) => setRecognitionForm({ ...recognitionForm, category: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"><option value="academic_assistance">Academic assistance</option><option value="community_contribution">Community contribution</option><option value="volunteer_work">Volunteer work</option><option value="academic_achievement">Academic achievement</option><option value="special_recognition">Special recognition</option></select>
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Reason
              <textarea required maxLength={500} value={recognitionForm.reason} onChange={(event) => setRecognitionForm({ ...recognitionForm, reason: event.target.value })} rows={3} placeholder="What did the student do?" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
            </label>
          </div>
        </ActionModal>
        <ActionModal
          open={quickAction === 'grant'}
          title="Grant temporary access"
          description="Give a member access to a protected digital resource without charging points."
          confirmLabel="Grant access"
          busy={saving}
          onClose={() => { if (!saving) setQuickAction(null) }}
          onConfirm={() => {
            if (!grantForm.studentId || !grantForm.bookId || !grantForm.reason.trim()) {
              setError('Choose a student, resource, and reason before granting access.')
              return
            }
            void submitGrantAccess()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Student
                  <select required value={grantForm.studentId} onChange={(event) => setGrantForm({ ...grantForm, studentId: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"><option value="">Select a student</option>{students.map((student) => <option key={student.id} value={student.id}>{memberDisplayName(student)}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Resource
              <select required value={grantForm.bookId} onChange={(event) => setGrantForm({ ...grantForm, bookId: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950"><option value="">Select a book</option>{books.filter((book) => book.pdf_url).map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Duration (days)
              <input required type="number" min="1" max="365" value={grantForm.duration} onChange={(event) => setGrantForm({ ...grantForm, duration: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">Reason
              <textarea required maxLength={500} value={grantForm.reason} onChange={(event) => setGrantForm({ ...grantForm, reason: event.target.value })} rows={3} placeholder="Why is this access being granted?" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
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
                  <label className="block text-sm font-medium">School / college<input maxLength={120} value={memberEditForm.school} onChange={(event) => setMemberEditForm({ ...memberEditForm, school: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                  <label className="block text-sm font-medium">Department<input maxLength={120} value={memberEditForm.department} onChange={(event) => setMemberEditForm({ ...memberEditForm, department: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                  {memberEditForm.role === 'student' ? <>
                    <label className="block text-sm font-medium">Course / program
                      <select value={memberEditForm.course} onChange={(event) => setMemberEditForm({ ...memberEditForm, course: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                        <option value="">Select a course</option>
                        {memberEditForm.course && !academicCourses.some((item) => item.name === memberEditForm.course) ? <option value={memberEditForm.course}>{memberEditForm.course} (current)</option> : null}
                        {academicCourses.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-medium">Year level<input maxLength={40} value={memberEditForm.studentYear} onChange={(event) => setMemberEditForm({ ...memberEditForm, studentYear: event.target.value })} placeholder="e.g. 2nd year" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                  </> : <>
                    <label className="block text-sm font-medium sm:col-span-2">Academic title / rank
                      <select value={memberEditForm.facultyRankId} onChange={(event) => setMemberEditForm({ ...memberEditForm, facultyRankId: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                        <option value="">No title selected</option>
                        {facultyRanks.filter((rank) => rank.is_active || String(rank.id) === memberEditForm.facultyRankId).map((rank) => <option key={rank.id} value={rank.id}>{rank.title}{rank.is_active ? '' : ' (inactive)'}</option>)}
                      </select>
                    </label>
                    <fieldset className="sm:col-span-2">
                      <legend className="text-sm font-medium">Courses taught</legend>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {academicCourses.filter((item) => item.is_active || memberEditForm.courseIds.includes(String(item.id))).map((item) => (
                          <label key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                            <input type="checkbox" checked={memberEditForm.courseIds.includes(String(item.id))} onChange={(event) => setMemberEditForm({
                              ...memberEditForm,
                              courseIds: event.target.checked
                                ? [...memberEditForm.courseIds, String(item.id)]
                                : memberEditForm.courseIds.filter((id) => id !== String(item.id)),
                            })} />
                            {item.name}{item.is_active ? '' : ' (inactive)'}
                          </label>
                        ))}
                        {academicCourses.length === 0 ? <p className="text-sm text-slate-500">Add courses to the catalog before assigning them to faculty.</p> : null}
                      </div>
                    </fieldset>
                  </>}
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
          open={confirmAction?.type === 'deleteBook'}
          title="Remove this book?"
          description={confirmAction?.label ? `“${confirmAction.label}” will be removed from the catalog.` : undefined}
          confirmLabel="Remove book"
          tone="danger"
          busy={saving}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => { if (confirmAction?.type === 'deleteBook') void executeDeleteBook(confirmAction.id, confirmAction.label ?? 'Book') }}
        />
        <ResultModal
          open={Boolean(error || (actionMessage && !actionMessage.startsWith('Uploading')))}
          status={error ? 'error' : 'success'}
          message={error || actionMessage || ''}
          onClose={() => { setError(null); setActionMessage(null) }}
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
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Reward points<input type="number" min="0" max="100" value={reviewDialog.reward} onChange={(event) => setReviewDialog({ ...reviewDialog, reward: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Access cost / 7 days<input type="number" min="0" value={reviewDialog.accessPoints} onChange={(event) => setReviewDialog({ ...reviewDialog, accessPoints: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
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
