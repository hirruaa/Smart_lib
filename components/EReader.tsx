"use client"
import React, { useEffect, useState } from 'react'
import NotesPanel from './NotesPanel'
import HighlightsPanel from './HighlightsPanel'

export default function EReader({ bookId, pdfUrl }: { bookId: number; pdfUrl: string }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
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
    <div className="min-h-[calc(100vh-3rem)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white/90 p-4 shadow-2xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">E-Study room</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">PDF reader</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Select text to save highlights and notes while you study.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <button
              type="button"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-2 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              Previous
            </button>
            <span className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">Page {pageNumber}{numPages ? ` / ${numPages}` : ''}</span>
            <button
              type="button"
              onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
              className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-2 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-4 shadow-2xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
            <div className="mb-4 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
              Select text anywhere on the page to capture it as a highlight or note.
            </div>
            {Document && Page ? (
              <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
                <Page pageNumber={pageNumber} width={960} />
              </Document>
            ) : (
              <div className="flex min-h-[480px] items-center justify-center rounded-[1.5rem] border border-slate-200 bg-slate-50 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
                Loading reader...
              </div>
            )}
          </div>

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
            <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-2xl shadow-slate-900/5 dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Notes</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review and edit study notes for this book.</p>
                </div>
                {selectedText ? (
                  <button
                    type="button"
                    onClick={() => setSelectedText(null)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Clear selection
                  </button>
                ) : null}
              </div>
              <NotesPanel bookId={bookId} selectedText={selectedText ?? undefined} selectedPage={selectedPage ?? undefined} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
