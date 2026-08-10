"use client"
import React, { useEffect, useState } from 'react'
import NoteEditor from './NoteEditor'

export default function NotesPanel({ bookId }: { bookId: number }) {
  const [notes, setNotes] = useState<any[]>([])
  const [editing, setEditing] = useState<any | null>(null)

  async function load() {
    const res = await fetch(`/api/study/notes?book_id=${bookId}`)
    const data = await res.json()
    setNotes(data || [])
  }

  useEffect(() => { load() }, [bookId])

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
    <div className="notes-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Notes</h3>
        <button onClick={() => setEditing({})} className="text-sm text-sky-600">New</button>
      </div>

      {editing ? (
        <NoteEditor initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded border p-2">
              <div className="flex justify-between">
                <div>
                  <div className="text-xs text-slate-500">Page {n.page}</div>
                  <div className="text-sm font-medium">{n.selection_text ? `“${n.selection_text.slice(0,80)}”` : ''}</div>
                  <div className="mt-1 text-sm">{n.text}</div>
                </div>
                <div className="ml-2 flex flex-col gap-1">
                  <button onClick={() => setEditing(n)} className="text-xs text-sky-600">Edit</button>
                  <button onClick={() => handleDelete(n.id)} className="text-xs text-rose-600">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
