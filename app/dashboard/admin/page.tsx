'use client'

export const dynamic = 'force-dynamic'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const navItems = [
  { label: 'Overview', section: 'overview' },
  { label: 'Books', section: 'books' },
  { label: 'Requests', section: 'requests' },
  { label: 'Users', section: 'users' },
  { label: 'Materials', section: 'materials' },
]

type Book = {
  id: number
  title: string
  author: string
  isbn: string | null
  category: string
  description: string | null
  pdf_url: string | null
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
    pdf_url: '',
    total_copies: '1',
    description: '',
  })
  const [pdfBookId, setPdfBookId] = useState<number | null>(null)
  const [pdfUrl, setPdfUrl] = useState('')

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

    const role = (profileData?.role ? String(profileData.role).trim().toLowerCase() : (currentUser.user_metadata?.role as string | undefined)?.trim().toLowerCase())
    const email = profileData?.email ?? currentUser.email

    if (role !== 'admin') {
      if (role === 'student') {
        router.replace('/dashboard/student')
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
        pdf_url: newBook.pdf_url || null,
        description: newBook.description || null,
        total_copies: Number(newBook.total_copies) || 1,
        available_copies: Number(newBook.total_copies) || 1,
      },
    ])

    if (error) {
      setError(error.message)
    } else {
      setActionMessage('New book added to inventory.')
      setNewBook({ title: '', author: '', category: '', isbn: '', pdf_url: '', total_copies: '1', description: '' })
      await loadData()
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white/80 p-10 text-center shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Loading</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">Loading admin dashboard...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
          <div className="mb-8 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Admin Menu</p>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Control Panel</h2>
          </div>
          <nav className="space-y-2">
            {navItems.map((item) => (
              <button
                key={item.section}
                type="button"
                onClick={() => setSection(item.section)}
                className={`w-full text-left rounded-2xl px-4 py-3 text-sm font-medium transition ${
                  section === item.section
                    ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mt-8 space-y-3">
            <button
              type="button"
              onClick={() => router.push('/profile')}
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Profile
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              Logout
            </button>
          </div>
        </aside>

        <main className="space-y-6">
          <header className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
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

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

          {section === 'books' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Book catalog</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Manage the library inventory.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Title</th>
                      <th className="px-4 py-3 font-semibold">Author</th>
                      <th className="px-4 py-3 font-semibold">Copies</th>
                      <th className="px-4 py-3 font-semibold">Available</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {books.map((book) => (
                      <tr key={book.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/80">
                        <td className="px-4 py-4 text-slate-800 dark:text-slate-100">{book.title}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{book.author}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{book.total_copies}</td>
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{book.available_copies}</td>
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
                </div>
                <label className="mt-4 block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">ISBN</span>
                  <input
                    value={newBook.isbn}
                    onChange={(event) => setNewBook({ ...newBook, isbn: event.target.value })}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="mt-4 block">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">PDF URL</span>
                  <input
                    value={newBook.pdf_url}
                    onChange={(event) => setNewBook({ ...newBook, pdf_url: event.target.value })}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="https://..."
                  />
                </label>
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
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Borrow requests</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review student borrow requests and approve or reject them.</p>
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
                    {requests.map((request) => (
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
                            <a href={material.resource_url ?? '#'} target="_blank" rel="noreferrer" className="text-sky-600 hover:text-sky-500 dark:text-sky-300">
                              Open PDF
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
                  if (!pdfBookId || !pdfUrl) {
                    setError('Please select a book and provide a PDF URL.')
                    return
                  }
                  setSaving(true)
                  setError(null)
                  const supabase = createClient()
                  const { error } = await supabase.from('books').update({ pdf_url: pdfUrl }).eq('id', pdfBookId)
                  if (error) {
                    setError(error.message)
                  } else {
                    setActionMessage('PDF URL published successfully.')
                    setPdfBookId(null)
                    setPdfUrl('')
                    await loadData()
                  }
                  setSaving(false)
                }}
                className="mt-6 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-800/60"
              >
                <div className="grid gap-4 sm:grid-cols-2">
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
                          {book.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">PDF URL</span>
                    <input
                      value={pdfUrl}
                      onChange={(event) => setPdfUrl(event.target.value)}
                      required
                      placeholder="https://..."
                      className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  {saving ? 'Publishing...' : 'Publish PDF'}
                </button>
              </form>
            </section>
          )}

          {section === 'users' && (
            <section className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Student management</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review student loan activity.</p>
              </div>
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
                        <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.role}</td>
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
