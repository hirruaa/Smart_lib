"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NotesPanel from './NotesPanel'
import HighlightsPanel from './HighlightsPanel'

type Point = { x: number; y: number }
type Stroke = { points: Point[]; color: string; width: number; opacity: number }
type Note = { id: number; page: number | null; text: string | null; selection_text: string | null; created_at?: string; meta?: { x?: number; y?: number; color?: string; title?: string } }
type Highlight = { id: number; page: number; rects: Array<{ x: number; y: number; width: number; height: number }>; color: string; meta?: { selection_text?: string } }
type PdfModules = { Document: any; Page: any }
const noteColors = ['#f6d77a', '#c9dfc8', '#c9dceb', '#f3c4b7']
const highlightColors = ['#f0c94b', '#9ed8aa', '#9ec9e8', '#efaaa0']
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

export default function EReader({ bookId, pdfUrl }: { bookId: number; pdfUrl: string }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1)
  const [pageWidth, setPageWidth] = useState(900)
  const [activePanel, setActivePanel] = useState<'notes' | 'highlights' | null>(null)
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [selectedRects, setSelectedRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>([])
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false)
  const [drawMode, setDrawMode] = useState<'pen' | 'marker' | 'eraser' | null>(null)
  const [brushSize, setBrushSize] = useState(3)
  const [brushColor, setBrushColor] = useState('#263f3a')
  const [brushOpacity, setBrushOpacity] = useState(0.9)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [past, setPast] = useState<Stroke[][]>([])
  const [future, setFuture] = useState<Stroke[][]>([])
  const [drawing, setDrawing] = useState<Stroke | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null)
  const [noteDraft, setNoteDraft] = useState<Note | null>(null)
  const [noteMode, setNoteMode] = useState(false)
  const [noteColor, setNoteColor] = useState(noteColors[0])
  const [draggingNoteId, setDraggingNoteId] = useState<number | null>(null)
  const [savingNote, setSavingNote] = useState(false)
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [drawingStatus, setDrawingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [readerError, setReaderError] = useState<string | null>(null)
  const [pdfModules, setPdfModules] = useState<PdfModules | null>(null)
  const workspaceRef = useRef<HTMLDivElement>(null)
  const pageFrameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef<Stroke | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const visibleNotes = useMemo(() => notes.filter((note) => Number(note.page) === pageNumber), [notes, pageNumber])
  const visibleHighlights = useMemo(() => highlights.filter((highlight) => Number(highlight.page) === pageNumber), [highlights, pageNumber])

  useEffect(() => {
    let mounted = true
    import('react-pdf').then((mod) => {
      if (!mounted) return
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${mod.pdfjs.version}/pdf.worker.min.js`
      setPdfModules({ Document: mod.Document, Page: mod.Page })
    }).catch(() => setReaderError('The PDF reader could not be loaded.'))
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const element = workspaceRef.current
    if (!element) return
    const resize = () => setPageWidth(Math.max(320, Math.min(1080, element.clientWidth - 32)))
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const refreshNotes = useCallback(async () => {
    const response = await fetch(`/api/study/notes?book_id=${bookId}`)
    if (!response.ok) return
    const data = await response.json()
    setNotes(Array.isArray(data) ? data : [])
  }, [bookId])

  const refreshHighlights = useCallback(async () => {
    const response = await fetch(`/api/study/highlights?book_id=${bookId}`)
    if (!response.ok) return
    const data = await response.json()
    setHighlights(Array.isArray(data) ? data : [])
  }, [bookId])

  useEffect(() => { void refreshNotes() }, [refreshNotes])
  useEffect(() => { void refreshHighlights() }, [refreshHighlights])
  useEffect(() => {
    const refresh = () => void refreshHighlights()
    window.addEventListener('smart-lib:highlights-changed', refresh)
    return () => window.removeEventListener('smart-lib:highlights-changed', refresh)
  }, [refreshHighlights])

  useEffect(() => {
    const savedPage = Number(window.localStorage.getItem(`smart-lib:last-page:${bookId}`))
    if (Number.isInteger(savedPage) && savedPage > 0) setPageNumber(savedPage)
    void fetch(`/api/reading-progress?book_id=${bookId}`).then((response) => response.ok ? response.json() : null).then((progress) => {
      if (progress?.current_page) setPageNumber(Number(progress.current_page))
    }).catch(() => undefined)
  }, [bookId])

  useEffect(() => {
    window.localStorage.setItem(`smart-lib:last-page:${bookId}`, String(pageNumber))
    void fetch('/api/reading-progress', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId, currentPage: pageNumber, totalPages: numPages }) }).catch(() => undefined)
  }, [bookId, pageNumber, numPages])

  useEffect(() => {
    let active = true
    setStrokes([]); setPast([]); setFuture([])
    fetch(`/api/study/drawings?book_id=${bookId}&page=${pageNumber}`)
      .then((response) => response.ok ? response.json() : { strokes: [] })
      .then((data) => { if (active) { const loaded = Array.isArray(data.strokes) ? data.strokes : []; strokesRef.current = loaded; setStrokes(loaded) } })
      .catch(() => { if (active) setStrokes([]) })
    return () => { active = false }
  }, [bookId, pageNumber])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return
    const context = canvas.getContext('2d')
    if (!context) return
    const width = canvas.clientWidth; const height = canvas.clientHeight
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.save(); context.scale(canvas.width / width, canvas.height / height)
    for (const stroke of drawing ? [...strokes, drawing] : strokes) {
      if (!stroke.points.length) continue
      context.beginPath(); context.moveTo(stroke.points[0].x * width, stroke.points[0].y * height)
      stroke.points.slice(1).forEach((point) => context.lineTo(point.x * width, point.y * height))
      context.strokeStyle = stroke.color; context.globalAlpha = stroke.opacity; context.lineWidth = stroke.width; context.lineCap = 'round'; context.lineJoin = 'round'; context.stroke()
    }
    context.restore()
  }, [drawing, strokes])

  const syncCanvas = useCallback(() => {
    const pdfCanvas = pageFrameRef.current?.querySelector('canvas'); const canvas = canvasRef.current
    if (!pdfCanvas || !canvas) return
    const rect = pdfCanvas.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio)
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`; drawCanvas()
  }, [drawCanvas])

  useEffect(() => { requestAnimationFrame(syncCanvas) }, [syncCanvas, scale, pageWidth])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowLeft') setPageNumber((page) => Math.max(1, page - 1))
      if (event.key === 'ArrowRight') setPageNumber((page) => numPages ? Math.min(numPages, page + 1) : page + 1)
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
    }
    window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown)
  }, [numPages, past, future])

  function persistStrokes(next: Stroke[], previous = strokesRef.current) {
    strokesRef.current = next; setStrokes(next); setPast((items) => [...items, previous]); setFuture([]); setDrawingStatus('saving')
    void fetch('/api/study/drawings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId, page: pageNumber, strokes: next }) }).then((response) => setDrawingStatus(response.ok ? 'saved' : 'error')).catch(() => setDrawingStatus('error'))
  }
  function restoreStrokes(next: Stroke[]) { strokesRef.current = next; setStrokes(next); setDrawingStatus('saving'); void fetch('/api/study/drawings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId, page: pageNumber, strokes: next }) }).then((response) => setDrawingStatus(response.ok ? 'saved' : 'error')).catch(() => setDrawingStatus('error')) }
  function undo() { if (!past.length) return; const previous = past[past.length - 1]; setPast(past.slice(0, -1)); setFuture([strokesRef.current, ...future]); restoreStrokes(previous) }
  function redo() { if (!future.length) return; const next = future[0]; setFuture(future.slice(1)); setPast([...past, strokesRef.current]); restoreStrokes(next) }

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): Point { const rect = event.currentTarget.getBoundingClientRect(); return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) } }
  function eraseAt(point: Point) {
    const radius = Math.max(0.012, brushSize / Math.max(320, pageWidth) / 2)
    const remaining = strokesRef.current.filter((stroke) => {
      for (let index = 1; index < stroke.points.length; index += 1) {
        const a = stroke.points[index - 1]; const b = stroke.points[index]; const dx = b.x - a.x; const dy = b.y - a.y; const length = dx * dx + dy * dy || 1
        const projection = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length); const near = { x: a.x + projection * dx, y: a.y + projection * dy }
        if (Math.hypot(near.x - point.x, near.y - point.y) <= radius + stroke.width / pageWidth) return false
      }
      return true
    })
    if (remaining.length !== strokesRef.current.length) persistStrokes(remaining)
  }
  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawMode) return
    event.currentTarget.setPointerCapture(event.pointerId); const point = pointFromEvent(event)
    if (drawMode === 'eraser') { eraseAt(point); return }
    const marker = drawMode === 'marker'; const next: Stroke = { points: [point], color: brushColor, width: brushSize, opacity: marker ? brushOpacity * 0.55 : brushOpacity }
    drawingRef.current = next; setDrawing(next)
  }
  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) { if (!drawingRef.current) return; const next = { ...drawingRef.current, points: [...drawingRef.current.points, pointFromEvent(event)] }; drawingRef.current = next; setDrawing(next) }
  function finishDrawing(event?: React.PointerEvent<HTMLCanvasElement>) {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drawingRef.current) return
    const finished = drawingRef.current; drawingRef.current = null; setDrawing(null)
    if (finished.points.length > 1) persistStrokes([...strokesRef.current, finished])
  }

  function activateNoteMode() { setDrawMode(null); setActivePanel(null); setNoteMode((value) => !value) }
  function beginNewNote(x = 0.5, y = 0.18) { setNoteMode(false); setNoteStatus('idle'); setNoteDraft({ id: 0, page: pageNumber, text: '', selection_text: selectedText ?? '', meta: { x, y, color: noteColor, title: '' } }) }
  async function persistNote() {
    if (!noteDraft?.text?.trim()) return
    setSavingNote(true); setNoteStatus('saving'); const isNew = !noteDraft.id
    const payload = { id: noteDraft.id || undefined, book_id: bookId, page: noteDraft.page ?? pageNumber, text: noteDraft.text, selection_text: noteDraft.selection_text ?? '', meta: noteDraft.meta ?? {} }
    const response = await fetch('/api/study/notes', { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (response.ok) { const saved = await response.json(); setNotes((items) => isNew ? [saved, ...items] : items.map((item) => item.id === saved.id ? saved : item)); setExpandedNoteId(saved.id); setNoteDraft(null); setNoteStatus('saved') } else setNoteStatus('error')
    setSavingNote(false)
  }
  async function deleteNote(id: number) { if (!window.confirm('Delete this note?')) return; const response = await fetch(`/api/study/notes?id=${id}`, { method: 'DELETE' }); if (response.ok) { setNotes((items) => items.filter((item) => item.id !== id)); setExpandedNoteId(null) } }
  function noteMetaAt(clientX: number, clientY: number, note: Note) {
    const rect = pageFrameRef.current?.getBoundingClientRect(); if (!rect) return note.meta ?? {}
    return { ...(note.meta ?? {}), x: clamp((clientX - rect.left) / rect.width), y: clamp((clientY - rect.top) / rect.height) }
  }
  function updateNotePosition(note: Note, clientX: number, clientY: number) {
    const meta = noteMetaAt(clientX, clientY, note)
    setNotes((items) => items.map((item) => item.id === note.id ? { ...item, meta } : item))
    return meta
  }
  async function saveNotePosition(note: Note, clientX: number, clientY: number) {
    const meta = noteMetaAt(clientX, clientY, note)
    await fetch('/api/study/notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: note.id, meta }) })
  }
  function handlePageClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (noteMode && !target.closest('.reader-note-pin')) {
      const rect = event.currentTarget.getBoundingClientRect()
      beginNewNote(clamp((event.clientX - rect.left) / rect.width), clamp((event.clientY - rect.top) / rect.height))
    }
  }

  useEffect(() => {
    function onMouseUp() {
      const selection = window.getSelection()
      const text = selection?.toString().trim() ?? ''
      if (!text || !selection?.rangeCount || !pageFrameRef.current) return
      const pageRect = pageFrameRef.current.getBoundingClientRect()
      const rects = Array.from(selection.getRangeAt(0).getClientRects()).map((rect) => ({
        x: clamp((rect.left - pageRect.left) / pageRect.width),
        y: clamp((rect.top - pageRect.top) / pageRect.height),
        width: clamp(rect.width / pageRect.width),
        height: clamp(rect.height / pageRect.height),
      })).filter((rect) => rect.width > 0 && rect.height > 0)
      setSelectedText(text); setSelectedPage(pageNumber); setSelectedRects(rects); setSelectionMenuOpen(true)
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [pageNumber])
  const Document = pdfModules?.Document; const Page = pdfModules?.Page

  return <div className="min-h-[calc(100vh-3rem)]"><div className="mx-auto max-w-7xl space-y-5">
    <div className="reader-toolbar rounded-[2rem] border border-paper-300 bg-paper-50 p-4 shadow-xl dark:border-forest-800 dark:bg-forest-800/60 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><a href="/dashboard" className="rounded-xl border border-paper-300 bg-paper-100 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:border-forest-700 dark:bg-forest-900 dark:text-paper-100">← Dashboard</a><div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">E-Study Room</p><h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Reading session</h2></div></div><div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300"><div className="inline-flex items-center rounded-2xl border border-paper-300 bg-paper-100 dark:border-forest-700 dark:bg-forest-900"><button type="button" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber <= 1} className="px-3 py-2 disabled:opacity-40" aria-label="Previous page">←</button><span className="px-2 font-mono">{pageNumber} / {numPages ?? '...'}</span><button type="button" onClick={() => setPageNumber((page) => numPages ? Math.min(numPages, page + 1) : page + 1)} disabled={numPages ? pageNumber >= numPages : false} className="px-3 py-2 disabled:opacity-40" aria-label="Next page">→</button></div><div className="inline-flex items-center rounded-2xl border border-paper-300 bg-paper-100 dark:border-forest-700 dark:bg-forest-900"><button type="button" onClick={() => setScale((value) => Math.max(0.6, value - 0.1))} className="px-2.5 py-2" aria-label="Zoom out">−</button><button type="button" onClick={() => setScale(1)} className="px-2 py-2 font-mono">{Math.round(scale * 100)}%</button><button type="button" onClick={() => setScale((value) => Math.min(2, value + 0.1))} className="px-2.5 py-2" aria-label="Zoom in">+</button></div><button type="button" onClick={() => setScale(1)} className="reader-draw-button" title="Fit document to width">Fit</button><button type="button" onClick={activateNoteMode} className={`reader-draw-button ${noteMode ? 'reader-draw-button-active' : ''}`}>＋ Note</button>{noteMode ? <div className="reader-note-colors" aria-label="Note colors">{noteColors.map((color) => <button key={color} type="button" onClick={() => setNoteColor(color)} aria-label="Choose note color" className={noteColor === color ? 'reader-color-swatch reader-color-swatch-active' : 'reader-color-swatch'} style={{ backgroundColor: color }} />)}</div> : null}<button type="button" onClick={() => setActivePanel('notes')} className="reader-draw-button">Notes</button><button type="button" onClick={() => setActivePanel('highlights')} className="reader-draw-button">Highlights</button></div></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-paper-300/80 pt-3 dark:border-forest-700">{(['pen', 'marker', 'eraser'] as const).map((mode) => <button key={mode} type="button" onClick={() => setDrawMode(drawMode === mode ? null : mode)} className={`reader-draw-button capitalize ${drawMode === mode ? 'reader-draw-button-active' : ''}`}>{mode}</button>)}<button type="button" onClick={undo} disabled={!past.length} className="reader-draw-button">Undo</button><button type="button" onClick={redo} disabled={!future.length} className="reader-draw-button">Redo</button><button type="button" onClick={() => { if (window.confirm('Clear drawings from this page?')) persistStrokes([]) }} disabled={!strokes.length} className="reader-draw-button">Clear page</button><span className="reader-save-status" role="status">{drawingStatus === 'saving' ? 'Saving…' : drawingStatus === 'saved' ? 'Saved' : drawingStatus === 'error' ? 'Save failed' : ''}</span>{drawMode ? <><label className="ml-2 flex items-center gap-2 text-xs">Size <input type="range" min={drawMode === 'marker' ? 8 : 1} max={drawMode === 'marker' ? 32 : 10} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label><span className="font-mono text-xs">{brushSize}px</span></> : null}{(drawMode === 'pen' || drawMode === 'marker') ? <input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} aria-label="Pen color" className="h-7 w-8" /> : null}{drawMode === 'marker' ? <label className="flex items-center gap-2 text-xs">Opacity <input type="range" min="0.2" max="1" step="0.05" value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} /></label> : null}</div></div>
    <div className="reader-stage"><aside className="reader-sidebar" aria-label="Study tools"><p className="reader-sidebar-label">Study tools</p><button type="button" onClick={() => setActivePanel('notes')} className="reader-sidebar-button">Notes</button><button type="button" onClick={() => setActivePanel('highlights')} className="reader-sidebar-button">Highlights</button><button type="button" onClick={activateNoteMode} className={`reader-sidebar-button ${noteMode ? 'reader-sidebar-button-active' : ''}`}>Add note</button><button type="button" onClick={() => setDrawMode(drawMode === 'pen' ? null : 'pen')} className={`reader-sidebar-button ${drawMode === 'pen' ? 'reader-sidebar-button-active' : ''}`}>Pen</button><button type="button" onClick={() => setDrawMode(drawMode === 'marker' ? null : 'marker')} className={`reader-sidebar-button ${drawMode === 'marker' ? 'reader-sidebar-button-active' : ''}`}>Marker</button><button type="button" onClick={() => setDrawMode(drawMode === 'eraser' ? null : 'eraser')} className={`reader-sidebar-button ${drawMode === 'eraser' ? 'reader-sidebar-button-active' : ''}`}>Eraser</button><button type="button" onClick={undo} disabled={!past.length} className="reader-sidebar-button">Undo</button><button type="button" onClick={redo} disabled={!future.length} className="reader-sidebar-button">Redo</button></aside><div ref={workspaceRef} className="reader-workspace overflow-auto rounded-[2rem] border border-paper-300 bg-paper-50 p-4 shadow-xl dark:border-forest-800 dark:bg-forest-800/40"><div className="mb-4 rounded-2xl border border-paper-300 bg-paper-100/70 p-3 text-xs text-slate-600 dark:border-forest-700 dark:bg-forest-900/60 dark:text-slate-300">{noteMode ? 'Click on the page to place a note.' : 'Select text to highlight it or attach a note. Use the study tools as you read.'}</div>{selectionMenuOpen && selectedText ? <div className="reader-selection-menu mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pine-300 bg-pine-50 p-3 text-sm"><p className="min-w-0 flex-1 truncate">Selected on page {selectedPage}: “{selectedText}”</p><div className="flex gap-2"><button type="button" onClick={() => setActivePanel('highlights')} className="reader-tool-button">Highlight</button><button type="button" onClick={() => beginNewNote()} className="reader-tool-button">Add note</button><button type="button" onClick={() => { setSelectedText(null); setSelectionMenuOpen(false) }} className="reader-tool-button reader-tool-button-muted">Clear</button></div></div> : null}<div ref={pageFrameRef} className="reader-page-frame" style={{ width: pageWidth * scale }} onClick={handlePageClick}>{Document && Page ? <Document file={pdfUrl} onLoadSuccess={({ numPages: total }: { numPages: number }) => setNumPages(total)}><Page pageNumber={pageNumber} width={pageWidth * scale} onRenderSuccess={() => requestAnimationFrame(syncCanvas)} /></Document> : <div className="grid min-h-[500px] place-items-center text-sm text-slate-500">Loading reading room…</div>}<div className="reader-highlight-layer" aria-label="Saved highlights">{visibleHighlights.flatMap((highlight) => highlight.rects.map((rect, index) => <span key={`${highlight.id}-${index}`} className="reader-highlight" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: highlight.color || highlightColors[0] }} />))}</div><canvas ref={canvasRef} className={`reader-drawing-canvas ${drawMode ? 'reader-drawing-canvas-active' : ''}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishDrawing} onPointerCancel={finishDrawing} /><div className="reader-note-layer" aria-label="Page notes">{visibleNotes.map((note, index) => { const x = clamp(note.meta?.x ?? 0.84); const y = clamp(note.meta?.y ?? 0.12 + index * 0.08); const expanded = expandedNoteId === note.id; return <div key={note.id} className="reader-note-anchor" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}><button type="button" className="reader-note-pin" style={{ backgroundColor: note.meta?.color ?? noteColors[0] }} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDraggingNoteId(note.id) }} onPointerMove={(event) => { if (draggingNoteId === note.id) updateNotePosition(note, event.clientX, event.clientY) }} onPointerUp={(event) => { if (draggingNoteId === note.id) { setDraggingNoteId(null); void saveNotePosition(note, event.clientX, event.clientY) } }} onClick={() => setExpandedNoteId(expanded ? null : note.id)} aria-label={`Open note on page ${pageNumber}`} title={(note.text ?? 'Note').slice(0, 80)}>N</button>{expanded ? <div className="reader-note-bubble" style={{ '--note-color': note.meta?.color ?? noteColors[0] } as React.CSSProperties}><div className="flex items-start justify-between gap-2"><strong>{note.meta?.title || 'Study note'}</strong><button type="button" onClick={() => setExpandedNoteId(null)} aria-label="Collapse note">×</button></div>{note.selection_text ? <p className="reader-note-quote">“{note.selection_text}”</p> : null}<p className="mt-2 whitespace-pre-wrap text-xs leading-5">{note.text || 'Empty note'}</p><div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={() => setNoteDraft(note)} className="text-xs font-bold">Edit</button><button type="button" onClick={() => void deleteNote(note.id)} className="text-xs font-bold text-rose-700">Delete</button></div></div> : null}</div> })}</div></div>{readerError ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{readerError}</p> : null}</div></div>
  </div>
  {noteDraft ? <div className="study-panel-backdrop" role="presentation"><section className="reader-note-editor" role="dialog" aria-modal="true" aria-labelledby="note-editor-title"><div className="flex items-center justify-between"><h2 id="note-editor-title">{noteDraft.id ? 'Edit note' : 'New page note'}</h2><button type="button" onClick={() => setNoteDraft(null)} aria-label="Close note editor">×</button></div><label className="mt-5 block text-xs font-bold uppercase tracking-[0.16em]">Title<input value={noteDraft.meta?.title ?? ''} onChange={(event) => setNoteDraft({ ...noteDraft, meta: { ...(noteDraft.meta ?? {}), title: event.target.value } })} className="reader-editor-input" placeholder="Optional title" /></label><label className="mt-4 block text-xs font-bold uppercase tracking-[0.16em]">Your note<textarea autoFocus value={noteDraft.text ?? ''} onChange={(event) => setNoteDraft({ ...noteDraft, text: event.target.value })} className="reader-editor-input min-h-32" placeholder="Write what you want to remember…" /></label>{noteDraft.selection_text ? <div className="mt-3 rounded-xl bg-paper-100 p-3 text-xs text-slate-600">Selected text: “{noteDraft.selection_text}”</div> : null}<div className="mt-4 flex items-center gap-2"><span className="text-xs font-bold">Color</span>{noteColors.map((color) => <button key={color} type="button" aria-label={`Use ${color} note color`} onClick={() => setNoteDraft({ ...noteDraft, meta: { ...(noteDraft.meta ?? {}), color } })} className={`h-6 w-6 rounded-full border-2 ${noteDraft.meta?.color === color ? 'border-forest-900' : 'border-transparent'}`} style={{ backgroundColor: color }} />)}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setNoteDraft(null)} className="reader-tool-button reader-tool-button-muted">Cancel</button><button type="button" onClick={() => void persistNote()} disabled={savingNote || !noteDraft.text?.trim()} className="reader-tool-button">{savingNote ? 'Saving…' : 'Save note'}</button></div></section></div> : null}
  {activePanel ? <div className="study-panel-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActivePanel(null) }}><section className="study-panel-modal" role="dialog" aria-modal="true" aria-labelledby="study-panel-title"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Study workspace</p><h2 id="study-panel-title" className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{activePanel === 'notes' ? 'Notes' : 'Highlights'}</h2></div><button type="button" onClick={() => setActivePanel(null)} className="study-panel-close" aria-label="Close study panel">×</button></div><div className="mt-5">{activePanel === 'notes' ? <NotesPanel bookId={bookId} selectedText={selectedText ?? undefined} selectedPage={selectedPage ?? undefined} onChanged={() => void refreshNotes()} onSelectNote={(note) => { setActivePanel(null); setPageNumber(Number(note.page) || 1); window.setTimeout(() => setExpandedNoteId(note.id), 250) }} /> : <HighlightsPanel bookId={bookId} selectedText={selectedText ?? undefined} selectedPage={selectedPage ?? undefined} selectedRects={selectedRects} onClearSelection={() => { setSelectedText(null); setSelectedPage(null); setSelectedRects([]); setSelectionMenuOpen(false) }} />}</div></section></div> : null}
  </div>
}
