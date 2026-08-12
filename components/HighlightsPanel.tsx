"use client"
import React, { useEffect, useState } from 'react'

type Highlight = {
  id: number
  book_id: number
  page: number
  rects: unknown[]
  color: string
  selection_text: string | null
  created_at: string | null
}

export default function HighlightsPanel({
  bookId,
  selectedText,
  selectedPage,
  onClearSelection,
}: {
  bookId: number
  selectedText?: string
  selectedPage?: number
  onClearSelection?: () => void
}) {
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadHighlights() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/study/highlights?book_id=${bookId}`)
      const data = await res.json()
      setHighlights(data || [])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load highlights')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHighlights()
  }, [bookId])

  const createHighlight = async () => {
    if (!selectedText) return
    setSaving(true)
    setError(null)

    try {
      await fetch('/api/study/highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: bookId,
          page: selectedPage ?? 1,
          rects: [],
          color: 'yellow',
          note_id: null,
          meta: { selection_text: selectedText },
        }),
      })
      await loadHighlights()
      onClearSelection?.()
    } catch (err: any) {
      setError(err?.message ?? 'Unable to save highlight')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Highlights</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Capture selected text for later review.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {highlights.length} saved
        </span>
      </div>

      {selectedText ? (
        <div className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <p className="font-medium text-slate-900 dark:text-slate-100">Selected page {selectedPage ?? 1}</p>
          <p className="mt-2 break-words">“{selectedText.slice(0, 150)}{selectedText.length > 150 ? '...' : ''}”</p>
          <button
            type="button"
            onClick={createHighlight}
            disabled={saving}
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            {saving ? 'Saving highlight...' : 'Save highlight'}
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
          Select text on the page to create a highlight here.
        </div>
      )}

      {error ? (
        <div className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">Loading highlights…</div>
        ) : highlights.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
            You don’t have any highlights yet.
          </div>
        ) : (
          highlights.map((highlight) => (
            <div key={highlight.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
              <div className="flex items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
                <span>Page {highlight.page}</span>
                <span>{new Date(highlight.created_at ?? '').toLocaleDateString()}</span>
              </div>
              <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">“{highlight.selection_text ?? 'Text highlight'}”</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
