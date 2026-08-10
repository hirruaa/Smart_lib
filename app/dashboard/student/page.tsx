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

      const role = profileData?.role ?? (currentUser.user_metadata?.role as string | undefined)
      const email = profileData?.email ?? currentUser.email
      const fullName = profileData?.full_name ?? ''

      if (!role || role !== 'student') {
        router.replace('/dashboard')
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
      books.map((book) => ({
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
    () =>
      borrowRequests.filter((request) => request.status === 'approved' && !request.returned_date),
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
      <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl mb-6">
          <BookAssistant />
        </div>
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-10 shadow-sm text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Loading</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900">Preparing your student dashboard...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600">Student Dashboard</p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900">Hello, {profile?.full_name ?? profile?.email}</h1>
              <p className="mt-2 text-sm text-slate-600">Browse the library, track active loans, and manage your requests in one place.</p>
            </div>
            <div className="flex flex-col gap-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-700 shadow-sm sm:flex-row sm:items-center">
              <div className="rounded-3xl bg-white px-4 py-3 shadow-sm">
                <p className="text-slate-500">Active alerts</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{alertCount}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Book catalog & discovery</h2>
                  <p className="mt-1 text-sm text-slate-500">Search books, filter availability, and request the ones you need.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr]">
                  <label className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Search</span>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                      placeholder="Title, author or category"
                    />
                  </label>
                  <label className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Filter</span>
                    <select
                      value={availability}
                      onChange={(event) => setAvailability(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                    >
                      <option value="all">All copies</option>
                      <option value="available">In stock only</option>
                      <option value="all-out">Out of stock only</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {filteredBooks.length > 0 ? (
                  filteredBooks.map((book) => (
                    <div key={book.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">{book.category}</p>
                          <h3 className="mt-2 text-lg font-semibold text-slate-900">{book.title}</h3>
                          <p className="mt-2 text-sm text-slate-600">by {book.author}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${book.available_copies > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {book.available_copies > 0 ? 'Available' : 'All Out'}
                        </span>
                      </div>
                      <p className="mt-4 text-sm text-slate-600">{book.description}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-slate-500">ISBN</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{book.isbn ?? 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Total copies</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{book.total_copies}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Available</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">{book.available_copies}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRequestBorrow(book)}
                        className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={book.available_copies === 0 || requestLoading}
                      >
                        {book.available_copies === 0 ? 'Out of stock' : requestLoading ? 'Requesting...' : 'Request borrow'}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
                    No matching books were found.
                  </div>
                )}
              </div>

              {requestStatus ? (
                <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {requestStatus}
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">My books</h2>
                  <p className="mt-1 text-sm text-slate-500">Currently borrowed books and return deadlines.</p>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{activeLoans.length} items</span>
              </div>

              <div className="mt-6 space-y-4">
                {activeLoans.length > 0 ? (
                  activeLoans.map((loan) => (
                    <div key={loan.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{loan.title ?? `Book #${loan.book_id}`}</p>
                          <p className="mt-1 text-sm text-slate-500">Checked out {loan.request_date ? new Date(loan.request_date).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-500">Due {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : 'N/A'}</p>
                          <p className="mt-1 text-sm font-semibold text-rose-700">Due soon</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
                    You have no active loans right now.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Borrow requests</h2>
              <p className="mt-1 text-sm text-slate-500">Track the status of your active requests.</p>
              <ul className="mt-6 space-y-3">
                {borrowRequests.length > 0 ? (
                  borrowRequests.map((request) => (
                    <li key={request.id} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-900">{request.title ?? `Book #${request.book_id}`}</p>
                          <p className="text-sm text-slate-500">Requested {request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          request.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : request.status === 'rejected'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {request.status}
                        </span>
                      </div>
                    </li>
                  ))
                ) : (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
                    No borrow requests found yet.
                  </div>
                )}
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Reading history</h2>
              <p className="mt-1 text-sm text-slate-500">Most recent returned and rejected book requests.</p>
              <div className="mt-6 space-y-3">
                {readingHistory.length > 0 ? (
                  readingHistory.map((event) => (
                    <div key={`${event.title}-${event.date}`} className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="font-semibold text-slate-900">{event.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{event.action} • {event.date}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
                    No reading history to show yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Notifications</h2>
              <p className="mt-1 text-sm text-slate-500">Important alerts for your borrowed books.</p>
              <ul className="mt-6 space-y-3">
                <li className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">Check your due dates regularly to avoid overdue fees.</li>
                <li className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">Pending requests will appear here once submitted.</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </div>
  )
}
