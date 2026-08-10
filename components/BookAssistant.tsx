"use client"

import { useState } from 'react'

type Book = {
  id: number
  title: string
  author: string
  category?: string
  description?: string
  pdf_url?: string | null
  available_copies?: number
}

export default function BookAssistant() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Book[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError(null)
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/recommend', { method: 'POST', body: JSON.stringify({ query }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Search failed')
      setResults(data.results || [])
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border p-4 bg-white shadow-sm">
      <h3 className="text-lg font-semibold">Ask the Library Assistant</h3>
      <p className="text-sm text-slate-500">Try: "machine learning" or "Shakespeare plays"</p>
      <form onSubmit={handleSearch} className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by topic, title, or description"
          className="flex-1 rounded-md border px-3 py-2"
        />
        <button type="submit" className="rounded-md bg-slate-900 px-4 text-white" disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error ? <div className="mt-3 text-sm text-rose-600">{error}</div> : null}

      <div className="mt-4 space-y-3">
        {results.map((b) => (
          <div key={b.id} className="border rounded-md p-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-slate-500">{b.category}</div>
                <h4 className="text-md font-semibold">{b.title}</h4>
                <div className="text-sm text-slate-600">by {b.author}</div>
              </div>
              <div className="text-sm text-slate-500">{b.available_copies ?? 0} copies</div>
            </div>
            {b.description ? <p className="mt-2 text-sm text-slate-700">{b.description.slice(0, 240)}{b.description.length>240?'...':''}</p> : null}
            <div className="mt-3 flex gap-2">
              {b.pdf_url ? (
                <a className="text-sm text-sky-600" href={b.pdf_url} target="_blank" rel="noreferrer">Open PDF</a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
