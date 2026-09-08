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

type Loan = {
  id: number
  status: string
  due_date?: string | null
  books?: { title?: string; author?: string } | null
}

export default function BookAssistant() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Book[]>([])
  const [answer, setAnswer] = useState<string | null>(null)
  const [loans, setLoans] = useState<Loan[]>([])
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
      setAnswer(data.answer || null)
      setResults(data.results || [])
      setLoans(data.loans || [])
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section id="research" className="assistant-panel">
      <div className="assistant-heading">
        <div className="assistant-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3 13.7 9.3 20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z" strokeLinecap="round" strokeLinejoin="round" /><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6L19 17Z" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <div><p className="assistant-kicker">Research desk</p><h2>Ask the library assistant</h2><p>Search the collection, explore a topic, or check your current access.</p></div>
      </div>
      <form onSubmit={handleSearch} className="assistant-form">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by topic, title, or description"
          className="assistant-input"
        />
        <button type="submit" className="assistant-submit" disabled={loading}>
          Ask
        </button>
      </form>

      {error ? <div className="assistant-error">{error}</div> : null}
      {answer ? <p className="assistant-answer">{answer}</p> : null}

      {loans.length > 0 ? (
        <div className="assistant-results">
          {loans.map((loan) => (
            <div key={loan.id} className="assistant-result">
              <div className="font-semibold">{loan.books?.title || 'Book'}</div>
              <div className="assistant-result-meta">
                {loan.status} {loan.due_date ? `· access expires ${new Date(loan.due_date).toLocaleDateString()}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="assistant-results">
        {results.map((b) => (
          <div key={b.id} className="assistant-result">
            <div className="flex items-start justify-between">
              <div>
                <div className="assistant-result-category">{b.category}</div>
                <h3>{b.title}</h3>
                <div className="assistant-result-meta">by {b.author}</div>
              </div>
              <div className="assistant-result-meta">Digital resource</div>
            </div>
            {b.description ? <p className="assistant-description">{b.description.slice(0, 240)}{b.description.length>240?'...':''}</p> : null}
            <div className="assistant-actions">
              {b.pdf_url ? (
                <a href={b.pdf_url} target="_blank" rel="noreferrer">Open resource</a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
