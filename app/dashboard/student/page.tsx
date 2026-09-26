'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import dynamicImport from 'next/dynamic'
import ProfileModal from '@/components/ProfileModal'
import ThemeToggle from '@/components/ThemeToggle'

const BookAssistant = dynamicImport(() => import('@/components/BookAssistant'), { ssr: false })

type Book = {
  id: number
  title: string
  author: string
  category: string
  description: string | null
  isbn: string | null
  total_copies: number
  available_copies: number
  access_points: number
  access_mode: 'free' | 'points' | 'restricted'
  access_duration_days: number
  page_count?: number | null
  pdf_url?: string | null
}

type BorrowRequest = {
  id: number
  student_id: string
  book_id: number
  status: string
  request_date: string | null
  due_date: string | null
  returned_date: string | null
  notes: string | null
  duration_days?: number | null
  renewal_count?: number | null
  title?: string
  pdf_url?: string | null
}

type UserProfile = {
  full_name?: string
  email: string
  points_balance: number
}

type Fine = { id: number; amount: number; status: string; created_at: string | null }
type SystemNotification = { id: number; title: string; message: string; read_at: string | null; created_at: string }

function LineIcon({ children }: { children: React.ReactNode }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
}

function DashboardIcon() { return <LineIcon><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></LineIcon> }
function BookIcon() { return <LineIcon><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v17H7.5A2.5 2.5 0 0 0 5 22V5.5Z" /><path d="M5 20.5A2.5 2.5 0 0 1 7.5 18H19M9 7h6M9 10h4" /></LineIcon> }
function BookMarkIcon() { return <LineIcon><path d="M6 4.5A2.5 2.5 0 0 1 8.5 2H19v19l-5-3-5 3V4.5A2.5 2.5 0 0 0 6 4.5Z" /></LineIcon> }
function SparkIcon() { return <LineIcon><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" /></LineIcon> }
function AccessIcon() { return <LineIcon><path d="M4 7h16M4 12h16M4 17h10" /><circle cx="18" cy="17" r="2" /></LineIcon> }
function RequestIcon() { return <LineIcon><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></LineIcon> }
function HistoryIcon() { return <LineIcon><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6M12 8v4l2.5 1.5" /></LineIcon> }
function ProfileIcon() { return <LineIcon><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0" /></LineIcon> }
function LogoutIcon() { return <LineIcon><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></LineIcon> }
function MenuIcon() { return <LineIcon><path d="M4 6h16M4 12h16M4 18h16" /></LineIcon> }
function BellIcon() { return <LineIcon><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></LineIcon> }

export default function StudentPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [availability, setAvailability] = useState('all')
  const [catalogSort, setCatalogSort] = useState<'relevance' | 'title' | 'author' | 'newest'>('relevance')
  const [digitalOnly, setDigitalOnly] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([])
  const [requestStatus, setRequestStatus] = useState<string | null>(null)
  const [requestingBookId, setRequestingBookId] = useState<number | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedBook, setSelectedBook] = useState<Book | null>(null)
  const [durationDays, setDurationDays] = useState('30')
  const [profileOpen, setProfileOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loanActionId, setLoanActionId] = useState<number | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [wishlistIds, setWishlistIds] = useState<Set<number>>(new Set())
  const [fines, setFines] = useState<Fine[]>([])
  const [systemNotifications, setSystemNotifications] = useState<SystemNotification[]>([])
  const [reviewBookId, setReviewBookId] = useState<number | null>(null)
  const [reviewRating, setReviewRating] = useState('5')
  const [reviewComment, setReviewComment] = useState('')
  const [contributionOpen, setContributionOpen] = useState(false)
  const [contributionSubmitting, setContributionSubmitting] = useState(false)
  const [contributionStatus, setContributionStatus] = useState<string | null>(null)
  const [contributionForm, setContributionForm] = useState({ title: '', author: '', description: '', pdfUrl: '' })
  const [lastReadPages, setLastReadPages] = useState<Record<number, number>>({})
  const [readingProgress, setReadingProgress] = useState<Record<number, { current_page: number; total_pages: number | null }>>({})

  useEffect(() => {
    if (!notificationsOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [notificationsOpen])

  useEffect(() => {
    if (!userId) return
    fetch('/api/notifications').then((response) => response.ok ? response.json() : []).then((data) => setSystemNotifications(Array.isArray(data) ? data : [])).catch(() => undefined)
  }, [userId])

  useEffect(() => {
    const supabase = getSupabase()

    async function loadData() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      const currentUser = user
      if (!currentUser) {
        router.replace('/login')
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role, email, full_name, points_balance')
        .eq('id', currentUser.id)
        .maybeSingle()

      if (profileError) {
        setLoadError(`Unable to load your profile. Apply the Supabase profile policies, then try again. (${profileError.message})`)
        return
      }

      const role = profileData?.role ? String(profileData.role).trim().toLowerCase() : ''
      const email = profileData?.email ?? currentUser.email
      const fullName = profileData?.full_name ?? ''

      if (role !== 'student') {
        if (role === 'admin') {
          router.replace('/dashboard/admin')
        } else {
          router.replace('/dashboard')
        }
        return
      }

      setProfile({ full_name: fullName, email: email ?? '', points_balance: profileData?.points_balance ?? 0 })
      setUserId(currentUser.id)

      const [booksResult, requestsResult, wishlistResult, finesResult, progressResult] = await Promise.all([
        supabase
          .from('books')
        .select('id, title, author, category, description, isbn, total_copies, available_copies, access_points, access_mode, access_duration_days, page_count, pdf_url')
          .order('title', { ascending: true }),
        supabase
          .from('borrow_requests')
          .select('id, student_id, book_id, status, request_date, due_date, returned_date, notes, duration_days, renewal_count')
          .eq('student_id', currentUser.id)
          .order('request_date', { ascending: false }),
        supabase.from('wishlists').select('book_id').eq('student_id', currentUser.id),
        supabase.from('fines').select('id, amount, status, created_at').eq('student_id', currentUser.id).eq('status', 'unpaid').order('created_at', { ascending: false }),
        supabase.from('reading_progress').select('book_id,current_page,total_pages').eq('user_id', currentUser.id),
      ])

      const fetchedBooks: Book[] = (booksResult.data ?? []).map((book: any) => ({
        ...book,
        title: book.title ?? '',
        author: book.author ?? '',
        category: book.category ?? '',
        description: book.description ?? '',
        isbn: book.isbn ?? null,
        total_copies: book.total_copies ?? 0,
        available_copies: book.available_copies ?? 0,
        access_points: book.access_points ?? 0,
        access_mode: book.access_mode ?? (book.access_points > 0 ? 'points' : 'free'),
        access_duration_days: book.access_duration_days ?? 30,
        page_count: book.page_count ?? null,
        pdf_url: book.pdf_url ?? null,
      }))

      setBooks(fetchedBooks)
      setWishlistIds(new Set((wishlistResult.data ?? []).map((item: { book_id: number }) => item.book_id)))
      setFines((finesResult.data ?? []) as Fine[])
      setReadingProgress(Object.fromEntries((progressResult.data ?? []).map((item: { book_id: number; current_page: number; total_pages: number | null }) => [item.book_id, item])))
      setBorrowRequests((requestsResult.data ?? []).map((request: BorrowRequest) => {
        const matchingBook = fetchedBooks.find((b) => b.id === request.book_id)
        return {
          ...request,
          title: request.title ?? matchingBook?.title,
          pdf_url: matchingBook?.pdf_url ?? null,
        }
      }))
      setDataReady(true)
    }

    loadData()
  }, [router])

  const [selectedCategory, setSelectedCategory] = useState<string>('All')

  const categories = useMemo(() => {
    const set = new Set<string>()
    books.forEach((b) => {
      if (b.category && b.category.trim()) set.add(b.category.trim())
    })
    return ['All', ...Array.from(set)]
  }, [books])

  const filteredBooks = useMemo(
    () => {
      const results = books
        .map((book) => ({
          ...book,
          status: 'Digital access',
        }))
        .filter((book) => {
          const lowerQuery = query.toLowerCase()
          const matchesQuery =
            book.title.toLowerCase().includes(lowerQuery) ||
            book.author.toLowerCase().includes(lowerQuery) ||
            book.category.toLowerCase().includes(lowerQuery)

          const matchesCategory =
            selectedCategory === 'All' ||
            book.category.toLowerCase() === selectedCategory.toLowerCase()

          const matchesAvailability =
            availability === 'all' ||
            (availability === 'available' && book.available_copies > 0) ||
            (availability === 'all-out' && book.available_copies === 0)

          const matchesDigital = !digitalOnly || Boolean(book.pdf_url)

          return matchesQuery && matchesCategory && matchesAvailability && matchesDigital
        })

      return results.sort((a, b) => {
        if (catalogSort === 'title') return a.title.localeCompare(b.title)
        if (catalogSort === 'author') return a.author.localeCompare(b.author)
        if (catalogSort === 'newest') return b.id - a.id
        return 0
      })
    },
    [books, query, selectedCategory, availability, catalogSort, digitalOnly]
  )

  const activeLoans = useMemo(
    () => borrowRequests.filter((request) => request.status === 'approved' && !request.returned_date),
    [borrowRequests]
  )

  useEffect(() => {
    const saved: Record<number, number> = {}
    activeLoans.forEach((loan) => {
      const page = Number(window.localStorage.getItem(`smart-lib:last-page:${loan.book_id}`))
      if (Number.isInteger(page) && page > 0) saved[loan.book_id] = page
    })
    setLastReadPages(saved)
  }, [activeLoans])

  const continueReading = useMemo(
    () => activeLoans.filter((loan) => loan.pdf_url).slice(0, 3),
    [activeLoans]
  )

  const readingHistory = useMemo(
    () =>
      borrowRequests
        .filter((request) => request.status === 'returned' || request.status === 'revoked' || request.status === 'rejected')
        .map((request) => ({
          title: request.title ?? `Book #${request.book_id}`,
          action: request.status === 'returned' ? 'Returned' : request.status === 'revoked' ? 'Revoked' : 'Rejected',
          date: request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A',
        })),
    [borrowRequests]
  )

  const alertCount = systemNotifications.filter((notification) => !notification.read_at).length + activeLoans.filter((loan) => {
    if (!loan.due_date) return false
    const dueDate = new Date(loan.due_date)
    const diffDays = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diffDays <= 3
  }).length

  const handleLogout = async () => {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const submitAccessRequest = async () => {
    if (!selectedBook) return
    const book = selectedBook
    if (!userId) return
    setRequestingBookId(book.id)
    setRequestStatus(null)

    const response = await fetch('/api/loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId: book.id, durationDays: Number(durationDays) }),
    })
    const data = await response.json()

    if (!response.ok) {
      setRequestStatus(data.error || 'Something went wrong while requesting digital access.')
    } else {
      setRequestStatus(`Digital access requested for ${book.title} for ${durationDays} days.`)
      const pointsCost = book.access_mode === 'points' ? book.access_points : 0
      setProfile((current) => current ? { ...current, points_balance: current.points_balance - pointsCost } : current)
      const supabase = getSupabase()
      const { data: requestsResult } = await supabase
        .from('borrow_requests')
        .select('id, student_id, book_id, status, request_date, due_date, returned_date, notes, duration_days, renewal_count')
        .eq('student_id', userId)
        .order('request_date', { ascending: false })
      setBorrowRequests((requestsResult ?? []).map((request: BorrowRequest) => ({
        ...request,
        title: request.title ?? books.find((book) => book.id === request.book_id)?.title,
      })))
    }

    setRequestingBookId(null)
    setSelectedBook(null)
  }

  const handleLoanAction = async (loanId: number, action: 'renew' | 'return') => {
    setLoanActionId(loanId)
    setRequestStatus(null)
    const supabase = getSupabase()
    const rpc = action === 'renew' ? 'renew_digital_loan' : 'return_digital_loan'
    const params = action === 'renew' ? { request_id: loanId, extension_days: 14 } : { request_id: loanId }
    const { data, error } = await supabase.rpc(rpc, params)
    if (error) {
      setRequestStatus(error.message)
    } else {
      setBorrowRequests((current) => current.map((request) => request.id === loanId ? { ...request, ...data } : request))
      setRequestStatus(action === 'renew' ? 'Access renewed for 14 more days.' : 'Digital access returned.')
    }
    setLoanActionId(null)
  }

  const handleWishlist = async (bookId: number) => {
    if (!userId) return
    const supabase = getSupabase()
    if (wishlistIds.has(bookId)) {
      const { error } = await supabase.from('wishlists').delete().eq('book_id', bookId).eq('student_id', userId)
      if (!error) setWishlistIds((current) => { const next = new Set(current); next.delete(bookId); return next })
    } else {
      const { error } = await supabase.from('wishlists').insert({ book_id: bookId, student_id: userId })
      if (!error) setWishlistIds((current) => new Set(current).add(bookId))
    }
  }

  const handleReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!userId || reviewBookId === null) return
    const { error } = await getSupabase().from('reviews').upsert({ book_id: reviewBookId, student_id: userId, rating: Number(reviewRating), comment: reviewComment.trim() || null }, { onConflict: 'book_id,student_id' })
    setRequestStatus(error ? error.message : 'Your review was saved.')
    if (!error) {
      setReviewBookId(null)
      setReviewComment('')
    }
  }

  function handleContributionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    router.push('/contributions')
  }

  if (loadError) {
    return (
      <main className="surface-page flex min-h-screen items-center justify-center px-6 py-12">
        <section className="surface-card w-full max-w-lg p-8">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Profile setup required</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="pine-action mt-6 rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Try again
          </button>
        </section>
      </main>
    )
  }

  return (
    <div className="student-shell min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      {sidebarOpen ? <button type="button" className="student-sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} /> : null}
      <div className={`student-layout mx-auto max-w-[1500px] ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className={`student-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="student-brand"><span className="student-brand-mark"><BookMarkIcon /></span><span>Smart Lib</span></div>
          <button type="button" className="student-sidebar-toggle" onClick={() => { setSidebarCollapsed((current) => !current); setSidebarOpen(false) }} aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}><MenuIcon /></button>
          <p className="student-sidebar-label">Workspace</p>
          <nav className="student-nav" aria-label="Student workspace">
            <a className="active" href="#overview" onClick={() => setSidebarOpen(false)}><DashboardIcon /><span>Overview</span></a>
            <a href="#research" onClick={() => setSidebarOpen(false)}><SparkIcon /><span>Library assistant</span></a>
                  <a href="/study" onClick={() => setSidebarOpen(false)}><SparkIcon /><span>Study hub</span></a>
                  <a href="/points" onClick={() => setSidebarOpen(false)}><AccessIcon /><span>Points & rewards</span></a>
                  <a href="/contributions" onClick={() => setSidebarOpen(false)}><BookIcon /><span>Contribute material</span></a>
            <a href="#explore" onClick={() => setSidebarOpen(false)}><BookIcon /><span>Explore resources</span></a>
            <a href="/library" onClick={() => setSidebarOpen(false)}><BookMarkIcon /><span>My library</span></a>
          </nav>
          <div className="student-sidebar-footer">
            <div className="student-theme-control"><ThemeToggle /><span>Appearance</span></div>
            <button type="button" onClick={() => setProfileOpen(true)}><ProfileIcon /><span>Profile</span></button>
            <button type="button" onClick={handleLogout}><LogoutIcon /><span>Sign out</span></button>
          </div>
        </aside>
        <main id="overview" className="student-workspace space-y-8">
        <header className="student-hero rounded-[2rem] p-6 lg:p-8">
          <button type="button" className="student-mobile-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><MenuIcon /></button>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-celadon">Student Dashboard</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">Hello, {profile?.full_name || profile?.email || 'student'}</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Browse the library, track active access, and manage your requests in one place.</p>
            </div>
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="student-notification-button"
              aria-label={alertCount > 0 ? `${alertCount} active alerts` : 'Notifications'}
              title="Notifications"
            >
              <BellIcon />
              {alertCount > 0 ? <span className="student-notification-badge" aria-hidden="true">{alertCount}</span> : null}
            </button>
          </div>
        </header>
        <BookAssistant />

        <section className="continue-reading-panel rounded-[2rem] border border-paper-300 bg-paper-50 p-6 shadow-sm dark:border-forest-800 dark:bg-forest-900/60 lg:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Study queue</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Continue reading</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Return to your active digital resources at the page you last visited.</p>
            </div>
            <a href="/library" className="text-sm font-semibold text-pine-700 hover:underline dark:text-pine-200">Open my library</a>
          </div>
          {continueReading.length > 0 ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {continueReading.map((loan) => {
                const progress = readingProgress[loan.book_id]
                const page = progress?.current_page ?? lastReadPages[loan.book_id] ?? 1
                const totalPages = progress?.total_pages ?? books.find((book) => book.id === loan.book_id)?.page_count ?? null
                const percentage = totalPages ? Math.min(100, Math.round((page / totalPages) * 100)) : null
                return <article key={loan.id} className="continue-reading-card rounded-2xl border border-paper-300 bg-paper-100/70 p-4 dark:border-forest-700 dark:bg-forest-800/60">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-slate-900 dark:text-slate-100">{loan.title ?? `Book #${loan.book_id}`}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Last opened page {page}{totalPages ? ` of ${totalPages}` : ''}</p></div><span className="rounded-full bg-pine-100 px-2 py-1 text-[10px] font-bold text-pine-700 dark:bg-forest-700 dark:text-pine-200">{percentage === null ? 'Active' : `${percentage}%`}</span></div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-300 dark:bg-forest-700"><span className="block h-full rounded-full bg-pine-500" style={{ width: `${percentage ?? 0}%` }} /></div>
                  <button type="button" onClick={() => router.push(`/reader/${loan.book_id}`)} className="pine-action mt-4 w-full rounded-xl px-3 py-2 text-xs font-semibold">Resume reading</button>
                </article>
              })}
            </div>
          ) : <div className="mt-5 rounded-2xl border border-dashed border-paper-300 bg-paper-100/60 p-5 text-sm text-slate-600 dark:border-forest-700 dark:bg-forest-800/50 dark:text-slate-300">Borrow a digital resource to build your reading queue.</div>}
        </section>

        {/* Student Personal Study Analytics Strip */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-pine-200 bg-pine-50 p-5 shadow-sm dark:border-forest-700 dark:bg-forest-800/70">
            <span className="text-xs font-semibold uppercase tracking-wider text-pine-700 dark:text-pine-200">Points balance</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">{profile?.points_balance ?? 0}</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">points</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => router.push('/points')} className="rounded-xl bg-forest-900 px-3 py-2 text-xs font-semibold text-paper-100 hover:bg-forest-800 dark:bg-paper-100 dark:text-forest-900">Wallet</button>
              <button type="button" onClick={() => router.push('/points#rewards')} className="rounded-xl border border-pine-300 px-3 py-2 text-xs font-semibold text-pine-800 hover:bg-white dark:border-forest-600 dark:text-pine-100 dark:hover:bg-forest-700">Rewards</button>
            </div>
          </div>

          <div className="rounded-2xl border border-paper-300 bg-white/70 p-5 shadow-sm dark:border-forest-800 dark:bg-forest-900/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Active Access
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {activeLoans.length}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">/ 3 max allowed</span>
            </div>
            <p className="mt-1 text-xs text-pine-600 dark:text-pine-300">
              {3 - activeLoans.length} slots available
            </p>
          </div>

          <div className="rounded-2xl border border-paper-300 bg-white/70 p-5 shadow-sm dark:border-forest-800 dark:bg-forest-900/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Reading History
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {borrowRequests.filter((r) => r.status === 'returned').length}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">books completed</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {borrowRequests.length} lifetime requests
            </p>
          </div>

          <div className="rounded-2xl border border-paper-300 bg-white/70 p-5 shadow-sm dark:border-forest-800 dark:bg-forest-900/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Saved to Wishlist
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                {wishlistIds.size}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">books</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Resources saved for later
            </p>
          </div>

          <div className="rounded-2xl border border-paper-300 bg-white/70 p-5 shadow-sm dark:border-forest-800 dark:bg-forest-900/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Outstanding Fines
            </span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                ${fines.reduce((sum, f) => sum + Number(f.amount), 0).toFixed(2)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">balance</span>
            </div>
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
              {fines.length === 0 ? 'Account in good standing' : `${fines.length} unpaid fine(s)`}
            </p>
          </div>
        </div>

        <section className="student-content-grid grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <div id="explore" className="catalog-panel rounded-[2rem] p-6 lg:p-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Book catalog & discovery</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Discover resources and request temporary digital access.</p>
                  <button type="button" onClick={() => router.push('/contributions')} className="secondary-action mt-4 rounded-xl border px-3 py-2 text-xs font-semibold">Open contribution center</button>
                </div>
                <form
                onSubmit={(event) => {
                  event.preventDefault()
                  setQuery(searchInput)
                }}
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr]"
              >
                <label className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
                  <span className="field-label text-xs font-semibold uppercase tracking-[0.24em]">Search</span>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      className="workspace-input min-w-0 flex-1 rounded-2xl border px-3 py-2 text-sm outline-none transition"
                      placeholder="Title, author or category"
                    />
                    <button
                      type="submit"
                      className="pine-action rounded-2xl px-4 py-2 text-sm font-semibold transition"
                    >
                      Search
                    </button>
                    {query || searchInput ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchInput('')
                          setQuery('')
                        }}
                        className="rounded-2xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        title="Clear search"
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                </label>
                <label className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
                  <span className="field-label text-xs font-semibold uppercase tracking-[0.24em]">Availability</span>
                  <select
                    value={availability}
                    onChange={(event) => setAvailability(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All resources</option>
                    <option value="available">Has physical copies</option>
                    <option value="all-out">No physical copies</option>
                  </select>
                </label>
                <label className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
                  <span className="field-label text-xs font-semibold uppercase tracking-[0.24em]">Sort by</span>
                  <select
                    value={catalogSort}
                    onChange={(event) => setCatalogSort(event.target.value as typeof catalogSort)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="title">Title A-Z</option>
                    <option value="author">Author A-Z</option>
                    <option value="newest">Recently added</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={digitalOnly}
                    onChange={(event) => setDigitalOnly(event.target.checked)}
                    className="h-4 w-4 accent-sky-600"
                  />
                  <span>Digital access only</span>
                </label>
              </form>
              </div>

              {/* Category Pills Bar */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Category:</span>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      selectedCategory === cat
                        ? 'bg-forest-900 text-paper-100 dark:bg-paper-100 dark:text-forest-900 shadow-sm'
                        : 'border border-paper-300 bg-paper-50 text-slate-600 hover:border-pine-500 dark:border-forest-700 dark:bg-forest-800/50 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-end">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Showing <span className="font-bold text-slate-900 dark:text-slate-100">{filteredBooks.length}</span> of {books.length} volumes
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {filteredBooks.length > 0 ? (
                  filteredBooks.map((book) => (
                    <div key={book.id} className="resource-card rounded-[1.5rem] p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-celadon text-sm font-semibold uppercase tracking-[0.2em]">{book.category}</p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{book.title}</h3>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">by {book.author}</p>
                        </div>
                        <span className="status-pill status-available rounded-full px-3 py-1 text-xs font-semibold">
                          Digital access
                        </span>
                      </div>
                      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{book.description}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">ISBN</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{book.isbn ?? 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Format</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Digital</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Access</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Temporary</p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>Catalog copies: <strong className="text-slate-800 dark:text-slate-200">{book.available_copies}</strong> of {book.total_copies}</span>
                        {book.pdf_url ? (
                          <span className="rounded-md bg-pine-100 px-2 py-0.5 font-bold text-pine-700 dark:bg-forest-700 dark:text-pine-200">
                            PDF Ready
                          </span>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setDurationDays(String(book.access_duration_days))
                          setSelectedBook(book)
                          setRequestStatus(null)
                        }}
                        className="pine-action mt-5 inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={requestingBookId !== null}
                      >
                        Request access
                      </button>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => void handleWishlist(book.id)} className="secondary-action flex-1 rounded-xl border px-3 py-2 text-xs font-semibold">
                          {wishlistIds.has(book.id) ? 'Saved' : 'Save to wishlist'}
                        </button>
                        <button type="button" onClick={() => setReviewBookId(book.id)} className="secondary-action flex-1 rounded-xl border px-3 py-2 text-xs font-semibold">Review</button>
                      </div>
                    </div>
                  ))
                ) : dataReady ? (
                  <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    No matching resources. Try a broader title, author, or subject.
                  </div>
                ) : null}
              </div>

              {requestStatus ? (
                <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                  {requestStatus}
                </div>
              ) : null}
            </div>

            <div id="access" className="loans-panel rounded-[2rem] p-6 lg:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My books & active access</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Books you can currently read, remaining access time, and direct reader access.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{activeLoans.length} active</span>
              </div>

              <div className="mt-6 space-y-4">
                {activeLoans.length > 0 ? (
                  activeLoans.map((loan) => {
                    const dueDate = loan.due_date ? new Date(loan.due_date) : null
                    const diffDays = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
                    const isUrgent = diffDays !== null && diffDays <= 3
                    const isOverdue = diffDays !== null && diffDays < 0

                    return (
                      <div key={loan.id} className="loan-row rounded-[1.25rem] border border-paper-300 bg-paper-50/70 p-5 dark:border-forest-800 dark:bg-forest-800/40">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 dark:text-slate-100">{loan.title ?? `Book #${loan.book_id}`}</p>
                              {loan.pdf_url ? (
                                <span className="rounded-full bg-pine-100 px-2 py-0.5 text-[10px] font-bold text-pine-700 dark:bg-forest-700 dark:text-pine-200">
                                  PDF
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Checked out: {loan.request_date ? new Date(loan.request_date).toLocaleDateString() : 'N/A'} • Due: {dueDate ? dueDate.toLocaleDateString() : 'N/A'}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                isOverdue
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : isUrgent
                                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
                                  : 'bg-pine-100 text-pine-700 dark:bg-forest-700 dark:text-pine-200'
                              }`}>
                                {isOverdue
                                  ? 'Overdue'
                                  : diffDays !== null
                                  ? `${diffDays} days left`
                                  : 'Active'}
                              </span>
                            </div>

                            {loan.pdf_url ? (
                              <button
                                type="button"
                                onClick={() => router.push(`/reader/${loan.book_id}`)}
                                className="pine-action inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition hover:opacity-90"
                              >
                                Read Now &rarr;
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleLoanAction(loan.id, 'renew')}
                              disabled={loanActionId !== null || (loan.renewal_count ?? 0) >= 2}
                              className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {(loan.renewal_count ?? 0) >= 2 ? 'Renewal limit' : 'Renew'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleLoanAction(loan.id, 'return')}
                              disabled={loanActionId !== null}
                              className="secondary-action rounded-xl border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Return
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : dataReady ? (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    You do not have any active digital access yet. Explore the collection below to request resources.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="student-side-bento grid gap-6 xl:grid-cols-2">
            <div id="requests" className="side-panel rounded-[2rem] p-6 xl:col-span-2 xl:col-start-1 xl:row-start-1">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Borrow requests</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track the status of your active requests.</p>
              <ul className="mt-6 space-y-3">
                {borrowRequests.length > 0 ? (
                  borrowRequests.map((request) => (
                    <li key={request.id} className="side-row rounded-[1.25rem] px-4 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{request.title ?? `Book #${request.book_id}`}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Requested {request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <span className={`status-pill rounded-full px-3 py-1 text-xs font-semibold ${
                          request.status === 'approved'
                            ? 'status-approved'
                            : request.status === 'rejected' || request.status === 'revoked'
                            ? 'status-rejected'
                            : 'status-pending'
                        }`}>
                          {request.status}
                        </span>
                      </div>
                    </li>
                  ))
                ) : dataReady ? (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    Your access requests will appear here.
                  </div>
                ) : null}
              </ul>
            </div>

            <div id="history" className="side-panel rounded-[2rem] p-6 xl:col-span-2 xl:row-start-2">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Reading history</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Most recent returned and rejected book requests.</p>
              <div className="mt-6 space-y-3">
                {readingHistory.length > 0 ? (
                  readingHistory.map((event) => (
                    <div key={`${event.title}-${event.date}`} className="side-row rounded-[1.25rem] px-4 py-4">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{event.title}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{event.action} • {event.date}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    No reading history to show yet.
                  </div>
                )}
              </div>
            </div>

          </aside>
        </section>
        </main>
      </div>
      {selectedBook ? (
        <div className="access-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedBook(null) }}>
          <section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="access-modal-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Request access</p>
                <h2 id="access-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{selectedBook.title}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose how long you need this digital resource.</p>
              </div>
              <button type="button" onClick={() => setSelectedBook(null)} className="notification-modal-close" aria-label="Close access request">×</button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[selectedBook.access_duration_days].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setDurationDays(String(days))}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${durationDays === String(days) ? 'border-forest-900 bg-forest-900 text-paper-100 dark:border-paper-100 dark:bg-paper-100 dark:text-forest-900' : 'border-paper-300 bg-paper-50 text-slate-700 hover:border-pine-500 dark:border-forest-700 dark:bg-forest-800 dark:text-paper-100'}`}
                >
                  <span className="block text-sm font-semibold">{days} days</span>
                  <span className={`mt-1 block text-xs ${durationDays === String(days) ? 'text-paper-100/75 dark:text-forest-900/70' : 'text-slate-500 dark:text-slate-300'}`}>Configured access period</span>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-paper-300 bg-paper-50 p-4 dark:border-forest-700 dark:bg-forest-800/70">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="font-semibold text-slate-800 dark:text-slate-100">Access terms</span>
                <span className="font-semibold text-pine-700 dark:text-pine-200">
                  {selectedBook.access_mode === 'free' ? 'Free access' : selectedBook.access_mode === 'restricted' ? 'Restricted access' : `${selectedBook.access_points} points`}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-300">Your balance: <strong>{profile?.points_balance ?? 0} points</strong>. This resource is configured for {selectedBook.access_duration_days} days.</p>
              {selectedBook.access_mode === 'points' && selectedBook.access_points > (profile?.points_balance ?? 0) ? <p className="mt-2 text-xs font-semibold text-rose-700 dark:text-rose-300">You need {selectedBook.access_points - (profile?.points_balance ?? 0)} more points to unlock this resource.</p> : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSelectedBook(null)} className="secondary-action rounded-2xl border px-4 py-3 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={() => void submitAccessRequest()} disabled={requestingBookId !== null || selectedBook.access_mode === 'restricted' || (selectedBook.access_mode === 'points' && selectedBook.access_points > (profile?.points_balance ?? 0))} className="pine-action rounded-2xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                {requestingBookId === selectedBook.id ? 'Unlocking...' : selectedBook.access_mode === 'restricted' ? 'Administrator access required' : selectedBook.access_mode === 'points' ? `Unlock for ${selectedBook.access_points} points` : 'Unlock free access'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {contributionOpen ? (
        <div className="access-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContributionOpen(false) }}>
          <section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="contribution-modal-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Community library</p>
                <h2 id="contribution-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Suggest a resource</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">An administrator reviews every submission before it enters the catalog.</p>
              </div>
              <button type="button" onClick={() => setContributionOpen(false)} className="notification-modal-close" aria-label="Close resource form">×</button>
            </div>
            <form onSubmit={handleContributionSubmit} className="mt-6 space-y-4">
              <input required value={contributionForm.title} onChange={(event) => setContributionForm({ ...contributionForm, title: event.target.value })} placeholder="Book title" className="workspace-input w-full rounded-2xl border px-4 py-3 text-sm outline-none" />
              <input required value={contributionForm.author} onChange={(event) => setContributionForm({ ...contributionForm, author: event.target.value })} placeholder="Author" className="workspace-input w-full rounded-2xl border px-4 py-3 text-sm outline-none" />
              <textarea value={contributionForm.description} onChange={(event) => setContributionForm({ ...contributionForm, description: event.target.value })} placeholder="Why is this useful for the library?" rows={3} className="workspace-input w-full rounded-2xl border px-4 py-3 text-sm outline-none" />
              <input type="url" value={contributionForm.pdfUrl} onChange={(event) => setContributionForm({ ...contributionForm, pdfUrl: event.target.value })} placeholder="Optional public PDF URL" className="workspace-input w-full rounded-2xl border px-4 py-3 text-sm outline-none" />
              <p className="text-xs leading-5 text-slate-500 dark:text-slate-300">Approved contributions earn points set by the administrator. Do not submit copyrighted material unless the library has permission to store and share it.</p>
              {contributionStatus ? <p className="rounded-xl border border-paper-300 bg-paper-50 p-3 text-sm text-slate-700 dark:border-forest-700 dark:bg-forest-800 dark:text-paper-100">{contributionStatus}</p> : null}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setContributionOpen(false)} className="secondary-action rounded-2xl border px-4 py-3 text-sm font-semibold">Cancel</button>
                <button type="submit" disabled={contributionSubmitting} className="pine-action rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-50">{contributionSubmitting ? 'Submitting...' : 'Submit for review'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      {notificationsOpen ? (
        <div className="notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setNotificationsOpen(false) }}>
          <section className="notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-modal-title">
            <div className="notification-modal-header">
              <div>
                <p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Updates</p>
                <h2 id="notification-modal-title" className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Notifications</h2>
              </div>
              <button type="button" className="notification-modal-close" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications">×</button>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Important alerts for your borrowed books.</p>
            <ul className="mt-6 space-y-3">
              {systemNotifications.slice(0, 5).map((notification) => <li key={`system-${notification.id}`} className="rounded-[1.5rem] border border-pine-200 bg-pine-50 px-4 py-4 text-sm text-pine-900 dark:border-forest-700 dark:bg-forest-800/60 dark:text-paper-100"><div className="flex items-start justify-between gap-3"><div><strong>{notification.title}</strong><p className="mt-1">{notification.message}</p></div>{!notification.read_at ? <button type="button" className="text-xs font-semibold underline" onClick={() => { void fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: notification.id }) }); setSystemNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item)) }}>Mark read</button> : null}</div></li>)}
              {borrowRequests.filter((request) => request.status === 'pending' || request.status === 'approved').slice(0, 3).map((request) => {
                const dueDate = request.due_date ? new Date(request.due_date) : null
                const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
                return <li key={`notification-${request.id}`} className={`${request.status === 'pending' ? 'status-pending' : 'status-approved'} rounded-[1.5rem] border px-4 py-4 text-sm`}>{request.status === 'pending' ? `Your access request for ${request.title ?? 'a resource'} is waiting for approval.` : daysLeft !== null && daysLeft <= 3 ? `${request.title ?? 'Your resource'} expires in ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? '' : 's'}.` : `Digital access is active for ${request.title ?? 'your resource'}.`}</li>
              })}
              {borrowRequests.every((request) => request.status !== 'pending' && request.status !== 'approved') ? <li className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">Your borrowing notifications will appear here.</li> : null}
            </ul>
            {fines.length > 0 ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">Unpaid fines: <strong>${fines.reduce((total, fine) => total + Number(fine.amount), 0).toFixed(2)}</strong></div> : null}
          </section>
        </div>
      ) : null}
      {reviewBookId !== null ? (
        <div className="review-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewBookId(null) }}>
          <form className="review-modal" onSubmit={handleReview}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="field-label text-xs font-semibold uppercase tracking-[0.2em]">Book review</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Share your perspective</h2>
              </div>
              <button type="button" className="review-modal-close" onClick={() => setReviewBookId(null)} aria-label="Close review">×</button>
            </div>
            <label className="mt-6 block text-sm font-semibold text-slate-700 dark:text-slate-200">Rating
              <select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)} className="workspace-input mt-2 w-full rounded-xl border px-3 py-2 text-sm">
                {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-700 dark:text-slate-200">Comment
              <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={4} className="workspace-input mt-2 w-full resize-y rounded-xl border px-3 py-2 text-sm" placeholder="What did you find useful?" />
            </label>
            <button type="submit" className="pine-action mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold">Save review</button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
