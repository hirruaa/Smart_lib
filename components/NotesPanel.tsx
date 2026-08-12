"use client"
import React, { useEffect, useMemo, useState } from 'react'
import NoteEditor from './NoteEditor'

type NotesPanelProps = {
  bookId: number
  selectedText?: string
  selectedPage?: number
}

export default function NotesPanel({ bookId, selectedText, selectedPage }: NotesPanelProps) {
  const [notes, setNotes] = useState<any[]>([])
  const [editing, setEditing] = useState<any | null>(null)

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

  async function handleSave(payload: any) {
    if (payload.id) {
      await fetch('/api/study/notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/study/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setEditing(null)
    await load()
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this note?')) return
    await fetch(`/api/study/notes?id=${id}`, { method: 'DELETE' })
    await load()
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

      {editing ? (
        <NoteEditor initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      ) : notes.length > 0 ? (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
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
                  <button onClick={() => setEditing(n)} className="font-semibold text-sky-600">Edit</button>
                  <button onClick={() => handleDelete(n.id)} className="font-semibold text-rose-600">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
          No notes yet — select text on the page to start a note, or click New to add one manually.
        </div>
      )}
    </div>
  )
}
