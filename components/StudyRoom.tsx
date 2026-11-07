'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EReader from '@/components/EReader'

type StudyBook = {
  id: number
  title: string
  author: string | null
  category: string | null
  current_page: number
  total_pages: number | null
  updated_at: string | null
}

type StudyNote = {
  id: number
  book_id: number
  book_title: string
  page: number | null
  text: string | null
  selection_text: string | null
  created_at: string
}

type StudyHighlight = {
  id: number
  book_id: number
  book_title: string
  page: number
  created_at: string
}

type WorkspaceData = {
  books: StudyBook[]
  notes: StudyNote[]
  highlights: StudyHighlight[]
  libraryMayBeIncomplete: boolean
  studyItemsTruncated: boolean
}

type Props = {
  bookId: number
  pdfUrl: string
  title: string
}

const panelClass = 'rounded-2xl border border-paper-300 bg-paper-50 p-4 shadow-sm dark:border-forest-700 dark:bg-forest-800/60'
const secondaryText = 'text-sm text-slate-600 dark:text-slate-300'

export default function StudyRoom({ bookId, pdfUrl, title }: Props) {
  const [activeBook, setActiveBook] = useState<StudyBook>({ id: bookId, title, author: null, category: null, current_page: 1, total_pages: null, updated_at: null })
  const [openAtPage, setOpenAtPage] = useState<number | undefined>()
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bookSearch, setBookSearch] = useState('')
  const [studyFilter, setStudyFilter] = useState<'all' | 'this-book'>('all')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [notebookOpen, setNotebookOpen] = useState(false)
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false)
  const workspaceRequested = useRef(false)

  const refreshWorkspace = useCallback(async () => {
    try {
      const response = await fetch('/api/reader/library', { cache: 'no-store' })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error || 'Unable to load your study room.')
      }
      const data = await response.json() as WorkspaceData
      setWorkspace(data)
      setError('')
    } catch (cause) {
      console.error('Unable to load the Study Room library.', cause)
      setError(cause instanceof Error ? cause.message : 'Unable to load your study room.')
    } finally {
      setLoading(false)
    }
  }, [])
  const loadWorkspace = useCallback(() => {
    if (workspaceRequested.current) return
    workspaceRequested.current = true
    setLoading(true)
    void refreshWorkspace()
  }, [refreshWorkspace])
  const handleDraftChange = useCallback((hasDraft: boolean) => setHasUnsavedDraft(hasDraft), [])

  useEffect(() => {
    const refresh = () => {
      if (workspaceRequested.current) void refreshWorkspace()
    }
    window.addEventListener('smart-lib:study-data-changed', refresh)
    return () => window.removeEventListener('smart-lib:study-data-changed', refresh)
  }, [refreshWorkspace])

  useEffect(() => {
    setActiveBook({ id: bookId, title, author: null, category: null, current_page: 1, total_pages: null, updated_at: null })
    setOpenAtPage(undefined)
  }, [bookId, title])

  const books = workspace?.books ?? []
  const filteredBooks = useMemo(() => {
    const query = bookSearch.trim().toLocaleLowerCase()
    return [...books]
      .sort((left, right) => {
        if (left.id === activeBook.id) return -1
        if (right.id === activeBook.id) return 1
        return (right.updated_at ?? '').localeCompare(left.updated_at ?? '') || left.title.localeCompare(right.title)
      })
      .filter((book) => !query || `${book.title} ${book.author ?? ''} ${book.category ?? ''}`.toLocaleLowerCase().includes(query))
  }, [activeBook.id, bookSearch, books])

  const studyItems = useMemo(() => [
    ...(workspace?.notes ?? []).map((note) => ({
      id: `note-${note.id}`,
      kind: 'Note' as const,
      bookId: note.book_id,
      bookTitle: note.book_title,
      page: note.page ?? 1,
      text: (note.text?.trim() || note.selection_text?.trim() || 'Saved note').slice(0, 240),
      createdAt: note.created_at,
    })),
    ...(workspace?.highlights ?? []).map((highlight) => ({
      id: `highlight-${highlight.id}`,
      kind: 'Highlight' as const,
      bookId: highlight.book_id,
      bookTitle: highlight.book_title,
      page: highlight.page,
      text: 'Highlighted passage',
      createdAt: highlight.created_at,
    })),
  ].filter((item) => studyFilter === 'all' || item.bookId === activeBook.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt)), [activeBook.id, studyFilter, workspace])

  function openBook(book: StudyBook, page?: number) {
    if (hasUnsavedDraft && !window.confirm('You have an unsaved note. Discard it and open another page?')) return false
    setActiveBook(book)
    setHasUnsavedDraft(false)
    setOpenAtPage(page)
    setLibraryOpen(false)
    window.history.replaceState(null, '', `/reader/${book.id}`)
    return true
  }

  function openStudyItem(item: (typeof studyItems)[number]) {
    const book = books.find((entry) => entry.id === item.bookId)
    if (!book) return
    if (openBook(book, item.page)) setNotebookOpen(false)
  }

  const currentBook = books.find((book) => book.id === activeBook.id)
  const progressPercent = currentBook?.total_pages
    ? Math.min(100, Math.round((currentBook.current_page / currentBook.total_pages) * 100))
    : null

  return (
    <div className="study-room-shell mx-auto max-w-7xl space-y-4 pb-8">
      <section className={`${panelClass} study-room-navigation`} aria-label="Study Room library and notebook">
        <div className="study-room-navigation-row flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-pine-700 dark:text-pine-200">Smart Lib · Reading session</p>
            <h1 className="mt-0.5 text-base font-bold text-slate-900 dark:text-paper-100">Study Room</h1>
          </div>
          <div className="study-room-actions flex flex-wrap gap-2">
            <button type="button" onClick={() => { const open = !libraryOpen; setLibraryOpen(open); if (open) loadWorkspace() }} aria-expanded={libraryOpen} aria-controls="study-room-panels" className={`reader-draw-button ${libraryOpen ? 'reader-draw-button-active' : ''}`}>
              {libraryOpen ? 'Close library' : 'My library'} <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-xs dark:bg-slate-900/50">{workspace ? books.length : '…'}</span>
            </button>
            <button type="button" onClick={() => { const open = !notebookOpen; setNotebookOpen(open); if (open) loadWorkspace() }} aria-expanded={notebookOpen} aria-controls="study-room-panels" className={`reader-draw-button ${notebookOpen ? 'reader-draw-button-active' : ''}`}>
              {notebookOpen ? 'Close notebook' : 'Study notebook'} <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-xs dark:bg-slate-900/50">{workspace ? studyItems.length : '…'}</span>
            </button>
          </div>
        </div>

        {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error} <button type="button" onClick={() => { setLoading(true); void refreshWorkspace() }} className="ml-2 font-semibold underline">Retry</button></p> : null}

        {libraryOpen || notebookOpen ? (
          <div id="study-room-panels" className={`study-room-panels grid gap-4 ${libraryOpen && notebookOpen ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
            {libraryOpen ? (
              <section className="rounded-xl border border-paper-300/80 p-3 dark:border-forest-700" aria-labelledby="study-library-title">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 id="study-library-title" className="font-semibold text-slate-900 dark:text-paper-100">My digital library</h2>
                    <p className={`mt-0.5 text-xs ${secondaryText}`}>Books you can open right now</p>
                  </div>
                  {activeBook.id ? <span className="max-w-[45%] truncate rounded-full bg-pine-50 px-3 py-1 text-xs font-medium text-pine-800 dark:bg-pine-950/50 dark:text-pine-200">Reading: {activeBook.title}</span> : null}
                </div>
                <label className="sr-only" htmlFor="study-library-search">Search your digital library</label>
                <input id="study-library-search" type="search" value={bookSearch} onChange={(event) => setBookSearch(event.target.value)} placeholder="Search title, author, or subject" className="mt-3 w-full rounded-xl border border-paper-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-forest-700 dark:bg-forest-900 dark:text-paper-100" />
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto" aria-live="polite">
                  {loading ? <p className={`p-3 ${secondaryText}`}>Loading your library…</p>
                    : filteredBooks.length ? filteredBooks.map((book) => {
                      const percent = book.total_pages ? Math.min(100, Math.round((book.current_page / book.total_pages) * 100)) : null
                      return <button key={book.id} type="button" onClick={() => openBook(book)} aria-current={book.id === activeBook.id ? 'true' : undefined} className={`w-full rounded-xl border p-3 text-left transition ${book.id === activeBook.id ? 'border-pine-500 bg-pine-50 dark:bg-pine-950/40' : 'border-paper-300/80 bg-white/70 hover:border-pine-400 dark:border-forest-700 dark:bg-forest-900/50'}`}>
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-paper-100">{book.title}</span>
                        <span className={`mt-0.5 block truncate text-xs ${secondaryText}`}>{book.author || 'Author not listed'} · Page {book.current_page}{book.total_pages ? ` of ${book.total_pages}` : ''}{percent !== null ? ` · ${percent}%` : ''}</span>
                        {percent !== null ? <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-forest-700"><span className="block h-full rounded-full bg-pine-600" style={{ width: `${percent}%` }} /></span> : null}
                      </button>
                    }) : <p className={`p-3 ${secondaryText}`}>{books.length ? 'No books match your search.' : 'No accessible PDF books are available yet.'}</p>}
                </div>
                {workspace?.libraryMayBeIncomplete ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Showing up to 1,000 books. Use search to find a title.</p> : null}
              </section>
            ) : null}

            {notebookOpen ? (
              <section className="rounded-xl border border-paper-300/80 p-3 dark:border-forest-700" aria-labelledby="study-notebook-title">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 id="study-notebook-title" className="font-semibold text-slate-900 dark:text-paper-100">Study notebook</h2>
                    <p className={`mt-0.5 text-xs ${secondaryText}`}>Saved notes and highlights, grouped by book and page</p>
                  </div>
                  <label className="sr-only" htmlFor="study-notebook-filter">Filter notebook entries</label>
                  <select id="study-notebook-filter" value={studyFilter} onChange={(event) => setStudyFilter(event.target.value as typeof studyFilter)} className="rounded-lg border border-paper-300 bg-white px-2.5 py-1.5 text-xs dark:border-forest-700 dark:bg-forest-900">
                    <option value="all">All books</option>
                    <option value="this-book">This book</option>
                  </select>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto" aria-live="polite">
                  {loading ? <p className={`p-3 ${secondaryText}`}>Loading your notebook…</p>
                    : studyItems.length ? studyItems.map((item) => {
                      const canOpen = books.some((book) => book.id === item.bookId)
                      return <button key={item.id} type="button" onClick={() => openStudyItem(item)} disabled={!canOpen} className="w-full rounded-xl border border-paper-300/80 bg-white/70 p-3 text-left transition hover:border-pine-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-forest-700 dark:bg-forest-900/50">
                        <span className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold uppercase tracking-wide text-pine-700 dark:text-pine-200">{item.kind}</span>
                          <span className="shrink-0 text-slate-500 dark:text-slate-400">Page {item.page}</span>
                        </span>
                        <span className="mt-1 block truncate text-sm font-semibold text-slate-900 dark:text-paper-100">{item.bookTitle}</span>
                        <span className="mt-0.5 block line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{item.text}</span>
                        {!canOpen ? <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">Access is no longer active; your saved study work is kept.</span> : null}
                      </button>
                    }) : <p className={`p-3 ${secondaryText}`}>Your notes and highlights will appear here as you read.</p>}
                </div>
                {workspace?.studyItemsTruncated ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Showing the latest 500 notes and 500 highlights.</p> : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </section>

      <EReader
        key={`${activeBook.id}:${openAtPage ?? 'resume'}`}
        bookId={activeBook.id}
        pdfUrl={activeBook.id === bookId ? pdfUrl : `/api/reader/${activeBook.id}`}
        title={activeBook.title}
        initialPage={openAtPage}
        onDraftChange={handleDraftChange}
      />
      {currentBook && progressPercent !== null ? <p className="sr-only">Reading progress for {currentBook.title}: {progressPercent}%</p> : null}
    </div>
  )
}
