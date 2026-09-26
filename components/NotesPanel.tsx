"use client"
import React, { useEffect, useMemo, useState } from 'react'
import NoteEditor from './NoteEditor'

type NotesPanelProps = {
  bookId: number
  selectedText?: string
  selectedPage?: number
  onChanged?: () => void
  onSelectNote?: (note: any) => void
}

export default function NotesPanel({ bookId, selectedText, selectedPage, onChanged, onSelectNote }: NotesPanelProps) {
  const [notes, setNotes] = useState<any[]>([])
  const [editing, setEditing] = useState<any | null>(null)
  const [query, setQuery] = useState('')
  const [pageFilter, setPageFilter] = useState('')

  async function load() {
    const res = await fetch(`/api/study/notes?book_id=${bookId}`)
    const data = await res.json()
    setNotes(data || [])
  }

  useEffect(() => {
    load()
  }, [bookId])

  useEffect(() => {
    if (selectedText && selectedPage && !editing) {
      setEditing({ selection_text: selectedText, page: selectedPage, text: '' })
    }
  }, [selectedText, selectedPage, editing])

  const noteCount = useMemo(() => notes.length, [notes])
  const filteredNotes = useMemo(() => notes.filter((note) => {
    const haystack = `${note.text ?? ''} ${note.selection_text ?? ''}`.toLowerCase()
    return (!query || haystack.includes(query.toLowerCase())) && (!pageFilter || String(note.page ?? '') === pageFilter)
  }), [notes, pageFilter, query])

  async function handleSave(payload: any) {
    if (payload.id) {
      await fetch('/api/study/notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/study/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setEditing(null)
    await load()
    onChanged?.()
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this note?')) return
    await fetch(`/api/study/notes?id=${id}`, { method: 'DELETE' })
    await load()
    onChanged?.()
  }

  return (
    <div className="notes-panel">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Study notes</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{noteCount} note{noteCount === 1 ? '' : 's'}</p>
        </div>
        <button
          onClick={() => setEditing({ page: selectedPage ?? 1, selection_text: selectedText ?? '', text: '' })}
          className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          New
        </button>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_110px]">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" aria-label="Search notes" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
        <input value={pageFilter} onChange={(event) => setPageFilter(event.target.value.replace(/[^0-9]/g, ''))} placeholder="Page" aria-label="Filter notes by page" inputMode="numeric" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
      </div>

      {editing ? (
        <NoteEditor initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      ) : filteredNotes.length > 0 ? (
        <ul className="space-y-3">
          {filteredNotes.map((n) => (
            <li key={n.id} className="cursor-pointer rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 transition hover:border-pine-300 dark:border-slate-700 dark:bg-slate-950/70" onClick={() => onSelectNote?.(n)}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  <span>Page {n.page || '—'}</span>
                  <span>{new Date(n.created_at ?? '').toLocaleDateString()}</span>
                </div>
                {n.selection_text ? (
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">“{n.selection_text.slice(0, 100)}”</p>
                ) : null}
                <p className="text-sm leading-6 text-slate-700 dark:text-slate-300">{n.text || 'No additional note text.'}</p>
                <div className="flex gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <button onClick={(event) => { event.stopPropagation(); setEditing(n) }} className="font-semibold text-sky-600">Edit</button>
                  <button onClick={(event) => { event.stopPropagation(); void handleDelete(n.id) }} className="font-semibold text-rose-600">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
          {notes.length ? 'No notes match the current filters.' : 'No notes yet — select text on the page to start a note, or click New to add one manually.'}
        </div>
      )}
    </div>
  )
}
