"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Point = { x: number; y: number }
type Stroke = { points: Point[]; color: string; width: number; opacity: number }
type Note = { id: number; page: number | null; text: string | null; selection_text: string | null; created_at?: string; meta?: { x?: number; y?: number; color?: string; title?: string } }
type Highlight = { id: number; page: number; rects: Array<{ x: number; y: number; width: number; height: number }>; color: string; meta?: { selection_text?: string } }
type PdfModules = { Document: any; Page: any }
const noteColors = ['#f6d77a', '#c9dfc8', '#c9dceb', '#f3c4b7']
const highlightColors = ['#f0c94b', '#9ed8aa', '#9ec9e8', '#efaaa0']
const highlightLabels = ['Definition', 'Key term', 'Example', 'Important', 'Question']
const drawingColors = [
  { name: 'Yellow', value: '#f0c94b' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22a06b' },
  { name: 'Red', value: '#e05a5a' },
  { name: 'Purple', value: '#8b5cf6' },
]
const penSizes = [2, 4, 6, 8]
const markerSizes = [10, 16, 24, 32]
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

export default function EReader({ bookId, pdfUrl, title }: { bookId: number; pdfUrl: string; title: string }) {
  const [numPages, setNumPages] = useState<number | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(1)
  const [pageWidth, setPageWidth] = useState(900)
  const setActivePanel = (panel: 'notes' | 'highlights' | null) => { if (panel === 'highlights') void createHighlight() }
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [selectedRects, setSelectedRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>([])
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false)
  const [drawMode, setDrawMode] = useState<'pen' | 'marker' | 'eraser' | null>(null)
  const [brushSize, setBrushSize] = useState(3)
  const [brushColor, setBrushColor] = useState('#263f3a')
  const [brushOpacity, setBrushOpacity] = useState(0.9)
  const [quickColors, setQuickColors] = useState(drawingColors)
  const [highlightPalette, setHighlightPalette] = useState(highlightColors)
  const [highlightNames, setHighlightNames] = useState(highlightLabels)
  const [highlightColor, setHighlightColor] = useState(highlightColors[0])
  const [readerTheme, setReaderTheme] = useState<'paper' | 'sepia' | 'dark'>('paper')
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
  const brushCursorRef = useRef<HTMLDivElement | null>(null)
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
    try {
      const saved = JSON.parse(window.localStorage.getItem(`smart-lib:reader-preferences:${bookId}`) || '{}')
      if (saved.brushColor) setBrushColor(saved.brushColor)
      if (saved.brushSize) setBrushSize(Number(saved.brushSize))
      if (saved.brushOpacity) setBrushOpacity(Number(saved.brushOpacity))
      if (Array.isArray(saved.quickColors) && saved.quickColors.length === 5) setQuickColors(saved.quickColors)
      if (Array.isArray(saved.highlightPalette) && saved.highlightPalette.length === 5) setHighlightPalette(saved.highlightPalette)
      if (Array.isArray(saved.highlightNames) && saved.highlightNames.length === 5) setHighlightNames(saved.highlightNames)
      if (saved.highlightColor) setHighlightColor(saved.highlightColor)
      if (saved.scale) setScale(Number(saved.scale))
      if (saved.readerTheme) setReaderTheme(saved.readerTheme)
    } catch { /* Use defaults when local preferences are unavailable. */ }
  }, [bookId])

  useEffect(() => {
    window.localStorage.setItem(`smart-lib:reader-preferences:${bookId}`, JSON.stringify({ brushColor, brushSize, brushOpacity, quickColors, highlightPalette, highlightNames, highlightColor, scale, readerTheme }))
  }, [bookId, brushColor, brushSize, brushOpacity, quickColors, highlightNames, highlightPalette, highlightColor, scale, readerTheme])

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
    const pageFrame = pageFrameRef.current
    if (!pageFrame) return
    const cursor = document.createElement('div')
    cursor.className = 'reader-brush-cursor'
    cursor.setAttribute('aria-hidden', 'true')
    pageFrame.appendChild(cursor)
    brushCursorRef.current = cursor
    return () => {
      cursor.remove()
      brushCursorRef.current = null
    }
  }, [])

  useEffect(() => {
    const cursor = brushCursorRef.current
    const canvas = canvasRef.current
    if (!cursor || !canvas) return
    cursor.style.width = `${brushSize}px`
    cursor.style.height = `${brushSize}px`
    cursor.style.borderColor = drawMode === 'eraser' ? 'rgba(38, 63, 58, .8)' : brushColor
    cursor.style.backgroundColor = drawMode === 'marker' ? `${brushColor}66` : drawMode === 'pen' ? `${brushColor}18` : 'rgba(255,255,255,.25)'
    cursor.dataset.tool = drawMode ?? ''
    cursor.style.display = drawMode ? 'block' : 'none'
    const moveCursor = (event: PointerEvent) => {
      if (!drawMode) return
      const rect = canvas.getBoundingClientRect()
      cursor.style.left = `${event.clientX - rect.left}px`
      cursor.style.top = `${event.clientY - rect.top}px`
      cursor.style.display = 'block'
    }
    const hideCursor = () => { cursor.style.display = 'none' }
    canvas.addEventListener('pointerenter', moveCursor)
    canvas.addEventListener('pointermove', moveCursor)
    canvas.addEventListener('pointerleave', hideCursor)
    return () => {
      canvas.removeEventListener('pointerenter', moveCursor)
      canvas.removeEventListener('pointermove', moveCursor)
      canvas.removeEventListener('pointerleave', hideCursor)
    }
  }, [brushColor, brushSize, drawMode])

  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.reader-toolbar .reader-draw-button.capitalize').forEach((button) => {
      const tool = button.textContent?.trim().toLowerCase() ?? ''
      button.dataset.brushTool = tool
      button.style.setProperty('--brush-preview-size', `${Math.max(4, Math.min(18, brushSize))}px`)
      button.style.setProperty('--brush-preview-color', tool === 'eraser' ? '#52635c' : brushColor)
      button.style.setProperty('--brush-preview-opacity', tool === 'marker' ? String(Math.max(.35, brushOpacity * .65)) : '1')
    })
  }, [brushColor, brushOpacity, brushSize, drawMode])

  useEffect(() => {
    document.querySelectorAll<HTMLButtonElement>('.reader-sidebar .reader-sidebar-button').forEach((button) => {
      const label = button.textContent?.trim() ?? ''
      if (label) {
        button.title = label
        button.setAttribute('aria-label', label)
      }
    })
  }, [])

  useEffect(() => {
    const menu = document.querySelector<HTMLElement>('.reader-selection-menu')
    if (!menu || !selectedText) return
    const palette = document.createElement('div')
    palette.className = 'reader-highlight-palette'
    palette.setAttribute('aria-label', 'Highlight color')
    highlightPalette.forEach((color, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'reader-highlight-swatch'
      button.style.backgroundColor = color
      button.dataset.active = String(highlightColor === color)
      button.title = highlightNames[index]
      button.setAttribute('aria-label', highlightNames[index])
      button.addEventListener('click', () => setHighlightColor(color))
      palette.appendChild(button)
    })
    const customize = document.createElement('button')
    customize.type = 'button'
    customize.className = 'reader-highlight-customize'
    customize.textContent = 'Customize'
    customize.addEventListener('click', () => {
      const index = Math.max(0, highlightPalette.indexOf(highlightColor))
      const name = window.prompt('Highlight label', highlightNames[index])?.trim()
      const color = window.prompt('Highlight color', highlightPalette[index])?.trim()
      if (!name || !color) return
      setHighlightNames((items) => items.map((item, itemIndex) => itemIndex === index ? name : item))
      setHighlightPalette((items) => items.map((item, itemIndex) => itemIndex === index ? color : item))
      setHighlightColor(color)
    })
    palette.appendChild(customize)
    const custom = document.createElement('input')
    custom.type = 'color'
    custom.value = highlightColor
    custom.className = 'reader-highlight-custom'
    custom.title = 'Customize highlight color'
    custom.setAttribute('aria-label', 'Customize highlight color')
    custom.addEventListener('input', (event) => {
      const color = (event.target as HTMLInputElement).value
      setHighlightColor(color)
      setHighlightPalette((items) => items.map((item, index) => index === 0 ? color : item))
    })
    palette.appendChild(custom)
    menu.appendChild(palette)
    return () => palette.remove()
  }, [highlightColor, highlightNames, highlightPalette, selectedText])

  useEffect(() => {
    const tool = document.querySelector<HTMLElement>('.reader-quick-drawing-tools')
    if (!tool) return
    const buttons = Array.from(tool.querySelectorAll<HTMLButtonElement>('.reader-quick-color')).slice(0, quickColors.length)
    const cleanups: Array<() => void> = []
    buttons.forEach((button, index) => {
      const color = quickColors[index]
      button.style.backgroundColor = color.value
      button.title = color.name
      button.setAttribute('aria-label', color.name)
      const chooseColor = (event: Event) => {
        event.preventDefault()
        event.stopPropagation()
        setBrushColor(color.value)
      }
      button.addEventListener('click', chooseColor, true)
      cleanups.push(() => button.removeEventListener('click', chooseColor, true))
    })
    const activeIndex = Math.max(0, quickColors.findIndex((color) => color.value.toLowerCase() === brushColor.toLowerCase()))
    const picker = document.createElement('input')
    picker.type = 'color'
    picker.className = 'reader-quick-color-picker'
    picker.value = quickColors[activeIndex].value
    picker.title = `Change ${quickColors[activeIndex].name} color`
    picker.setAttribute('aria-label', `Change ${quickColors[activeIndex].name} color`)
    const updateColor = (event: Event) => {
      const value = (event.target as HTMLInputElement).value
      setQuickColors((items) => items.map((item, index) => index === activeIndex ? { ...item, value } : item))
      setBrushColor(value)
    }
    picker.addEventListener('change', updateColor)
    tool.querySelector('.reader-quick-color-list')?.appendChild(picker)
    const sizes = drawMode === 'marker' ? markerSizes : penSizes
    tool.querySelectorAll<HTMLButtonElement>('.reader-size-preset').forEach((button, index) => {
      const size = sizes[index]
      if (size) {
        button.dataset.size = `${size}px`
        button.setAttribute('aria-label', `${size}px ${drawMode}`)
      }
    })
    return () => {
      cleanups.forEach((cleanup) => cleanup())
      picker.removeEventListener('change', updateColor)
      picker.remove()
    }
  }, [brushColor, quickColors, drawMode])

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
    const displayWidth = canvasRef.current?.clientWidth || pageWidth
    const radius = Math.max(0.012, brushSize / Math.max(320, displayWidth) / 2)
    const remaining = strokesRef.current.filter((stroke) => {
      for (let index = 1; index < stroke.points.length; index += 1) {
        const a = stroke.points[index - 1]; const b = stroke.points[index]; const dx = b.x - a.x; const dy = b.y - a.y; const length = dx * dx + dy * dy || 1
        const projection = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / length); const near = { x: a.x + projection * dx, y: a.y + projection * dy }
        if (Math.hypot(near.x - point.x, near.y - point.y) <= radius + stroke.width / displayWidth) return false
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

  function activateNoteMode() { setDrawMode(null); setNoteMode((value) => !value) }
  function beginNewNote(x = 0.5, y = 0.18) { setNoteMode(false); setNoteStatus('idle'); setNoteDraft({ id: 0, page: pageNumber, text: '', selection_text: selectedText ?? '', meta: { x, y, color: noteColor, title: '' } }) }
  async function persistNote() {
    if (!noteDraft?.text?.trim()) return
    setSavingNote(true); setNoteStatus('saving'); const isNew = !noteDraft.id
    const payload = { id: noteDraft.id || undefined, book_id: bookId, page: noteDraft.page ?? pageNumber, text: noteDraft.text, selection_text: noteDraft.selection_text ?? '', meta: noteDraft.meta ?? {} }
    const response = await fetch('/api/study/notes', { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (response.ok) { const saved = await response.json(); setNotes((items) => isNew ? [saved, ...items] : items.map((item) => item.id === saved.id ? saved : item)); setExpandedNoteId(saved.id); setNoteDraft(null); setNoteStatus('saved') } else setNoteStatus('error')
    setSavingNote(false)
  }
  async function deleteNote(id: number) { const response = await fetch(`/api/study/notes?id=${id}`, { method: 'DELETE' }); if (response.ok) { setNotes((items) => items.filter((item) => item.id !== id)); setExpandedNoteId(null) } }
  async function createHighlight() {
    if (!selectedText) return
    const response = await fetch('/api/study/highlights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ book_id: bookId, page: selectedPage ?? pageNumber, rects: selectedRects, color: highlightColor, note_id: null, meta: { selection_text: selectedText } }) })
    if (response.ok) { await refreshHighlights(); setSelectedText(null); setSelectedPage(null); setSelectedRects([]); setSelectionMenuOpen(false) }
  }
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

  function goToPage(nextPage: number) {
    const target = numPages ? Math.max(1, Math.min(numPages, nextPage)) : Math.max(1, nextPage)
    setPageNumber(target)
    window.requestAnimationFrame(() => workspaceRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  useEffect(() => {
    function onMouseUp() {
      const selection = window.getSelection()
      const text = selection?.toString().trim() ?? ''
      if (!text || !selection?.rangeCount || !pageFrameRef.current) return
      const range = selection.getRangeAt(0)
      const selectionNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer
      if (!selectionNode || !pageFrameRef.current.contains(selectionNode)) return
      const pageRect = pageFrameRef.current.getBoundingClientRect()
      const rects = Array.from(range.getClientRects()).map((rect) => ({
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

  return <div className={`reader-shell reader-theme-${readerTheme} min-h-[calc(100vh-3rem)]`}><div className="mx-auto max-w-7xl space-y-5">
    <div className="reader-toolbar rounded-[2rem] border border-paper-300 bg-paper-50 p-4 shadow-xl dark:border-forest-800 dark:bg-forest-800/60 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><a href="/dashboard" className="rounded-xl border border-paper-300 bg-paper-100 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:border-forest-700 dark:bg-forest-900 dark:text-paper-100">â† Dashboard</a><div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">E-Study Room</p><h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2></div></div><div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300"><div className="inline-flex items-center rounded-2xl border border-paper-300 bg-paper-100 dark:border-forest-700 dark:bg-forest-900"><button type="button" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber <= 1} className="px-3 py-2 disabled:opacity-40" aria-label="Previous page">â†</button><span className="px-2 font-mono">{pageNumber} / {numPages ?? '...'}</span><button type="button" onClick={() => setPageNumber((page) => numPages ? Math.min(numPages, page + 1) : page + 1)} disabled={numPages ? pageNumber >= numPages : false} className="px-3 py-2 disabled:opacity-40" aria-label="Next page">â†’</button></div><div className="inline-flex items-center rounded-2xl border border-paper-300 bg-paper-100 dark:border-forest-700 dark:bg-forest-900"><button type="button" onClick={() => setScale((value) => Math.max(0.6, value - 0.1))} className="px-2.5 py-2" aria-label="Zoom out">âˆ’</button><button type="button" onClick={() => setScale(1)} className="px-2 py-2 font-mono">{Math.round(scale * 100)}%</button><button type="button" onClick={() => setScale((value) => Math.min(2, value + 0.1))} className="px-2.5 py-2" aria-label="Zoom in">+</button></div><button type="button" onClick={() => setScale(1)} className="reader-draw-button" title="Fit document to width">Fit</button><button type="button" onClick={activateNoteMode} className={`reader-draw-button ${noteMode ? 'reader-draw-button-active' : ''}`}>ï¼‹ Note</button>{noteMode ? <div className="reader-note-colors" aria-label="Note colors">{noteColors.map((color) => <button key={color} type="button" onClick={() => setNoteColor(color)} aria-label="Choose note color" className={noteColor === color ? 'reader-color-swatch reader-color-swatch-active' : 'reader-color-swatch'} style={{ backgroundColor: color }} />)}</div> : null}<button type="button" onClick={() => setActivePanel('notes')} className="reader-draw-button">Notes</button><button type="button" onClick={() => void createHighlight()} className="reader-draw-button">Highlights</button></div></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-paper-300/80 pt-3 dark:border-forest-700">{(['pen', 'marker', 'eraser'] as const).map((mode) => <button key={mode} type="button" onClick={() => setDrawMode(drawMode === mode ? null : mode)} className={`reader-draw-button capitalize ${drawMode === mode ? 'reader-draw-button-active' : ''}`}>{mode}</button>)}<button type="button" onClick={undo} disabled={!past.length} className="reader-draw-button">Undo</button><button type="button" onClick={redo} disabled={!future.length} className="reader-draw-button">Redo</button><button type="button" onClick={() => { if (window.confirm('Clear drawings from this page?')) persistStrokes([]) }} disabled={!strokes.length} className="reader-draw-button">Clear page</button><span className="reader-save-status" role="status">{drawingStatus === 'saving' ? 'Savingâ€¦' : drawingStatus === 'saved' ? 'Saved' : drawingStatus === 'error' ? 'Save failed' : ''}</span>{drawMode ? <><label className="ml-2 flex items-center gap-2 text-xs">Size <input type="range" min={drawMode === 'marker' ? 8 : 1} max={drawMode === 'marker' ? 32 : 10} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label><span className="font-mono text-xs">{brushSize}px</span></> : null}{(drawMode === 'pen' || drawMode === 'marker') ? <input type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} aria-label="Pen color" className="h-7 w-8" /> : null}{drawMode === 'marker' ? <label className="flex items-center gap-2 text-xs">Opacity <input type="range" min="0.2" max="1" step="0.05" value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} /></label> : null}</div></div>
    <div className="reader-stage"><aside className="reader-sidebar" aria-label="Study tools"><p className="reader-sidebar-label">Study tools</p><div className="reader-sidebar-pages"><button type="button" onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1} aria-label="Previous page">←</button><span>Page {pageNumber} / {numPages ?? "…"}</span><button type="button" onClick={() => goToPage(pageNumber + 1)} disabled={numPages ? pageNumber >= numPages : false} aria-label="Next page">→</button></div><button type="button" onClick={() => setActivePanel('notes')} className="reader-sidebar-button">Notes</button><button type="button" onClick={() => setActivePanel('highlights')} className="reader-sidebar-button">Highlights</button><button type="button" onClick={activateNoteMode} className={`reader-sidebar-button ${noteMode ? 'reader-sidebar-button-active' : ''}`}>Add note</button><button type="button" onClick={() => setDrawMode(drawMode === 'pen' ? null : 'pen')} className={`reader-sidebar-button ${drawMode === 'pen' ? 'reader-sidebar-button-active' : ''}`}>Pen</button><button type="button" onClick={() => setDrawMode(drawMode === 'marker' ? null : 'marker')} className={`reader-sidebar-button ${drawMode === 'marker' ? 'reader-sidebar-button-active' : ''}`}>Marker</button><button type="button" onClick={() => setDrawMode(drawMode === 'eraser' ? null : 'eraser')} className={`reader-sidebar-button ${drawMode === 'eraser' ? 'reader-sidebar-button-active' : ''}`}>Eraser</button><button type="button" onClick={undo} disabled={!past.length} className="reader-sidebar-button">Undo</button><button type="button" onClick={redo} disabled={!future.length} className="reader-sidebar-button">Redo</button></aside><div ref={workspaceRef} className="reader-workspace overflow-auto rounded-[2rem] border border-paper-300 bg-paper-50 p-4 shadow-xl dark:border-forest-800 dark:bg-forest-800/40"><div className="mb-4 rounded-2xl border border-paper-300 bg-paper-100/70 p-3 text-xs text-slate-600 dark:border-forest-700 dark:bg-forest-900/60 dark:text-slate-300">{noteMode ? 'Click on the page to place a note.' : 'Select text to highlight it or attach a note. Use the study tools as you read.'}</div>{selectionMenuOpen && selectedText ? <div className="reader-selection-menu mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pine-300 bg-pine-50 p-3 text-sm"><p className="min-w-0 flex-1 truncate">Selected on page {selectedPage}: â€œ{selectedText}â€</p><div className="flex gap-2"><button type="button" onClick={() => setActivePanel('highlights')} className="reader-tool-button">Highlight</button><button type="button" onClick={() => beginNewNote()} className="reader-tool-button">Add note</button><button type="button" onClick={() => { setSelectedText(null); setSelectionMenuOpen(false) }} className="reader-tool-button reader-tool-button-muted">Clear</button></div></div> : null}<div ref={pageFrameRef} className="reader-page-frame" style={{ width: pageWidth * scale }} onClick={handlePageClick}>{Document && Page ? <Document file={pdfUrl} onLoadSuccess={({ numPages: total }: { numPages: number }) => setNumPages(total)}><Page pageNumber={pageNumber} width={pageWidth * scale} onRenderSuccess={() => requestAnimationFrame(syncCanvas)} /></Document> : <div className="grid min-h-[500px] place-items-center text-sm text-slate-500">Loading reading roomâ€¦</div>}<div className="reader-highlight-layer" aria-label="Saved highlights">{visibleHighlights.flatMap((highlight) => highlight.rects.map((rect, index) => <span key={`${highlight.id}-${index}`} className="reader-highlight" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: highlight.color || highlightColors[0] }} />))}</div><canvas ref={canvasRef} className={`reader-drawing-canvas ${drawMode ? 'reader-drawing-canvas-active' : ''}`} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={finishDrawing} onPointerCancel={finishDrawing} /><div className="reader-note-layer" aria-label="Page notes">{visibleNotes.map((note, index) => { const x = clamp(note.meta?.x ?? 0.84); const y = clamp(note.meta?.y ?? 0.12 + index * 0.08); const expanded = expandedNoteId === note.id; return <div key={note.id} className="reader-note-anchor" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}><button type="button" className="reader-note-pin" style={{ backgroundColor: note.meta?.color ?? noteColors[0] }} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDraggingNoteId(note.id) }} onPointerMove={(event) => { if (draggingNoteId === note.id) updateNotePosition(note, event.clientX, event.clientY) }} onPointerUp={(event) => { if (draggingNoteId === note.id) { setDraggingNoteId(null); void saveNotePosition(note, event.clientX, event.clientY) } }} onClick={() => setExpandedNoteId(expanded ? null : note.id)} aria-label={`Open note on page ${pageNumber}`} title={(note.text ?? 'Note').slice(0, 80)}>N</button>{expanded ? <div className="reader-note-bubble" style={{ '--note-color': note.meta?.color ?? noteColors[0] } as React.CSSProperties}><div className="flex items-start justify-between gap-2"><strong>{note.meta?.title || 'Study note'}</strong><button type="button" onClick={() => setExpandedNoteId(null)} aria-label="Collapse note">Ã—</button></div>{note.selection_text ? <p className="reader-note-quote">â€œ{note.selection_text}â€</p> : null}<p className="mt-2 whitespace-pre-wrap text-xs leading-5">{note.text || 'Empty note'}</p><div className="mt-3 flex items-center justify-between gap-2"><button type="button" onClick={() => setNoteDraft(note)} className="text-xs font-bold">Edit</button><button type="button" onClick={() => void deleteNote(note.id)} className="text-xs font-bold text-rose-700">Delete</button></div></div> : null}</div> })}</div></div>{drawMode === 'pen' || drawMode === 'marker' ? <div className="reader-quick-drawing-tools" aria-label="Quick drawing options"><span className="reader-quick-drawing-label">{drawMode === 'marker' ? 'Marker' : 'Pen'} options</span><div className="reader-quick-color-list">{drawingColors.map((color) => <button key={color.value} type="button" onClick={() => setBrushColor(color.value)} className={`reader-quick-color ${brushColor === color.value ? 'reader-quick-color-active' : ''}`} style={{ backgroundColor: color.value }} aria-label={`${color.name} ${drawMode}`} title={`${color.name} ${drawMode}`} />)}</div><div className="reader-size-presets" aria-label={`${drawMode} size presets`}>{(drawMode === 'marker' ? markerSizes : penSizes).map((size) => <button key={size} type="button" onClick={() => setBrushSize(size)} className={`reader-size-preset ${brushSize === size ? 'reader-size-preset-active' : ''}`} aria-label={`${size} pixel ${drawMode}`} title={`${size}px`}> <span style={{ width: `${Math.max(5, Math.min(18, size / 2))}px`, height: `${Math.max(5, Math.min(18, size / 2))}px` }} /></button>)}</div><label className="reader-quick-size">Fine <input type="range" min={drawMode === 'marker' ? 8 : 1} max={drawMode === 'marker' ? 32 : 10} value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /><span>{brushSize}px</span></label>{drawMode === 'marker' ? <label className="reader-quick-size">Opacity <input type="range" min="0.2" max="1" step="0.05" value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} /></label> : null}</div> : null}<div className="reader-page-navigation" aria-label="Page navigation"><button type="button" onClick={() => goToPage(pageNumber - 1)} disabled={pageNumber <= 1} className="reader-page-navigation-button">â† Previous page</button><span>Page {pageNumber} of {numPages ?? '...'}</span><button type="button" onClick={() => goToPage(pageNumber + 1)} disabled={numPages ? pageNumber >= numPages : false} className="reader-page-navigation-button">Next page â†’</button></div>{readerError ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{readerError}</p> : null}</div></div>
  </div>
  {noteDraft ? <div className="study-panel-backdrop" role="presentation"><section className="reader-note-editor" role="dialog" aria-modal="true" aria-labelledby="note-editor-title"><div className="flex items-center justify-between"><h2 id="note-editor-title">{noteDraft.id ? 'Edit note' : 'New page note'}</h2><button type="button" onClick={() => setNoteDraft(null)} aria-label="Close note editor">Ã—</button></div><label className="mt-5 block text-xs font-bold uppercase tracking-[0.16em]">Title<input value={noteDraft.meta?.title ?? ''} onChange={(event) => setNoteDraft({ ...noteDraft, meta: { ...(noteDraft.meta ?? {}), title: event.target.value } })} className="reader-editor-input" placeholder="Optional title" /></label><label className="mt-4 block text-xs font-bold uppercase tracking-[0.16em]">Your note<textarea autoFocus value={noteDraft.text ?? ''} onChange={(event) => setNoteDraft({ ...noteDraft, text: event.target.value })} className="reader-editor-input min-h-32" placeholder="Write what you want to rememberâ€¦" /></label>{noteDraft.selection_text ? <div className="mt-3 rounded-xl bg-paper-100 p-3 text-xs text-slate-600">Selected text: â€œ{noteDraft.selection_text}â€</div> : null}<div className="mt-4 flex items-center gap-2"><span className="text-xs font-bold">Color</span>{noteColors.map((color) => <button key={color} type="button" aria-label={`Use ${color} note color`} onClick={() => setNoteDraft({ ...noteDraft, meta: { ...(noteDraft.meta ?? {}), color } })} className={`h-6 w-6 rounded-full border-2 ${noteDraft.meta?.color === color ? 'border-forest-900' : 'border-transparent'}`} style={{ backgroundColor: color }} />)}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setNoteDraft(null)} className="reader-tool-button reader-tool-button-muted">Cancel</button><button type="button" onClick={() => void persistNote()} disabled={savingNote || !noteDraft.text?.trim()} className="reader-tool-button">{savingNote ? 'Savingâ€¦' : 'Save note'}</button></div></section></div> : null}
  </div>
}
