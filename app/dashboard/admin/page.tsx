'use client'

export const dynamic = 'force-dynamic'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import ThemeToggle from '@/components/ThemeToggle'
import BrandLogo from '@/components/BrandLogo'
import EbookUploader from '@/components/EbookUploader'
import AdminAnalytics from '@/components/AdminAnalytics'
import ActionModal from '@/components/ActionModal'
import PasswordInput from '@/components/PasswordInput'
import { AdminDashboardSkeleton } from '@/components/skeletons'
import { useDebounce } from '@/utils/useDebounce'

const navGroups = [
  { label: 'Operations', items: [{ label: 'Overview', section: 'overview' }, { label: 'Requests', section: 'requests' }, { label: 'Users', section: 'users' }] },
  { label: 'Library', items: [{ label: 'Books', section: 'books' }, { label: 'PDF materials', section: 'materials' }, { label: 'Contributions', section: 'contributions' }] },
  { label: 'Insights & points', items: [{ label: 'Analytics', section: 'analytics' }, { label: 'Recognition', section: 'recognition' }, { label: 'Rewards', section: 'rewards' }, { label: 'Access grants', section: 'grants' }, { label: 'Audit log', section: 'audit' }] },
]

type Book = {
  id: number
  title: string
  author: string
  isbn: string | null
  category: string
  description: string | null
  pdf_url: string | null
  storage_provider?: string | null
  storage_file_id?: string | null
  storage_path?: string | null
  access_points: number
  access_mode: 'free' | 'points' | 'restricted' | 'premium'
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

type Profile = {
  id: string
  email: string
  role: string
  created_at: string | null
  full_name?: string | null
  school?: string | null
  department?: string | null
  course?: string | null
  student_year?: string | null
  faculty_rank_id?: number | null
}

type FacultyRank = { id: number; title: string; is_active: boolean }
type AcademicCourse = { id: number; name: string; is_active: boolean }
type FacultyCourse = { faculty_id: string; course_id: number }
type MemberEditForm = {
  role: 'student' | 'faculty'
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
type AccessGrant = { id: number; student_id: string; book_id: number; access_type: string; expires_at: string | null; status: string; reason: string | null }
type Reward = { id: number; name: string; description: string | null; points_cost: number; reward_type: string; stock: number | null; is_active: boolean }
type AdminConfirm = { type: 'deleteBook' | 'revokeLoan' | 'revokeGrant'; id: number; label?: string } | null

function AdminNavIcon({ section }: { section: string }) {
  const paths: Record<string, React.ReactNode> = {
    overview: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    analytics: <><path d="M18 20V10M12 20V4M6 20v-6" /></>,
    books: <><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" /><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19M9 7h6M9 10h4" /></>,
    requests: <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a2.5 2.5 0 1 0 0-5M16 14a5 5 0 0 1 4.5 6" /></>,
    materials: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    recognition: <><path d="M12 3 14 8l5 .5-3.8 3.3 1.2 5.2-4.4-2.8-4.4 2.8 1.2-5.2L5 8.5 10 8z" /></>,
  }

  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[section]}</svg>
}

export default function AdminPage() {
  const router = useRouter()
  const [section, setSection] = useState('overview')
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [facultyRanks, setFacultyRanks] = useState<FacultyRank[]>([])
  const [academicCourses, setAcademicCourses] = useState<AcademicCourse[]>([])
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
    access_points: '0',
    access_mode: 'free' as 'free' | 'points' | 'restricted',
    access_duration_days: '30',
    description: '',
  })
  const [pdfBookId, setPdfBookId] = useState<number | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [newBookFile, setNewBookFile] = useState<File | null>(null)
  const [newBookStorageProvider, setNewBookStorageProvider] = useState<'google_drive' | 'supabase'>('supabase')
  const [materialFile, setMaterialFile] = useState<File | null>(null)
  const [materialStorageProvider, setMaterialStorageProvider] = useState<'google_drive' | 'supabase'>('supabase')
  const [bookSearch, setBookSearch] = useState('')
  const debouncedBookSearch = useDebounce(bookSearch, 200)
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'revoked'>('all')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({ email: '', password: '', fullName: '', role: 'student' as 'student' | 'faculty', school: '', department: '', course: '', studentYear: '' })
  const [recognitionForm, setRecognitionForm] = useState({ studentId: '', category: 'academic_assistance', points: '10', reason: '' })
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([])
  const [grantForm, setGrantForm] = useState({ studentId: '', bookId: '', duration: '7', reason: '' })
  const [rewards, setRewards] = useState<Reward[]>([])
  const [rewardForm, setRewardForm] = useState({ name: '', description: '', cost: '50', type: 'profile_badge', stock: '' })
  const [confirmAction, setConfirmAction] = useState<AdminConfirm>(null)
  const [reviewDialog, setReviewDialog] = useState<{ id: number; decision: 'approved' | 'rejected'; reward: string; accessPoints: string } | null>(null)
  const [revisionDialog, setRevisionDialog] = useState<{ id: number; feedback: string } | null>(null)
  const [editingMember, setEditingMember] = useState<Profile | null>(null)
  const [memberEditForm, setMemberEditForm] = useState<MemberEditForm | null>(null)
  const [rankDraft, setRankDraft] = useState('')
  const [courseDraft, setCourseDraft] = useState('')

  const handleDeleteBook = async (bookId: number, title: string) => {
    setConfirmAction({ type: 'deleteBook', id: bookId, label: title })
  }

  const executeDeleteBook = async (bookId: number, title: string) => {
    setSaving(true)
    setError(null)
    const supabase = getSupabase()
    const { error: delError } = await supabase.from('books').delete().eq('id', bookId)
    if (delError) {
      setError(delError.message)
    } else {
      setActionMessage(`"${title}" was removed from the catalog.`)
      await loadData()
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
      .select('role, email')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (profileError) {
      setError(`Unable to load your profile. Apply the Supabase profile policies, then try again. (${profileError.message})`)
      setLoading(false)
      return
    }

    const role = profileData?.role ? String(profileData.role).trim().toLowerCase() : ''
    const email = profileData?.email ?? currentUser.email

    if (role !== 'admin') {
      if (role === 'student' || role === 'faculty') {
        router.replace('/dashboard/student')
      } else {
        router.replace('/dashboard')
      }
      return
    }

    setProfile({ email: email ?? '', role })

    const isMissingTableError = (error: { code?: string; message?: string } | null) =>
      Boolean(error && (error.code === '42P01' || /relation .* does not exist/i.test(error.message ?? '')))

    const [booksRes, requestsRes, studentsRes, contributionsRes, auditRes, grantsRes, rewardsRes, ranksRes, coursesRes, facultyCoursesRes] = await Promise.all([
      supabase
        .from('books')
        .select('id, title, author, isbn, category, description, pdf_url, storage_provider, storage_file_id, storage_path, access_points, access_mode, premium_price, access_duration_days, created_at')
        .order('title', { ascending: true }),
      supabase
        .from('borrow_requests')
        .select('id, student_id, book_id, status, request_date, due_date, returned_date, notes, duration_days')
        .order('request_date', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, email, role, created_at, full_name, school, department, course, student_year, faculty_rank_id')
        .in('role', ['student', 'faculty'])
        .order('created_at', { ascending: false }),
      supabase
        .from('book_contributions')
        .select('id, user_id, title, author, description, pdf_url, storage_provider, storage_file_id, storage_path, status, review_feedback, ai_screening_result, ai_screened_at, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('id,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('book_access_grants').select('id,student_id,book_id,access_type,expires_at,status,reason').order('created_at', { ascending: false }).limit(100),
      supabase.from('rewards').select('id,name,description,points_cost,reward_type,stock,is_active').order('points_cost'),
      supabase.from('faculty_ranks').select('id,title,is_active').order('title'),
      supabase.from('academic_courses').select('id,name,is_active').order('name'),
      supabase.from('faculty_courses').select('faculty_id,course_id'),
    ])

    // Optional insights modules may not exist yet in older Supabase projects.
    // Keep the control panel usable while those sections remain empty.
    if (booksRes.error || requestsRes.error || studentsRes.error || contributionsRes.error || ranksRes.error || coursesRes.error || facultyCoursesRes.error) {
      const failedResource = [booksRes, requestsRes, studentsRes, contributionsRes, ranksRes, coursesRes, facultyCoursesRes].find((result) => result.error && !isMissingTableError(result.error))?.error
      if (failedResource) {
        setError(`Failed to load admin data: ${failedResource.message || 'Please check the Supabase schema.'}`)
      } else if (ranksRes.error || coursesRes.error || facultyCoursesRes.error) {
        setError('Academic titles and courses are not configured. Apply the academic catalog migration in Supabase.')
      }
    }

    setBooks((booksRes.data ?? []) as Book[])
    setRequests((requestsRes.data ?? []) as RequestItem[])
    setStudents((studentsRes.data ?? []) as Profile[])
    setFacultyRanks((ranksRes.data ?? []) as FacultyRank[])
    setAcademicCourses((coursesRes.data ?? []) as AcademicCourse[])
    setFacultyCourses((facultyCoursesRes.data ?? []) as FacultyCourse[])
    setContributions((contributionsRes.data ?? []) as Contribution[])
    setAuditLogs((auditRes.data ?? []) as AuditLog[])
    setAccessGrants(((!grantsRes.error || !isMissingTableError(grantsRes.error)) ? (grantsRes.data ?? []) : []) as AccessGrant[])
    setRewards(((!rewardsRes.error || !isMissingTableError(rewardsRes.error)) ? (rewardsRes.data ?? []) : []) as Reward[])
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
    if (!debouncedBookSearch.trim()) return books
    const tokens = debouncedBookSearch.toLowerCase().trim().split(/\s+/)
    return books.filter((b) =>
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
    if (!profile || profile.role !== 'admin') return

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

  const filteredRequests = useMemo(() => {
    if (requestFilter === 'all') return requests
    return requests.filter((r) => r.status === requestFilter)
  }, [requests, requestFilter])

  const materials = useMemo(
    () =>
      books
        .filter((book) => !!book.pdf_url)
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
  const overdueLoans = requests.filter(
    (request) => request.status === 'approved' && request.due_date && new Date(request.due_date) < new Date()
  )

  const studentDetails = students.map((student) => {
    const studentLoans = requests.filter((request) => request.student_id === student.id && request.status === 'approved')
    const activeLoans = studentLoans.length
    const overdueCount = studentLoans.filter((request) => request.due_date && new Date(request.due_date) < new Date()).length

    return {
      ...student,
      active_loans: activeLoans,
      overdue_loans: overdueCount,
    }
  })

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

  const handleApprove = async (requestId: number, durationDays: number | null | undefined) => {
    setSaving(true)
    setError(null)
    const supabase = getSupabase()

    const { error } = await supabase.rpc('admin_decide_borrow_request', {
      request_id: requestId,
      decision: 'approved',
    })

    if (error) {
      setError(error.message)
    } else {
      await loadData()
      setActionMessage('Request approved and digital access enabled.')
    }
    setSaving(false)
    setConfirmAction(null)
  }

  const handleReject = async (requestId: number) => {
    setSaving(true)
    const supabase = getSupabase()
    const { error } = await supabase.rpc('admin_decide_borrow_request', {
      request_id: requestId,
      decision: 'rejected',
    })
    if (error) setError(error.message)
    else {
      await loadData()
      setActionMessage('Request rejected.')
    }
    setSaving(false)
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

  const openMemberEditor = (member: Profile) => {
    setEditingMember(member)
    setMemberEditForm({
      role: member.role === 'faculty' ? 'faculty' : 'student',
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

  const addAcademicCatalogItem = async (kind: 'rank' | 'course', event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = (kind === 'rank' ? rankDraft : courseDraft).trim()
    if (!name) return
    setSaving(true)
    setError(null)
    setActionMessage(null)
    const supabase = getSupabase()
    const { error } = kind === 'rank'
      ? await supabase.from('faculty_ranks').insert({ title: name })
      : await supabase.from('academic_courses').insert({ name })
    if (error) {
      setError(error.code === '23505' ? `That ${kind === 'rank' ? 'title' : 'course'} already exists.` : error.message)
    } else {
      if (kind === 'rank') setRankDraft('')
      else setCourseDraft('')
      await loadData()
      setActionMessage(`${kind === 'rank' ? 'Faculty title' : 'Course'} added.`)
    }
    setSaving(false)
  }

  const setAcademicCatalogItemActive = async (kind: 'rank' | 'course', id: number, isActive: boolean) => {
    setSaving(true)
    setError(null)
    const table = kind === 'rank' ? 'faculty_ranks' : 'academic_courses'
    const { error } = await getSupabase().from(table).update({ is_active: isActive }).eq('id', id)
    if (error) setError(error.message)
    else {
      await loadData()
      setActionMessage(`${kind === 'rank' ? 'Faculty title' : 'Course'} ${isActive ? 'activated' : 'deactivated'}.`)
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

  const handleRecognition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
    }
    setSaving(false)
  }

  const handleGrantAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
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
    else { setActionMessage('Temporary access granted.'); setGrantForm({ studentId: '', bookId: '', duration: '7', reason: '' }); await loadData() }
    setSaving(false)
  }

  const handleRevokeGrant = async (grantId: number) => {
    setConfirmAction({ type: 'revokeGrant', id: grantId })
  }

  const executeRevokeGrant = async (grantId: number) => {
    setSaving(true)
    const { error } = await getSupabase().rpc('admin_revoke_book_access', { grant_id: grantId, revoke_reason: 'Administrator revoked access' })
    if (error) setError(error.message)
    else { setActionMessage('Access grant revoked.'); await loadData() }
    setSaving(false)
    setConfirmAction(null)
  }

  const handleCreateReward = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await getSupabase().rpc('admin_create_reward', {
      reward_name: rewardForm.name,
      reward_description: rewardForm.description,
      reward_cost: Number(rewardForm.cost),
      reward_kind: rewardForm.type,
      reward_stock: rewardForm.stock.trim() ? Number(rewardForm.stock) : null,
    })
    if (error) setError(error.message)
    else { setActionMessage('Reward created.'); setRewardForm({ name: '', description: '', cost: '50', type: 'profile_badge', stock: '' }); await loadData() }
    setSaving(false)
  }

  const handleRewardStatus = async (reward: Reward) => {
    setSaving(true)
    const { error } = await getSupabase().rpc('admin_set_reward_active', { reward_id: reward.id, active: !reward.is_active })
    if (error) setError(error.message)
    else { setActionMessage(`Reward ${reward.is_active ? 'deactivated' : 'activated'}.`); await loadData() }
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
      setError('Paid or restricted resources must use a PDF uploaded to protected library storage.')
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
        access_points: Number(newBook.access_points) || 0,
        access_mode: newBook.access_mode,
        premium_price: 0,
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
      setNewBook({ title: '', author: '', category: '', isbn: '', pdf_url: '', access_points: '0', access_mode: 'free', access_duration_days: '30', description: '' })
      setNewBookFile(null)
      await loadData()
    }

    setSaving(false)
  }

  const exportLoanReport = () => {
    const rows = requests.map((request) => [
      request.id,
      studentMap.get(request.student_id)?.email ?? 'Unknown',
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

  return (
    <div className="admin-shell min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      {sidebarOpen ? <button type="button" className="admin-sidebar-backdrop" aria-label="Close admin navigation" onClick={() => setSidebarOpen(false)} /> : null}
      <div className={`admin-layout mx-auto max-w-[1500px] ${sidebarCollapsed ? 'admin-sidebar-collapsed' : ''}`}>
        <aside className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
          <div className="mb-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Admin Menu</p>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Control Panel</h2>
          </div>
          <button type="button" className="admin-sidebar-toggle" onClick={() => { setSidebarCollapsed((current) => !current); setSidebarOpen(false) }} aria-label={sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'} title={sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'}><span aria-hidden="true">☰</span></button>
          <nav className="admin-nav-groups">
            {navGroups.map((group) => <div key={group.label} className="admin-nav-group">
              <p className="admin-nav-group-label">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => <button key={item.section} type="button" onClick={() => { setSection(item.section); setSidebarOpen(false) }} className={`admin-nav-button w-full text-left rounded-2xl px-4 py-3 text-sm font-medium transition ${section === item.section ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80'}`}><span className="admin-nav-icon"><AdminNavIcon section={item.section} /></span><span>{item.label}</span></button>)}
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

        <main className="admin-workspace space-y-6">
          {loading ? (
            <AdminDashboardSkeleton />
          ) : (
            <>
          <header className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
            <button type="button" className="admin-mobile-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open admin navigation"><span aria-hidden="true">☰</span></button>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Admin</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Welcome back, {profile?.email}</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Review urgent work, keep the catalog healthy, and recognize the community from one control center.</p>
              </div>
              <div className="rounded-[1.5rem] bg-slate-100 p-4 text-sm font-medium text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                Active role: <span className="font-semibold text-slate-900 dark:text-slate-100">{profile?.role}</span>
              </div>
            </div>
          </header>

          <section className="admin-metrics-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
              <p className="text-sm text-slate-500 dark:text-slate-400">Total students</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">{students.length}</p>
            </div>
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
              <p className="text-sm text-slate-500 dark:text-slate-400">Book inventory</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">{books.length}</p>
            </div>
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
              <p className="text-sm text-slate-500 dark:text-slate-400">Pending approvals</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">{pendingRequests.length}</p>
            </div>
            <div className="rounded-[1.75rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
              <p className="text-sm text-slate-500 dark:text-slate-400">Overdue loans</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">{overdueLoans.length}</p>
            </div>
          </section>

          {error ? (
            <div className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {actionMessage ? (
            <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
              <strong className="mr-2">Success</strong>{actionMessage}
            </div>
          ) : null}

          {section === 'overview' && (
            <section className="admin-overview-grid grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Pending actions</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Items that need an administrator decision.</p></div>
                  <button type="button" onClick={exportLoanReport} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Export loan report</button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <button type="button" onClick={() => setSection('requests')} className="admin-action-tile rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-900/50 dark:bg-amber-950/20"><span className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">Borrow requests</span><strong className="mt-2 block text-2xl text-amber-950 dark:text-amber-100">{pendingRequests.length}</strong><span className="text-xs text-amber-800/75 dark:text-amber-300/80">Awaiting review</span></button>
                  <button type="button" onClick={() => setSection('contributions')} className="admin-action-tile rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left dark:border-sky-900/50 dark:bg-sky-950/20"><span className="text-xs font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-300">Contributions</span><strong className="mt-2 block text-2xl text-sky-950 dark:text-sky-100">{contributions.filter((item) => item.status === 'pending').length}</strong><span className="text-xs text-sky-800/75 dark:text-sky-300/80">Awaiting review</span></button>
                  <button type="button" onClick={() => setSection('requests')} className="admin-action-tile rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left dark:border-rose-900/50 dark:bg-rose-950/20"><span className="text-xs font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-300">Overdue loans</span><strong className="mt-2 block text-2xl text-rose-950 dark:text-rose-100">{overdueLoans.length}</strong><span className="text-xs text-rose-800/75 dark:text-rose-300/80">Need follow-up</span></button>
                </div>
                <div className="mt-6 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:border-slate-700"><tr><th className="px-3 py-3">Student</th><th className="px-3 py-3">Book</th><th className="px-3 py-3">Due</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{[...pendingRequests, ...overdueLoans].slice(0, 6).map((request) => <tr key={`overview-${request.id}`}><td className="px-3 py-3 text-slate-700 dark:text-slate-200">{studentMap.get(request.student_id)?.email ?? 'Unknown'}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{bookMap.get(request.book_id)?.title ?? 'Unknown book'}</td><td className="px-3 py-3 text-slate-600 dark:text-slate-300">{request.due_date ? new Date(request.due_date).toLocaleDateString() : '—'}</td><td className="px-3 py-3 capitalize text-slate-600 dark:text-slate-300">{request.status === 'approved' ? 'overdue' : request.status}</td></tr>)}</tbody></table>{pendingRequests.length + overdueLoans.length === 0 ? <p className="px-3 py-6 text-sm text-slate-500">No urgent actions right now.</p> : null}</div>
              </div>
              <div className="space-y-6">
                <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80"><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Library health</h2><div className="mt-5 space-y-4"><div><div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Digital materials</span><strong className="text-slate-900 dark:text-slate-100">{materials.length} / {books.length || 1}</strong></div><div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, books.length ? materials.length / books.length * 100 : 0)}%` }} /></div></div><div><div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Active access</span><strong className="text-slate-900 dark:text-slate-100">{requests.filter((item) => item.status === 'approved' && !item.returned_date).length}</strong></div><div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><span className="block h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, requests.length ? requests.filter((item) => item.status === 'approved' && !item.returned_date).length / requests.length * 100 : 0)}%` }} /></div></div></div></div>
                <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80"><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Recent activity</h2><div className="mt-4 space-y-3">{requests.slice(0, 5).map((request) => <div key={`activity-${request.id}`} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 text-sm last:border-0 dark:border-slate-800"><div><p className="font-medium text-slate-800 dark:text-slate-100">{studentMap.get(request.student_id)?.email ?? 'Student'} requested {bookMap.get(request.book_id)?.title ?? 'a resource'}</p><p className="mt-1 text-xs text-slate-500">{request.request_date ? new Date(request.request_date).toLocaleDateString() : 'Recently'}</p></div><span className="capitalize text-xs text-slate-500">{request.status}</span></div>)}{requests.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : null}</div></div>
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
                totalLoansActive={requests.filter((r) => r.status === 'approved' && !r.returned_date).length}
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
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Book catalog</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage online e-books, protected PDFs, access terms, and storage. Digital resources do not have stock limits.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => router.push('/dashboard/admin/physical')} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white dark:bg-sky-500 dark:text-slate-950">Physical circulation</button>
                  <button type="button" onClick={() => router.push('/dashboard/admin/ebook-payments')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">Legacy e-book payments</button>
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
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">Author</th>
                      <th className="px-4 py-3 font-semibold">Category</th>
                      <th className="px-4 py-3 font-semibold">Online access</th>
                      <th className="px-4 py-3 font-semibold">PDF</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {filteredBooks.map((book) => (
                      <tr key={book.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80">
                        <td className="px-4 py-4 font-medium text-slate-800 dark:text-slate-100">{book.title}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{book.author}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{book.category}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                          {book.access_mode === 'premium' ? 'Paid access paused' : book.access_mode === 'points' ? `${book.access_points} points / 7 days` : book.access_mode === 'restricted' ? 'Restricted' : 'Free access'}
                        </td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                          {book.pdf_url || book.storage_file_id || book.storage_path ? (
                            <span className="rounded-md bg-pine-100 px-2 py-0.5 text-xs font-semibold text-pine-700 dark:bg-forest-700 dark:text-pine-200">
                              {book.storage_provider === 'google_drive' ? 'Google Drive' : book.storage_provider === 'external' ? 'External' : 'Supabase'}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">None</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => handleDeleteBook(book.id, book.title)}
                            className="rounded-xl border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form onSubmit={handleAddBook} className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800/60">
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
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Points per 7 days</span>
                    <input
                      type="number"
                      min="0"
                      value={newBook.access_points}
                      onChange={(event) => setNewBook({ ...newBook, access_points: event.target.value })}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Points charged per 7-day access period. Set 0 for free access.</span>
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
                      <option value="restricted">Restricted access</option>
                    </select>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">E-books unlock automatically when free or when the member has enough points. Paid checkout is paused until an online payment provider can confirm transactions automatically.</span>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Access duration (days)</span>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={newBook.access_duration_days}
                      onChange={(event) => setNewBook({ ...newBook, access_duration_days: event.target.value })}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
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
            </section>
          )}

          {section === 'requests' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Borrow requests</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review student borrow requests and approve or reject them.</p>
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
                  {(['all', 'pending', 'approved', 'rejected', 'revoked'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setRequestFilter(st)}
                      className={`rounded-xl px-3 py-1 text-xs font-semibold capitalize transition ${
                        requestFilter === st
                          ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {st} {st === 'pending' ? `(${pendingRequests.length})` : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      <th className="px-4 py-3 font-semibold">Book</th>
                      <th className="px-4 py-3 font-semibold">Requested</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {filteredRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80">
                        <td className="px-4 py-4 text-slate-800 dark:text-slate-100">{studentMap.get(request.student_id)?.email ?? 'Unknown'}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{bookMap.get(request.book_id)?.title ?? 'Unknown book'}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A'}</td>
                        <td className="px-4 py-4 capitalize text-slate-600 dark:text-slate-300">{request.status}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                          {request.status === 'pending' ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded-2xl bg-emerald-700 px-3 py-2 text-white transition hover:bg-emerald-600 disabled:opacity-60"
                                onClick={() => handleApprove(request.id, request.duration_days)}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded-2xl bg-rose-700 px-3 py-2 text-white transition hover:bg-rose-600 disabled:opacity-60"
                                onClick={() => handleReject(request.id)}
                              >
                                Reject
                              </button>
                            </div>
                          ) : request.status === 'approved' && !request.returned_date ? (
                            <button
                              type="button"
                              disabled={saving}
                              className="rounded-2xl bg-rose-700 px-3 py-2 text-white transition hover:bg-rose-600 disabled:opacity-60"
                              onClick={() => handleRevoke(request.id)}
                            >
                              Revoke access
                            </button>
                          ) : (
                            <span className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700 dark:bg-slate-800 dark:text-slate-200">No actions</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {section === 'materials' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Attach PDF files</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Add a protected PDF to a book that already exists in the catalog. Students will open it through the Smart Lib reading session after they receive access.</p>
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
                      {books.map((book) => (
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

          {section === 'recognition' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6"><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Student recognition</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Award points for verified academic help, volunteering, or community participation.</p></div>
              <form onSubmit={handleRecognition} className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Student</span><select required value={recognitionForm.studentId} onChange={(event) => setRecognitionForm({ ...recognitionForm, studentId: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Select a student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.email}</option>)}</select></label>
                <label className="block"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Category</span><select value={recognitionForm.category} onChange={(event) => setRecognitionForm({ ...recognitionForm, category: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="academic_assistance">Academic assistance</option><option value="community_contribution">Community contribution</option><option value="volunteer_work">Volunteer work</option><option value="academic_achievement">Academic achievement</option><option value="special_recognition">Special recognition</option></select></label>
                <label className="block"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Points</span><input required type="number" min="1" max="100" value={recognitionForm.points} onChange={(event) => setRecognitionForm({ ...recognitionForm, points: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                <label className="block sm:col-span-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">Reason</span><textarea required minLength={1} maxLength={500} value={recognitionForm.reason} onChange={(event) => setRecognitionForm({ ...recognitionForm, reason: event.target.value })} rows={4} placeholder="Explain the verified contribution..." className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                <div className="sm:col-span-2"><button type="submit" disabled={saving || !recognitionForm.studentId} className="pine-action rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50">{saving ? 'Awarding...' : 'Award recognition points'}</button></div>
              </form>
            </section>
          )}

          {section === 'grants' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
              <div className="mb-6"><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Administrator access grants</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Give temporary access without changing a student&apos;s points balance.</p></div>
              <form onSubmit={handleGrantAccess} className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-medium">Student</span><select required value={grantForm.studentId} onChange={(event) => setGrantForm({ ...grantForm, studentId: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Select a student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.email}</option>)}</select></label>
                <label className="block"><span className="text-sm font-medium">Book</span><select required value={grantForm.bookId} onChange={(event) => setGrantForm({ ...grantForm, bookId: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Select a book</option>{books.filter((book) => book.pdf_url).map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select></label>
                <label className="block"><span className="text-sm font-medium">Duration (days)</span><input required type="number" min="1" max="365" value={grantForm.duration} onChange={(event) => setGrantForm({ ...grantForm, duration: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                <label className="block sm:col-span-2"><span className="text-sm font-medium">Reason</span><textarea required maxLength={500} value={grantForm.reason} onChange={(event) => setGrantForm({ ...grantForm, reason: event.target.value })} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                <div className="sm:col-span-2"><button type="submit" disabled={saving || !grantForm.studentId || !grantForm.bookId} className="pine-action rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50">Grant temporary access</button></div>
              </form>
              <div className="mt-8 space-y-3">{accessGrants.filter((grant) => grant.access_type === 'admin_grant').map((grant) => <article key={grant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-paper-300 p-4 dark:border-forest-700"><div><strong>{books.find((book) => book.id === grant.book_id)?.title ?? `Book #${grant.book_id}`}</strong><p className="mt-1 text-xs text-slate-500">{students.find((student) => student.id === grant.student_id)?.email ?? 'Student'} · expires {grant.expires_at ? new Date(grant.expires_at).toLocaleString() : 'never'} · {grant.status}</p></div>{grant.status === 'active' ? <button type="button" disabled={saving} onClick={() => void handleRevokeGrant(grant.id)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">Revoke</button> : null}</article>)}{accessGrants.filter((grant) => grant.access_type === 'admin_grant').length === 0 ? <p className="text-sm text-slate-500">No administrator grants yet.</p> : null}</div>
            </section>
          )}

          {section === 'audit' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Audit log</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review recent point, recognition, contribution, and access actions.</p>
              <div className="mt-5 space-y-3">{auditLogs.map((log) => <article key={log.id} className="rounded-2xl border border-paper-300 p-4 dark:border-forest-700"><div className="flex flex-wrap justify-between gap-2"><strong className="capitalize">{log.action.replaceAll('_', ' ')}</strong><span className="text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</span></div><p className="mt-1 text-xs text-slate-500">{log.target_type} #{log.target_id ?? '—'}</p></article>)}{auditLogs.length === 0 ? <p className="text-sm text-slate-500">No audit events recorded yet.</p> : null}</div>
            </section>
          )}

          {section === 'rewards' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80">
              <div className="mb-6"><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Rewards catalog</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create non-monetary rewards students can redeem with earned points.</p></div>
              <form onSubmit={handleCreateReward} className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="text-sm font-medium">Name</span><input required maxLength={120} value={rewardForm.name} onChange={(event) => setRewardForm({ ...rewardForm, name: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                <label className="block"><span className="text-sm font-medium">Type</span><select value={rewardForm.type} onChange={(event) => setRewardForm({ ...rewardForm, type: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="profile_badge">Profile badge</option><option value="profile_theme">Profile theme</option><option value="notebook_theme">Notebook theme</option><option value="annotation_style">Annotation style</option><option value="certificate">Certificate</option></select></label>
                <label className="block"><span className="text-sm font-medium">Point cost</span><input required type="number" min="1" value={rewardForm.cost} onChange={(event) => setRewardForm({ ...rewardForm, cost: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                <label className="block"><span className="text-sm font-medium">Stock (optional)</span><input type="number" min="0" value={rewardForm.stock} onChange={(event) => setRewardForm({ ...rewardForm, stock: event.target.value })} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                <label className="block sm:col-span-2"><span className="text-sm font-medium">Description</span><textarea maxLength={500} value={rewardForm.description} onChange={(event) => setRewardForm({ ...rewardForm, description: event.target.value })} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
                <div className="sm:col-span-2"><button type="submit" disabled={saving} className="pine-action rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-50">Create reward</button></div>
              </form>
              <div className="mt-8 space-y-3">{rewards.map((reward) => <article key={reward.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-paper-300 p-4 dark:border-forest-700"><div><strong>{reward.name}</strong><p className="mt-1 text-xs text-slate-500">{reward.points_cost} points · {reward.stock === null ? 'unlimited' : `${reward.stock} in stock`} · {reward.is_active ? 'active' : 'inactive'}</p></div><button type="button" disabled={saving} onClick={() => void handleRewardStatus(reward)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">{reward.is_active ? 'Deactivate' : 'Activate'}</button></article>)}{rewards.length === 0 ? <p className="text-sm text-slate-500">No rewards configured.</p> : null}</div>
            </section>
          )}

          {section === 'contributions' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Community contributions</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">AI screening is advisory only. Check the submitted PDF and make the final approval decision yourself.</p>
              </div>
              <div className="space-y-3">
                {contributions.filter((contribution) => contribution.status === 'pending').length > 0 ? contributions.filter((contribution) => contribution.status === 'pending').map((contribution) => (
                  <article key={contribution.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{contribution.title}</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">by {contribution.author} · from {students.find((student) => student.id === contribution.user_id)?.email ?? 'Unknown student'}</p>
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
            </section>
          )}

          {section === 'users' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Member management</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage student and faculty accounts, academic details, and loan activity.</p>
              </div>
              <div className="mb-6 grid gap-4 xl:grid-cols-2">
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
              </div>
              <form onSubmit={handleCreateStudent} className="mb-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Create member account</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Create a student or faculty account that can sign in immediately.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input type="text" maxLength={120} value={newStudent.fullName} onChange={(event) => setNewStudent({ ...newStudent, fullName: event.target.value })} placeholder="Full name" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input type="email" required value={newStudent.email} onChange={(event) => setNewStudent({ ...newStudent, email: event.target.value })} placeholder="member@example.com" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <PasswordInput required minLength={8} value={newStudent.password} onChange={(event) => setNewStudent({ ...newStudent, password: event.target.value })} placeholder="Temporary password" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <select value={newStudent.role} onChange={(event) => setNewStudent({ ...newStudent, role: event.target.value as 'student' | 'faculty' })} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                    <option value="student">Student</option>
                    <option value="faculty">Faculty</option>
                  </select>
                  <input maxLength={120} value={newStudent.school} onChange={(event) => setNewStudent({ ...newStudent, school: event.target.value })} placeholder="School or college" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input maxLength={120} value={newStudent.department} onChange={(event) => setNewStudent({ ...newStudent, department: event.target.value })} placeholder="Department" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input maxLength={120} value={newStudent.course} onChange={(event) => setNewStudent({ ...newStudent, course: event.target.value })} placeholder="Course or program (students)" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input maxLength={40} value={newStudent.studentYear} onChange={(event) => setNewStudent({ ...newStudent, studentYear: event.target.value })} placeholder="Year level (students)" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{saving ? 'Creating...' : 'Create member account'}</button>
              </form>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Member</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">School / department</th>
                      <th className="px-4 py-3 font-semibold">Program / teaching</th>
                      <th className="px-4 py-3 font-semibold">Title / year</th>
                      <th className="px-4 py-3 font-semibold">Active loans</th>
                      <th className="px-4 py-3 font-semibold">Overdue</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {studentDetails.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80">
                        <td className="px-4 py-4 text-slate-800 dark:text-slate-100"><span className="block font-medium">{student.full_name || '—'}</span><span className="text-xs text-slate-500">{student.email}</span></td>
                        <td className="px-4 py-4 capitalize text-slate-600 dark:text-slate-300">{student.role}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{[student.school, student.department].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.role === 'faculty' ? (facultyCourseMap.get(student.id)?.join(', ') || '—') : (student.course || '—')}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.role === 'faculty' ? (student.faculty_rank_id ? facultyRankMap.get(student.faculty_rank_id) || '—' : '—') : (student.student_year || '—')}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.active_loans}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.overdue_loans}</td>
                        <td className="px-4 py-4"><button type="button" disabled={saving} onClick={() => openMemberEditor(student)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800">Edit profile</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          </>
          )}
        </main>
        {editingMember && memberEditForm ? (
          <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) { setEditingMember(null); setMemberEditForm(null) } }}>
            <section className="my-6 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="member-edit-title">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="member-edit-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Edit member profile</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{editingMember.full_name || editingMember.email} · {editingMember.email}</p>
                </div>
                <button type="button" disabled={saving} onClick={() => { setEditingMember(null); setMemberEditForm(null) }} className="rounded-lg border border-slate-300 px-3 py-1 text-sm dark:border-slate-700">Close</button>
              </div>
              <form onSubmit={(event) => void saveMemberProfile(event)} className="mt-5 space-y-4">
                <label className="block text-sm font-medium">Role
                  <select value={memberEditForm.role} onChange={(event) => setMemberEditForm({ ...memberEditForm, role: event.target.value as 'student' | 'faculty' })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                    <option value="student">Student</option>
                    <option value="faculty">Faculty member</option>
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
          open={confirmAction?.type === 'revokeGrant'}
          title="Revoke this access grant?"
          description="This administrator-granted access will end immediately."
          confirmLabel="Revoke grant"
          tone="danger"
          busy={saving}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => { if (confirmAction?.type === 'revokeGrant') void executeRevokeGrant(confirmAction.id) }}
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
