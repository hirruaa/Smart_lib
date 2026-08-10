'use client'

export const dynamic = 'force-dynamic'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const navItems = [
  { label: 'Overview', href: '/dashboard/admin' },
  { label: 'Books', href: '/dashboard/admin?section=books' },
  { label: 'Requests', href: '/dashboard/admin?section=requests' },
  { label: 'Users', href: '/dashboard/admin?section=users' },
]

type Book = {
  id: number
  title: string
  author: string
  isbn: string | null
  category: string
  description: string | null
  total_copies: number
  available_copies: number
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

export default function AdminPage() {
  const router = useRouter()
  const [section, setSection] = useState('overview')
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [books, setBooks] = useState<Book[]>([])
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newBook, setNewBook] = useState({
    title: '',
    author: '',
    category: '',
    isbn: '',
    total_copies: '1',
    description: '',
  })

  const loadData = async () => {
    setError(null)
    setActionMessage(null)
    const supabase = createClient()

        const { data: { user }, error } = await supabase.auth.getUser()
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
      .select('role, email')
      .eq('id', currentUser.id)
      .maybeSingle()

    const role = profileData?.role ?? (currentUser.user_metadata?.role as string | undefined)
    const email = profileData?.email ?? currentUser.email

    if (!role || role !== 'admin') {
      router.replace('/dashboard')
      return
    }

    if (!profileData) {
      await supabase.from('profiles').upsert({
        id: currentUser.id,
        role,
        email,
      })
    }

    setProfile({ email: email ?? '', role })

    const [booksRes, requestsRes, studentsRes] = await Promise.all([
      supabase.from('books').select('*').order('title', { ascending: true }),
      supabase.from('borrow_requests').select('*').order('request_date', { ascending: false }),
      supabase
        .from('profiles')
        .select('id, email, role, created_at')
        .eq('role', 'student')
        .order('created_at', { ascending: false }),
    ])

    if (booksRes.error || requestsRes.error || studentsRes.error) {
      setError('Failed to load admin data.')
    }

    setBooks((booksRes.data ?? []) as Book[])
    setRequests((requestsRes.data ?? []) as RequestItem[])
    setStudents((studentsRes.data ?? []) as Profile[])
  }

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [router])

  const bookMap = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])
  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])

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

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const handleApprove = async (requestId: number, bookId: number) => {
    setSaving(true)
    const supabase = createClient()

    await supabase
      .from('borrow_requests')
      .update({
        status: 'approved',
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', requestId)

    const book = bookMap.get(bookId)
    if (book) {
      await supabase
        .from('books')
        .update({ available_copies: Math.max(book.available_copies - 1, 0) })
        .eq('id', bookId)
    }

    await loadData()
    setActionMessage('Request approved and inventory updated.')
    setSaving(false)
  }

  const handleReject = async (requestId: number) => {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('borrow_requests').update({ status: 'rejected' }).eq('id', requestId)
    await loadData()
    setActionMessage('Request rejected.')
    setSaving(false)
  }

  const handleAddBook = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setActionMessage(null)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.from('books').insert([
      {
        title: newBook.title,
        author: newBook.author,
        category: newBook.category,
        isbn: newBook.isbn || null,
        description: newBook.description || null,
        total_copies: Number(newBook.total_copies) || 1,
        available_copies: Number(newBook.total_copies) || 1,
      },
    ])

    if (error) {
      setError(error.message)
    } else {
      setActionMessage('New book added to inventory.')
      setNewBook({ title: '', author: '', category: '', isbn: '', total_copies: '1', description: '' })
      await loadData()
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-10 shadow-sm text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Loading</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900">Loading admin dashboard...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Admin Menu</p>
            <h2 className="text-2xl font-semibold text-slate-900">Control Panel</h2>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => {
              const itemSection = item.href.includes('section=') ? item.href.split('section=')[1] : 'overview'
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                    section === itemSection ? 'bg-slate-100 text-slate-900' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </a>
              )
            })}
          </nav>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-8 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Logout
          </button>
        </aside>

        <main className="space-y-6">
          <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Admin</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Welcome back, {profile?.email}</h1>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4 text-sm font-medium text-slate-700 shadow-sm">
                Active role: <span className="font-semibold text-slate-900">{profile?.role}</span>
              </div>
            </div>
          </header>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Total students</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{students.length}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Book inventory</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{books.length}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Pending approvals</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{pendingRequests.length}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Overdue loans</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{overdueLoans.length}</p>
            </div>
          </section>

          {error ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
              {error}
            </div>
          ) : null}

          {actionMessage ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-700 shadow-sm">
              {actionMessage}
            </div>
          ) : null}

          {section === 'books' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Book catalog</h2>
                  <p className="mt-1 text-sm text-slate-500">Manage the library inventory.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">Author</th>
                      <th className="px-4 py-3 font-semibold">Copies</th>
                      <th className="px-4 py-3 font-semibold">Available</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {books.map((book) => (
                      <tr key={book.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4 text-slate-800">{book.title}</td>
                        <td className="px-4 py-4 text-slate-600">{book.author}</td>
                        <td className="px-4 py-4 text-slate-600">{book.total_copies}</td>
                        <td className="px-4 py-4 text-slate-600">{book.available_copies}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form onSubmit={handleAddBook} className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Title</span>
                    <input
                      value={newBook.title}
                      onChange={(event) => setNewBook({ ...newBook, title: event.target.value })}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Author</span>
                    <input
                      value={newBook.author}
                      onChange={(event) => setNewBook({ ...newBook, author: event.target.value })}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Category</span>
                    <input
                      value={newBook.category}
                      onChange={(event) => setNewBook({ ...newBook, category: event.target.value })}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Copies</span>
                    <input
                      type="number"
                      min="1"
                      value={newBook.total_copies}
                      onChange={(event) => setNewBook({ ...newBook, total_copies: event.target.value })}
                      required
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    />
                  </label>
                </div>
                <label className="block mt-4">
                  <span className="text-sm font-medium text-slate-700">ISBN</span>
                  <input
                    value={newBook.isbn}
                    onChange={(event) => setNewBook({ ...newBook, isbn: event.target.value })}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </label>
                <label className="block mt-4">
                  <span className="text-sm font-medium text-slate-700">Description</span>
                  <textarea
                    value={newBook.description}
                    onChange={(event) => setNewBook({ ...newBook, description: event.target.value })}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                    rows={3}
                  />
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-6 w-full rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {saving ? 'Saving...' : 'Add new book'}
                </button>
              </form>
            </section>
          )}

          {section === 'requests' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900">Borrow requests</h2>
                <p className="mt-1 text-sm text-slate-500">Review student borrow requests and approve or reject them.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Student</th>
                      <th className="px-4 py-3 font-semibold">Book</th>
                      <th className="px-4 py-3 font-semibold">Requested</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {requests.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4 text-slate-800">{studentMap.get(request.student_id)?.email ?? 'Unknown'}</td>
                        <td className="px-4 py-4 text-slate-600">{bookMap.get(request.book_id)?.title ?? 'Unknown book'}</td>
                        <td className="px-4 py-4 text-slate-600">{request.request_date ? new Date(request.request_date).toLocaleDateString() : 'N/A'}</td>
                        <td className="px-4 py-4 text-slate-600 capitalize">{request.status}</td>
                        <td className="px-4 py-4 text-slate-600">
                          {request.status === 'pending' ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded-2xl bg-emerald-700 px-3 py-2 text-white transition hover:bg-emerald-600 disabled:opacity-60"
                                onClick={() => handleApprove(request.id, request.book_id)}
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
                          ) : (
                            <span className="rounded-2xl bg-slate-100 px-3 py-2 text-slate-700">No actions</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {section === 'users' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900">Student management</h2>
                <p className="mt-1 text-sm text-slate-500">Review student loan activity.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Active loans</th>
                      <th className="px-4 py-3 font-semibold">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {studentDetails.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4 text-slate-800">{student.email}</td>
                        <td className="px-4 py-4 text-slate-600">{student.role}</td>
                        <td className="px-4 py-4 text-slate-600">{student.active_loans}</td>
                        <td className="px-4 py-4 text-slate-600">{student.overdue_loans}</td>
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
