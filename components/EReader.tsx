"use client"
import React, { useEffect, useState } from 'react'
import { useRef } from 'react'
import NotesPanel from './NotesPanel'
import HighlightsPanel from './HighlightsPanel'

type DrawingPoint = { x: number; y: number }
type DrawingStroke = { points: DrawingPoint[]; color: string; width: number; opacity: number }

export default function EReader({ bookId, pdfUrl }: { bookId: number; pdfUrl: string }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1)
  const [activePanel, setActivePanel] = useState<'notes' | 'highlights' | null>(null)
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false)
  const [drawMode, setDrawMode] = useState<'pen' | 'marker' | 'eraser' | null>(null)
  const [strokes, setStrokes] = useState<DrawingStroke[]>([])
  const [drawing, setDrawing] = useState<DrawingStroke | null>(null)
  const pageLayerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef<DrawingStroke | null>(null)
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
    if (!activePanel) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setActivePanel(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePanel])

  useEffect(() => {
    setStrokes([])
    fetch(`/api/study/drawings?book_id=${bookId}&page=${pageNumber}`)
      .then((response) => response.ok ? response.json() : { strokes: [] })
      .then((data) => setStrokes(Array.isArray(data.strokes) ? data.strokes : []))
      .catch(() => setStrokes([]))
  }, [bookId, pageNumber])

  function drawStrokes() {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.save()
    context.scale(canvas.width / width, canvas.height / height)
    const visibleStrokes = drawing ? [...strokes, drawing] : strokes
    for (const stroke of visibleStrokes) {
      if (stroke.points.length < 2) continue
      context.beginPath()
      context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height)
      stroke.points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height))
      context.strokeStyle = stroke.color
      context.globalAlpha = stroke.opacity
      context.lineWidth = stroke.width
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.stroke()
    }
    context.restore()
  }

  function syncCanvas() {
    const pageCanvas = pageLayerRef.current?.querySelector('canvas')
    const canvas = canvasRef.current
    if (!pageCanvas || !canvas) return
    const rect = pageCanvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    drawStrokes()
  }

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): DrawingPoint {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    }
  }

  function persistStrokes(nextStrokes: DrawingStroke[]) {
    setStrokes(nextStrokes)
    void fetch('/api/study/drawings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId, page: pageNumber, strokes: nextStrokes }),
    })
  }

  function eraseAt(point: DrawingPoint) {
    const remaining = strokes.filter((stroke) => !stroke.points.some((item) => Math.hypot(item.x - point.x, item.y - point.y) < 0.035))
    if (remaining.length !== strokes.length) persistStrokes(remaining)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawMode) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointFromEvent(event)
    if (drawMode === 'eraser') {
      eraseAt(point)
      return
    }
    const nextDrawing = {
      points: [point],
      color: drawMode === 'marker' ? '#f3c969' : '#263f3a',
      width: drawMode === 'marker' ? 18 : 3,
      opacity: drawMode === 'marker' ? 0.35 : 0.9,
    }
    drawingRef.current = nextDrawing
    setDrawing(nextDrawing)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const nextDrawing = { ...drawingRef.current, points: [...drawingRef.current.points, pointFromEvent(event)] }
    drawingRef.current = nextDrawing
    setDrawing(nextDrawing)
  }

  function finishDrawing() {
    if (!drawingRef.current) return
    const finished = drawingRef.current
    drawingRef.current = null
    setDrawing(null)
    if (finished.points.length > 1) persistStrokes([...strokes, finished])
  }

  useEffect(() => {
    drawStrokes()
  }, [strokes, drawing])

  useEffect(() => {
    function onMouseUp() {
      const rawSelection = window.getSelection()?.toString() ?? ''
      const trimmed = rawSelection.trim()
      if (trimmed.length > 0) {
        setSelectedText(trimmed)
        setSelectedPage(pageNumber)
        setSelectionMenuOpen(true)
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
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Study Workspace</h2>
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

            <button
              type="button"
              onClick={() => setActivePanel('highlights')}
              className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 transition hover:bg-paper-200 dark:border-forest-700 dark:bg-forest-900 dark:hover:bg-forest-800"
            >
              Highlights
            </button>
            <button
              type="button"
              onClick={() => setActivePanel('notes')}
              className="rounded-2xl border border-paper-300 bg-paper-100 px-3 py-2 transition hover:bg-paper-200 dark:border-forest-700 dark:bg-forest-900 dark:hover:bg-forest-800"
            >
              Notes
            </button>
            <button type="button" onClick={() => setDrawMode(drawMode === 'pen' ? null : 'pen')} className={`reader-draw-button ${drawMode === 'pen' ? 'reader-draw-button-active' : ''}`}>Pen</button>
            <button type="button" onClick={() => setDrawMode(drawMode === 'marker' ? null : 'marker')} className={`reader-draw-button ${drawMode === 'marker' ? 'reader-draw-button-active' : ''}`}>Marker</button>
            <button type="button" onClick={() => setDrawMode(drawMode === 'eraser' ? null : 'eraser')} className={`reader-draw-button ${drawMode === 'eraser' ? 'reader-draw-button-active' : ''}`}>Eraser</button>
            <button type="button" onClick={() => persistStrokes(strokes.slice(0, -1))} disabled={!strokes.length} className="reader-draw-button">Undo</button>
            <button type="button" onClick={() => persistStrokes([])} disabled={!strokes.length} className="reader-draw-button">Clear</button>
          </div>
        </div>

        <div>
          <div className="reader-workspace overflow-auto rounded-[2rem] border border-paper-300 bg-paper-50 p-4 shadow-xl dark:border-forest-800 dark:bg-forest-800/40">
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-paper-300 bg-paper-100/70 p-3 text-xs text-slate-600 dark:border-forest-700 dark:bg-forest-900/60 dark:text-slate-300">
              <span>Select text to highlight it or attach a note. Use the toolbar or arrow keys to move through the resource.</span>
            </div>
            {selectionMenuOpen && selectedText ? (
              <div className="reader-selection-menu mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pine-300 bg-pine-50 p-3 text-sm dark:border-forest-700 dark:bg-forest-900">
                <p className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">Selected on page {selectedPage}: “{selectedText}”</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setActivePanel('highlights')} className="reader-tool-button">Highlight</button>
                  <button type="button" onClick={() => setActivePanel('notes')} className="reader-tool-button">Add note</button>
                  <button type="button" onClick={() => { setSelectedText(null); setSelectionMenuOpen(false) }} className="reader-tool-button reader-tool-button-muted">Clear</button>
                </div>
              </div>
            ) : null}
            <div ref={pageLayerRef} className="reader-page-layer flex justify-center overflow-x-auto">
              {Document && Page ? (
                <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
                  <Page pageNumber={pageNumber} width={1080 * scale} onRenderSuccess={syncCanvas} />
                </Document>
              ) : null}
              <canvas
                ref={canvasRef}
                className={`reader-drawing-canvas ${drawMode ? 'reader-drawing-canvas-active' : ''}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrawing}
                onPointerCancel={finishDrawing}
              />
            </div>
          </div>
        </div>
      </div>
      {activePanel ? (
        <div className="study-panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActivePanel(null) }}>
          <section className="study-panel-modal" role="dialog" aria-modal="true" aria-labelledby="study-panel-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Study workspace</p>
                <h2 id="study-panel-title" className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{activePanel === 'notes' ? 'Notes' : 'Highlights'}</h2>
              </div>
              <button type="button" onClick={() => setActivePanel(null)} className="study-panel-close" aria-label="Close study panel">×</button>
            </div>
            <div className="mt-5">
              {activePanel === 'notes' ? (
                <NotesPanel bookId={bookId} selectedText={selectedText ?? undefined} selectedPage={selectedPage ?? undefined} />
              ) : (
                <HighlightsPanel
                  bookId={bookId}
                  selectedText={selectedText ?? undefined}
                  selectedPage={selectedPage ?? undefined}
                  onClearSelection={() => {
                    setSelectedText(null)
                    setSelectedPage(null)
                    setSelectionMenuOpen(false)
                  }}
                />
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
