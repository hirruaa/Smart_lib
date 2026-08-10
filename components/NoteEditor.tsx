"use client"
import React, { useEffect, useState } from 'react'

type Props = {
  initial?: { id?: number; text?: string; selection_text?: string; page?: number }
  onSave: (payload: any) => Promise<void>
  onCancel?: () => void
}

export default function NoteEditor({ initial, onSave, onCancel }: Props) {
  const [text, setText] = useState(initial?.text ?? '')
  const [selection, setSelection] = useState(initial?.selection_text ?? '')
  const [page, setPage] = useState<number | undefined>(initial?.page)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setText(initial?.text ?? '')
    setSelection(initial?.selection_text ?? '')
    setPage(initial?.page)
  }, [initial])

  async function save() {
    setSaving(true)
    await onSave({ id: initial?.id, text, selection_text: selection, page })
    setSaving(false)
  }

  return (
    <div className="note-editor p-4 rounded-md border bg-white shadow">
      <label className="block text-sm font-medium text-slate-700">Page</label>
      <input value={page ?? ''} onChange={(e) => setPage(Number(e.target.value))} className="mt-1 mb-2 w-full rounded border px-2 py-1" />

      <label className="block text-sm font-medium text-slate-700">Selected Text</label>
      <textarea value={selection} onChange={(e) => setSelection(e.target.value)} className="mt-1 mb-2 w-full rounded border px-2 py-1" rows={2} />

      <label className="block text-sm font-medium text-slate-700">Note</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full rounded border px-2 py-1" rows={5} />

      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={saving} className="rounded bg-sky-600 px-3 py-1 text-white">{saving ? 'Saving...' : 'Save'}</button>
        <button onClick={onCancel} className="rounded border px-3 py-1">Cancel</button>
      </div>
    </div>
  )
}
