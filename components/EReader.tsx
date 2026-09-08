"use client"
import React, { useEffect, useState } from 'react'
import NotesPanel from './NotesPanel'
import HighlightsPanel from './HighlightsPanel'

export default function EReader({ bookId, pdfUrl }: { bookId: number; pdfUrl: string }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1)
  const [showSidebar, setShowSidebar] = useState(true)
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [pdfModules, setPdfModules] = useState<{
    Document: any
    Page: any
    pdfjs: any
  } | null>(null)

  function onDocumentLoadSuccess({ numPages }: any) {
    setNumPages(numPages)
  }

  useEffect(() => {
    let mounted = true

    import('react-pdf').then((mod) => {
      if (!mounted) return
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${mod.pdfjs.version}/pdf.worker.min.js`
      setPdfModules({ Document: mod.Document, Page: mod.Page, pdfjs: mod.pdfjs })
    }).catch((error) => {
      console.error('Failed to load react-pdf on client:', error)
    })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') {
        setPageNumber((p) => Math.max(1, p - 1))
      } else if (e.key === 'ArrowRight') {
        setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [numPages])

  useEffect(() => {
    function onMouseUp() {
      const rawSelection = window.getSelection()?.toString() ?? ''
      const trimmed = rawSelection.trim()
      if (trimmed.length > 0) {
        setSelectedText(trimmed)
        setSelectedPage(pageNumber)
      }
    }

    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [bookId, pageNumber])

  const Document = pdfModules?.Document
  const Page = pdfModules?.Page

  return (
    <div className="min-h-[calc(100vh-3rem)]">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* Navigation & Toolbar */}
        <div className="flex flex-col gap-4 rounded-[2rem] border border-paper-300 bg-paper-50 p-4 shadow-xl dark:border-forest-800 dark:bg-forest-800/60 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-paper-300 bg-paper-100 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-paper-200 dark:border-forest-700 dark:bg-forest-900 dark:text-paper-100 dark:hover:bg-forest-800"
            >
              &larr; Back to Dashboard
            </a>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">E-Study Room</p>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Study & Annotation Mode</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            {/* Page navigation */}
            <div className="inline-flex items-center rounded-2xl border border-paper-300 bg-paper-100 dark:border-forest-700 dark:bg-forest-900">
              <button
                type="button"
                onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                disabled={pageNumber <= 1}
                className="rounded-l-2xl px-3 py-2 transition hover:bg-paper-200 disabled:opacity-40 dark:hover:bg-forest-800"
              >
                &larr; Prev
              </button>
              <span className="px-3 py-2 font-mono">
                {pageNumber} / {numPages ?? '...'}
              </span>
              <button
                type="button"
                onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
                disabled={numPages ? pageNumber >= numPages : false}
                className="rounded-r-2xl px-3 py-2 transition hover:bg-paper-200 disabled:opacity-40 dark:hover:bg-forest-800"
              >
                Next &rarr;
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="inline-flex items-center rounded-2xl border border-paper-300 bg-paper-100 dark:border-forest-700 dark:bg-forest-900">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}
                className="px-2.5 py-2 transition hover:bg-paper-200 dark:hover:bg-forest-800"
                title="Zoom Out"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => setScale(1)}
                className="px-2 py-2 font-mono text-[11px] transition hover:bg-paper-200 dark:hover:bg-forest-800"
                title="Reset Zoom"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
                className="px-2.5 py-2 transition hover:bg-paper-200 dark:hover:bg-forest-800"
                title="Zoom In"
              >
                +
              </button>
            </div>

            {/* Sidebar toggle */}
            <button
              type="button"
              onClick={() => setShowSidebar(!showSidebar)}
              className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 transition hover:bg-paper-200 dark:border-forest-700 dark:bg-forest-900 dark:hover:bg-forest-800"
            >
              {showSidebar ? 'Hide Notes' : 'Show Notes'}
            </button>
          </div>
        </div>

        <div className={`grid gap-6 ${showSidebar ? 'lg:grid-cols-[1.5fr_0.9fr]' : 'grid-cols-1'}`}>
          <div className="overflow-auto rounded-[2rem] border border-paper-300 bg-paper-50 p-4 shadow-xl dark:border-forest-800 dark:bg-forest-800/40">
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-paper-300 bg-paper-100/70 p-3 text-xs text-slate-600 dark:border-forest-700 dark:bg-forest-900/60 dark:text-slate-300">
              <span>💡 Select any text in the reader to automatically capture it as a study highlight or note. Use arrow keys ← / → to turn pages.</span>
            </div>
            <div className="flex justify-center overflow-x-auto">
              {Document && Page ? (
                <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
                  <Page pageNumber={pageNumber} width={showSidebar ? 860 * scale : 1080 * scale} />
                </Document>
              ) : null}
            </div>
          </div>

          {showSidebar ? (
            <aside className="space-y-6">
              <HighlightsPanel
                bookId={bookId}
                selectedText={selectedText ?? undefined}
                selectedPage={selectedPage ?? undefined}
                onClearSelection={() => {
                  setSelectedText(null)
                  setSelectedPage(null)
                }}
              />
              <div className="rounded-[2rem] border border-paper-300 bg-paper-50 p-5 shadow-xl dark:border-forest-800 dark:bg-forest-800/40">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Study Notes</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review and edit your notes for this volume.</p>
                  </div>
                  {selectedText ? (
                    <button
                      type="button"
                      onClick={() => setSelectedText(null)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Clear Selection
                    </button>
                  ) : null}
                </div>
                <NotesPanel bookId={bookId} selectedText={selectedText ?? undefined} selectedPage={selectedPage ?? undefined} />
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  )
}
