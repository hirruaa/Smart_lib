"use client"
import React, { useEffect, useState } from 'react'
import { createClient as createBrowserClient } from '@/utils/supabase/client'
import { Document, Page, pdfjs } from 'react-pdf'
import NotesPanel from './NotesPanel'

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

export default function EReader({ bookId, pdfUrl }: { bookId: number; pdfUrl: string }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const supabase = createBrowserClient()

  function onDocumentLoadSuccess({ numPages }: any) {
    setNumPages(numPages)
  }

  useEffect(() => {
    function onMouseUp() {
      const sel = window.getSelection()?.toString() ?? ''
      if (sel && sel.trim().length > 0) {
        // Open an inline create editor by dispatching a custom event
        const evt = new CustomEvent('smartlib:selection', { detail: { selection: sel, page: pageNumber } })
        window.dispatchEvent(evt)
      }
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [bookId, pageNumber])

  return (
    <div className="ereader">
      <div style={{ marginBottom: 8 }}>
        <button onClick={() => setPageNumber((p) => Math.max(1, p - 1))}>Prev</button>
        <span style={{ margin: '0 8px' }}>Page {pageNumber}{numPages ? ` / ${numPages}` : ''}</span>
        <button onClick={() => setPageNumber((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}>Next</button>
      </div>
      <div>
        <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
          <Page pageNumber={pageNumber} width={800} />
        </Document>
      </div>
      <div style={{ marginTop: 8 }}>
        <small>Select text on the page and release the mouse to save a note. Use the Notes panel to edit or view notes.</small>
      </div>
      <div style={{ marginTop: 16 }}>
        <NotesPanel bookId={bookId} />
      </div>
    </div>
  )
}
