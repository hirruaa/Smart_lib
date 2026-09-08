'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
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
}

type Fine = { id: number; amount: number; status: string; created_at: string | null }

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
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([])
  const [requestStatus, setRequestStatus] = useState<string | null>(null)
  const [requestingBookId, setRequestingBookId] = useState<number | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
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
  const [reviewBookId, setReviewBookId] = useState<number | null>(null)
  const [reviewRating, setReviewRating] = useState('5')
  const [reviewComment, setReviewComment] = useState('')

  useEffect(() => {
    if (!notificationsOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [notificationsOpen])

  useEffect(() => {
    const supabase = createClient()

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
        .select('role, email, full_name')
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

      setProfile({ full_name: fullName, email: email ?? '' })
      setUserId(currentUser.id)

      const [booksResult, requestsResult, wishlistResult, finesResult] = await Promise.all([
        supabase
          .from('books')
          .select('id, title, author, category, description, isbn, total_copies, available_copies, pdf_url')
          .order('title', { ascending: true }),
        supabase
          .from('borrow_requests')
          .select('id, student_id, book_id, status, request_date, due_date, returned_date, notes, duration_days, renewal_count')
          .eq('student_id', currentUser.id)
          .order('request_date', { ascending: false }),
        supabase.from('wishlists').select('book_id').eq('student_id', currentUser.id),
        supabase.from('fines').select('id, amount, status, created_at').eq('student_id', currentUser.id).eq('status', 'unpaid').order('created_at', { ascending: false }),
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
        pdf_url: book.pdf_url ?? null,
      }))

      setBooks(fetchedBooks)
      setWishlistIds(new Set((wishlistResult.data ?? []).map((item: { book_id: number }) => item.book_id)))
      setFines((finesResult.data ?? []) as Fine[])
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
    () =>
      books
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

          return matchesQuery && matchesCategory && matchesAvailability
        }),
    [books, query, selectedCategory, availability]
  )

  const activeLoans = useMemo(
    () => borrowRequests.filter((request) => request.status === 'approved' && !request.returned_date),
    [borrowRequests]
  )

  const readingHistory = useMemo(
    () =>
      borrowRequests
        .filter((request) => request.status === 'returned' || request.status === 'rejected')
        .map((request) => ({
          title: request.title ?? `Book #${request.book_id}`,
          action: request.status === 'returned' ? 'Returned' : 'Rejected',
          date: request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A',
        })),
    [borrowRequests]
  )

  const alertCount = activeLoans.filter((loan) => {
    if (!loan.due_date) return false
    const dueDate = new Date(loan.due_date)
    const diffDays = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diffDays <= 3
  }).length

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const handleRequestBorrow = async (book: Book) => {
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
      const supabase = createClient()
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
  }

  const handleLoanAction = async (loanId: number, action: 'renew' | 'return') => {
    setLoanActionId(loanId)
    setRequestStatus(null)
    const supabase = createClient()
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
    const supabase = createClient()
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
    const { error } = await createClient().from('reviews').upsert({ book_id: reviewBookId, student_id: userId, rating: Number(reviewRating), comment: reviewComment.trim() || null }, { onConflict: 'book_id,student_id' })
    setRequestStatus(error ? error.message : 'Your review was saved.')
    if (!error) {
      setReviewBookId(null)
      setReviewComment('')
    }
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
            <a href="/assistant" onClick={() => setSidebarOpen(false)}><SparkIcon /><span>Research desk</span></a>
            <a href="#explore" onClick={() => setSidebarOpen(false)}><BookIcon /><span>Explore resources</span></a>
            <a href="#access" onClick={() => setSidebarOpen(false)}><AccessIcon /><span>My access</span></a>
            <a href="#requests" onClick={() => setSidebarOpen(false)}><RequestIcon /><span>Requests</span></a>
            <a href="#history" onClick={() => setSidebarOpen(false)}><HistoryIcon /><span>Reading history</span></a>
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
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Browse the library, track active loans, and manage your requests in one place.</p>
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

        <section className="student-content-grid grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <div id="explore" className="catalog-panel rounded-[2rem] p-6 lg:p-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Book catalog & discovery</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Discover resources and request temporary digital access.</p>
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

              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <label className="block max-w-xs rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-800/80">
                  <span className="field-label text-[11px] font-semibold uppercase tracking-[0.2em]">Access Period</span>
                  <select
                    value={durationDays}
                    onChange={(event) => setDurationDays(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {[7, 14, 30, 45, 60, 90].map((days) => <option key={days} value={days}>{days} days access</option>)}
                  </select>
                </label>
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
                        onClick={() => handleRequestBorrow(book)}
                        className="pine-action mt-5 inline-flex w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={requestingBookId !== null}
                      >
                        {`Request ${durationDays}-day access`}
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
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Currently borrowed books, remaining reading time, and direct reader access.</p>
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
            <div id="requests" className="side-panel rounded-[2rem] p-6 xl:col-start-1 xl:row-start-1">
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
                            : request.status === 'rejected'
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
