'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import dynamicImport from 'next/dynamic'

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
  title?: string
}

type UserProfile = {
  full_name?: string
  email: string
}

export default function StudentPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [availability, setAvailability] = useState('all')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [borrowRequests, setBorrowRequests] = useState<BorrowRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [requestStatus, setRequestStatus] = useState<string | null>(null)
  const [requestLoading, setRequestLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function loadData() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      let currentUser = user
      if (!currentUser) {
        let sessionResult = await supabase.auth.getSession()
        let waited = 0
        while ((!sessionResult.data?.session?.user || !sessionResult.data?.session) && waited < 3000) {
          await new Promise((r) => setTimeout(r, 200))
          waited += 200
          sessionResult = await supabase.auth.getSession()
        }

        if (sessionResult.error || !sessionResult.data?.session?.user) {
          router.replace('/login')
          return
        }

        currentUser = sessionResult.data.session.user
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, email, full_name')
        .eq('id', currentUser.id)
        .maybeSingle()

      const role = (profileData?.role ? String(profileData.role).trim().toLowerCase() : (currentUser.user_metadata?.role as string | undefined)?.trim().toLowerCase())
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

      if (!profileData) {
        await supabase.from('profiles').upsert({
          id: currentUser.id,
          role,
          email,
          full_name: fullName,
        })
      }

      setProfile({ full_name: fullName, email: email ?? '' })
      setUserId(currentUser.id)

      const [booksResult, requestsResult] = await Promise.all([
        supabase.from('books').select('*').order('title', { ascending: true }),
        supabase.from('borrow_requests').select('*').eq('student_id', currentUser.id).order('request_date', { ascending: false }),
      ])

      setBooks(
        (booksResult.data ?? []).map((book) => ({
          ...book,
          title: book.title ?? '',
          author: book.author ?? '',
          category: book.category ?? '',
          description: book.description ?? '',
          isbn: book.isbn ?? null,
          total_copies: book.total_copies ?? 0,
          available_copies: book.available_copies ?? 0,
        }))
      )
      setBorrowRequests((requestsResult.data ?? []).map((request) => ({
        ...request,
        title: request.title ?? undefined,
      })))
    }

    loadData().finally(() => setLoading(false))
  }, [router])

  const filteredBooks = useMemo(
    () =>
      books
        .map((book) => ({
          ...book,
          status: book.available_copies > 0 ? 'Available' : 'All Out',
        }))
        .filter((book) => {
          const lowerQuery = query.toLowerCase()
          const matchesQuery =
            book.title.toLowerCase().includes(lowerQuery) ||
            book.author.toLowerCase().includes(lowerQuery) ||
            book.category.toLowerCase().includes(lowerQuery)

          const matchesAvailability =
            availability === 'all' ||
            (availability === 'available' && book.available_copies > 0) ||
            (availability === 'all-out' && book.available_copies === 0)

          return matchesQuery && matchesAvailability
        }),
    [books, query, availability]
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
    setRequestLoading(true)
    setRequestStatus(null)

    const supabase = createClient()
    const { error } = await supabase.from('borrow_requests').insert([
      {
        student_id: userId,
        book_id: book.id,
        status: 'pending',
        request_date: new Date().toISOString(),
      },
    ])

    if (error) {
      setRequestStatus(error.message)
    } else {
      setRequestStatus(`Borrow request submitted for ${book.title}`)
      const { data: requestsResult } = await supabase
        .from('borrow_requests')
        .select('*')
        .eq('student_id', userId)
        .order('request_date', { ascending: false })
      setBorrowRequests(requestsResult ?? [])
    }

    setRequestLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto mb-6 max-w-3xl">
          <BookAssistant />
        </div>
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white/80 p-10 text-center shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Loading</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">Preparing your student dashboard...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Student Dashboard</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">Hello, {profile?.full_name ?? profile?.email}</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Browse the library, track active loans, and manage your requests in one place.</p>
            </div>
            <div className="flex flex-col gap-3 rounded-[1.75rem] bg-slate-100 p-4 text-sm text-slate-700 shadow-sm dark:bg-slate-800/80 dark:text-slate-200 sm:flex-row sm:items-center sm:justify-between">
              <div className="rounded-[1.5rem] bg-white/90 px-4 py-3 shadow-sm dark:bg-slate-900/60">
                <p className="text-slate-500 dark:text-slate-400">Active alerts</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{alertCount}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/profile')}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Profile
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Book catalog & discovery</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Search books, filter availability, and request the ones you need.</p>
                </div>
                <form
                onSubmit={(event) => {
                  event.preventDefault()
                  setQuery(searchInput)
                }}
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr]"
              >
                <label className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Search</span>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="Title, author or category"
                    />
                    <button
                      type="submit"
                      className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                    >
                      Search
                    </button>
                  </div>
                </label>
                <label className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80">
                  <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Filter</span>
                  <select
                    value={availability}
                    onChange={(event) => setAvailability(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="all">All copies</option>
                    <option value="available">In stock only</option>
                    <option value="all-out">Out of stock only</option>
                  </select>
                </label>
              </form>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {filteredBooks.length > 0 ? (
                  filteredBooks.map((book) => (
                    <div key={book.id} className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/60">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-300">{book.category}</p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{book.title}</h3>
                          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">by {book.author}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${book.available_copies > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>
                          {book.available_copies > 0 ? 'Available' : 'All Out'}
                        </span>
                      </div>
                      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{book.description}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">ISBN</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{book.isbn ?? 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Total copies</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{book.total_copies}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Available</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{book.available_copies}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRequestBorrow(book)}
                        className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 disabled:dark:bg-slate-700"
                        disabled={book.available_copies === 0 || requestLoading}
                      >
                        {book.available_copies === 0 ? 'Out of stock' : requestLoading ? 'Requesting...' : 'Request borrow'}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    No matching books were found.
                  </div>
                )}
              </div>

              {requestStatus ? (
                <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
                  {requestStatus}
                </div>
              ) : null}
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My books</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Currently borrowed books and return deadlines.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:bg-slate-800 dark:text-slate-300">{activeLoans.length} items</span>
              </div>

              <div className="mt-6 space-y-4">
                {activeLoans.length > 0 ? (
                  activeLoans.map((loan) => (
                    <div key={loan.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{loan.title ?? `Book #${loan.book_id}`}</p>
                          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Checked out {loan.request_date ? new Date(loan.request_date).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-500 dark:text-slate-400">Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : 'N/A'}</p>
                          <p className="mt-1 text-sm font-semibold text-rose-700 dark:text-rose-300">Due soon</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    You have no active loans right now.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Borrow requests</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Track the status of your active requests.</p>
              <ul className="mt-6 space-y-3">
                {borrowRequests.length > 0 ? (
                  borrowRequests.map((request) => (
                    <li key={request.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/60">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{request.title ?? `Book #${request.book_id}`}</p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Requested {request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          request.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : request.status === 'rejected'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        }`}>
                          {request.status}
                        </span>
                      </div>
                    </li>
                  ))
                ) : (
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-8 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    No borrow requests found yet.
                  </div>
                )}
              </ul>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Reading history</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Most recent returned and rejected book requests.</p>
              <div className="mt-6 space-y-3">
                {readingHistory.length > 0 ? (
                  readingHistory.map((event) => (
                    <div key={`${event.title}-${event.date}`} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/60">
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

            <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Notifications</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Important alerts for your borrowed books.</p>
              <ul className="mt-6 space-y-3">
                <li className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">Check your due dates regularly to avoid overdue fees.</li>
                <li className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">Pending requests will appear here once submitted.</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </div>
  )
}
