'use client'

export const dynamic = 'force-dynamic'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import ThemeToggle from '@/components/ThemeToggle'
import BrandLogo from '@/components/BrandLogo'
import EbookUploader from '@/components/EbookUploader'
import AdminAnalytics from '@/components/AdminAnalytics'

const navItems = [
  { label: 'Overview', section: 'overview' },
  { label: 'Analytics', section: 'analytics' },
  { label: 'Books', section: 'books' },
  { label: 'Requests', section: 'requests' },
  { label: 'Contributions', section: 'contributions' },
  { label: 'Recognition', section: 'recognition' },
  { label: 'Users', section: 'users' },
  { label: 'Materials', section: 'materials' },
  { label: 'Access grants', section: 'grants' },
  { label: 'Audit log', section: 'audit' },
  { label: 'Rewards', section: 'rewards' },
]

type Book = {
  id: number
  title: string
  author: string
  isbn: string | null
  category: string
  description: string | null
  pdf_url: string | null
  storage_provider?: string
  storage_file_id?: string | null
  storage_path?: string | null
  access_points: number
  access_mode: 'free' | 'points' | 'restricted'
  access_duration_days: number
  total_copies: number
  available_copies: number
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
  status: string
  created_at: string | null
  review_feedback?: string | null
}

type AuditLog = { id: number; action: string; target_type: string; target_id: number | null; details: Record<string, unknown>; created_at: string }
type AccessGrant = { id: number; student_id: string; book_id: number; access_type: string; expires_at: string | null; status: string; reason: string | null }
type Reward = { id: number; name: string; description: string | null; points_cost: number; reward_type: string; stock: number | null; is_active: boolean }

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
  const [contributions, setContributions] = useState<Contribution[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newBook, setNewBook] = useState({
    title: '',
    author: '',
    category: '',
    isbn: '',
    pdf_url: '',
    access_points: '0',
    access_mode: 'free' as 'free' | 'points' | 'restricted',
    access_duration_days: '30',
    total_copies: '1',
    description: '',
  })
  const [pdfBookId, setPdfBookId] = useState<number | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [newBookFile, setNewBookFile] = useState<File | null>(null)
  const [newBookStorageProvider, setNewBookStorageProvider] = useState<'google_drive' | 'supabase'>('google_drive')
  const [materialFile, setMaterialFile] = useState<File | null>(null)
  const [materialStorageProvider, setMaterialStorageProvider] = useState<'google_drive' | 'supabase'>('google_drive')
  const [bookSearch, setBookSearch] = useState('')
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'revoked'>('all')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newStudent, setNewStudent] = useState({ email: '', password: '', fullName: '' })
  const [recognitionForm, setRecognitionForm] = useState({ studentId: '', category: 'academic_assistance', points: '10', reason: '' })
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [accessGrants, setAccessGrants] = useState<AccessGrant[]>([])
  const [grantForm, setGrantForm] = useState({ studentId: '', bookId: '', duration: '7', reason: '' })
  const [rewards, setRewards] = useState<Reward[]>([])
  const [rewardForm, setRewardForm] = useState({ name: '', description: '', cost: '50', type: 'profile_badge', stock: '' })

  const handleDeleteBook = async (bookId: number, title: string) => {
    if (!confirm(`Are you sure you want to remove "${title}" from the catalog?`)) return
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
      return
    }

    const role = profileData?.role ? String(profileData.role).trim().toLowerCase() : ''
    const email = profileData?.email ?? currentUser.email

    if (role !== 'admin') {
      if (role === 'student') {
        router.replace('/dashboard/student')
      } else {
        router.replace('/dashboard')
      }
      return
    }

    setProfile({ email: email ?? '', role })

    const [booksRes, requestsRes, studentsRes, contributionsRes, auditRes, grantsRes, rewardsRes] = await Promise.all([
      supabase
        .from('books')
        .select('id, title, author, isbn, category, description, pdf_url, storage_provider, storage_file_id, storage_path, access_points, access_mode, access_duration_days, total_copies, available_copies, created_at')
        .order('title', { ascending: true }),
      supabase
        .from('borrow_requests')
        .select('id, student_id, book_id, status, request_date, due_date, returned_date, notes, duration_days')
        .order('request_date', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, email, role, created_at')
        .eq('role', 'student')
        .order('created_at', { ascending: false }),
      supabase
        .from('book_contributions')
        .select('id, user_id, title, author, description, pdf_url, status, review_feedback, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('id,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(100),
      supabase.from('book_access_grants').select('id,student_id,book_id,access_type,expires_at,status,reason').order('created_at', { ascending: false }).limit(100),
      supabase.from('rewards').select('id,name,description,points_cost,reward_type,stock,is_active').order('points_cost'),
    ])

    if (booksRes.error || requestsRes.error || studentsRes.error || contributionsRes.error || auditRes.error || grantsRes.error || rewardsRes.error) {
      setError('Failed to load admin data.')
    }

    setBooks((booksRes.data ?? []) as Book[])
    setRequests((requestsRes.data ?? []) as RequestItem[])
    setStudents((studentsRes.data ?? []) as Profile[])
    setContributions((contributionsRes.data ?? []) as Contribution[])
    setAuditLogs((auditRes.data ?? []) as AuditLog[])
    setAccessGrants((grantsRes.data ?? []) as AccessGrant[])
    setRewards((rewardsRes.data ?? []) as Reward[])
  }

  useEffect(() => {
    loadData()
  }, [router])

  const bookMap = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])
  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])
  const filteredBooks = useMemo(() => {
    if (!bookSearch.trim()) return books
    const q = bookSearch.toLowerCase()
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        b.category.toLowerCase().includes(q) ||
        (b.isbn && b.isbn.toLowerCase().includes(q))
    )
  }, [books, bookSearch])

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
    if (!window.confirm('Revoke this approved digital access? The student will lose access immediately.')) return
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
  }

  const handleRoleChange = async (userId: string, role: 'student' | 'admin') => {
    setSaving(true)
    setError(null)
    setActionMessage(null)

    const supabase = getSupabase()
    const { error } = await supabase.rpc('admin_set_profile_role', {
      target_user_id: userId,
      new_role: role,
    })

    if (error) {
      setError(error.message)
    } else {
      setActionMessage('User role updated.')
      await loadData()
    }

    setSaving(false)
  }

  const handleContributionReview = async (contributionId: number, decision: 'approved' | 'rejected') => {
    const reward = decision === 'approved' ? Number(window.prompt('Points to award for this contribution?', '25') ?? '25') : 0
    const accessPoints = decision === 'approved' ? Number(window.prompt('Points charged per 7 days of access?', '0') ?? '0') : 0
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
  }

  const handleContributionRevision = async (contributionId: number) => {
    const feedback = window.prompt('What should the student revise?', 'Please add clearer sources, structure, or explanations.')
    if (!feedback?.trim()) return
    setSaving(true)
    setError(null)
    const { error } = await getSupabase().rpc('admin_request_contribution_revision', { contribution_id: contributionId, feedback: feedback.trim() })
    if (error) setError(error.message)
    else { setActionMessage('Revision request sent to the student.'); await loadData() }
    setSaving(false)
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
      setActionMessage(`Student account created for ${data.email}.`)
      setNewStudent({ email: '', password: '', fullName: '' })
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
    if (!window.confirm('Revoke this administrator-granted access?')) return
    setSaving(true)
    const { error } = await getSupabase().rpc('admin_revoke_book_access', { grant_id: grantId, revoke_reason: 'Administrator revoked access' })
    if (error) setError(error.message)
    else { setActionMessage('Access grant revoked.'); await loadData() }
    setSaving(false)
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
        access_duration_days: Number(newBook.access_duration_days) || 30,
        total_copies: Number(newBook.total_copies) || 1,
        available_copies: Number(newBook.total_copies) || 1,
      },
    ])

    if (error) {
      setError(error.message)
    } else {
      setActionMessage('New book added to inventory successfully.')
      setNewBook({ title: '', author: '', category: '', isbn: '', pdf_url: '', access_points: '0', access_mode: 'free', access_duration_days: '30', total_copies: '1', description: '' })
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
      <div className={`admin-layout mx-auto max-w-7xl ${sidebarCollapsed ? 'admin-sidebar-collapsed' : ''}`}>
        <aside className={`admin-sidebar ${sidebarOpen ? 'admin-sidebar-open' : ''}`}>
          <div className="mb-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Admin Menu</p>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Control Panel</h2>
          </div>
          <button type="button" className="admin-sidebar-toggle" onClick={() => { setSidebarCollapsed((current) => !current); setSidebarOpen(false) }} aria-label={sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'} title={sidebarCollapsed ? 'Expand admin navigation' : 'Collapse admin navigation'}><span aria-hidden="true">☰</span></button>
          <nav className="space-y-2">
            {navItems.map((item) => (
              <button
                key={item.section}
                type="button"
                onClick={() => setSection(item.section)}
                className={`admin-nav-button w-full text-left rounded-2xl px-4 py-3 text-sm font-medium transition ${
                  section === item.section
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80'
                }`}
              >
                <span className="admin-nav-icon"><AdminNavIcon section={item.section} /></span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="admin-sidebar-footer mt-8 space-y-3">
            <div className="admin-theme-control"><ThemeToggle /><span>Appearance</span></div>
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
          <header className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
            <button type="button" className="admin-mobile-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open admin navigation"><span aria-hidden="true">☰</span></button>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Admin</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Welcome back, {profile?.email}</h1>
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
              {actionMessage}
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
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage the library inventory, stock, and PDF attachments.</p>
                </div>
                <div className="flex items-center gap-2">
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
                      <th className="px-4 py-3 font-semibold">Stock</th>
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
                          {book.available_copies} / {book.total_copies}
                        </td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                          {book.pdf_url ? (
                            <span className="rounded-md bg-pine-100 px-2 py-0.5 text-xs font-semibold text-pine-700 dark:bg-forest-700 dark:text-pine-200">
                              Attached
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
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Copies</span>
                    <input
                      type="number"
                      min="1"
                      value={newBook.total_copies}
                      onChange={(event) => setNewBook({ ...newBook, total_copies: event.target.value })}
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
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">Use 0 for free access.</span>
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
                      <option value="google_drive">Google Drive</option>
                      <option value="supabase">Supabase Storage</option>
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
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Published materials</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage e-book and PDF links for library materials.</p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">PDF URL</th>
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
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Select book</span>
                    <select
                      value={pdfBookId ?? ''}
                      onChange={(event) => setPdfBookId(Number(event.target.value) || null)}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">Select a book</option>
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
                    />
                    <label className="mt-3 block max-w-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Storage provider</span>
                      <select value={materialStorageProvider} onChange={(event) => setMaterialStorageProvider(event.target.value as typeof materialStorageProvider)} disabled={saving} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
                        <option value="google_drive">Google Drive</option>
                        <option value="supabase">Supabase Storage</option>
                      </select>
                    </label>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  {saving ? 'Publishing...' : 'Attach & Publish PDF'}
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
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review suggested resources and reward useful additions with points.</p>
              </div>
              <div className="space-y-3">
                {contributions.filter((contribution) => contribution.status === 'pending').length > 0 ? contributions.filter((contribution) => contribution.status === 'pending').map((contribution) => (
                  <article key={contribution.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{contribution.title}</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">by {contribution.author} · from {students.find((student) => student.id === contribution.user_id)?.email ?? 'Unknown student'}</p>
                        {contribution.description ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{contribution.description}</p> : null}
                        {contribution.pdf_url ? <a href={contribution.pdf_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-sky-600 hover:underline dark:text-sky-300">Open submitted PDF</a> : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
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
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Student management</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review student loan activity.</p>
              </div>
              <form onSubmit={handleCreateStudent} className="mb-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Create student account</h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The account is created as a student and can sign in immediately.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input type="text" value={newStudent.fullName} onChange={(event) => setNewStudent({ ...newStudent, fullName: event.target.value })} placeholder="Full name" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input type="email" required value={newStudent.email} onChange={(event) => setNewStudent({ ...newStudent, email: event.target.value })} placeholder="student@example.com" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                  <input type="password" required minLength={8} value={newStudent.password} onChange={(event) => setNewStudent({ ...newStudent, password: event.target.value })} placeholder="Temporary password" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <button type="submit" disabled={saving} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">{saving ? 'Creating...' : 'Create student account'}</button>
              </form>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Active loans</th>
                      <th className="px-4 py-3 font-semibold">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {studentDetails.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80">
                        <td className="px-4 py-4 text-slate-800 dark:text-slate-100">{student.email}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                          <select
                            value={student.role}
                            onChange={(event) => handleRoleChange(student.id, event.target.value as 'student' | 'admin')}
                            disabled={saving}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                            aria-label={`Role for ${student.email}`}
                          >
                            <option value="student">student</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.active_loans}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.overdue_loans}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
