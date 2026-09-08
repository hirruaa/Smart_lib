'use client'

import { useEffect, useRef, useState } from 'react'

type Book = {
  id: number
  title: string
  author: string
  category?: string
  description?: string
  pdf_url?: string | null
}

type Loan = {
  id: number
  status: string
  due_date?: string | null
  books?: { title?: string; author?: string } | null
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  results?: Book[]
  loans?: Loan[]
}

type ChatSession = { id: string; title: string; updated_at?: string }

const starterPrompts = [
  'Find resources on distributed systems',
  'What books do I currently have?',
  'How long can I borrow a digital book?',
]

const initialMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hi, I am your library assistant. Ask me to find a resource, explain a lending policy, or check your current access.',
}

export default function BookAssistant() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function loadSession() {
      try {
        const response = await fetch('/api/assistant/sessions')
        if (!response.ok) throw new Error('Session storage unavailable')
        const data = await response.json()
        if (cancelled) return
        setSessions(data.sessions ?? [])
        const active = data.sessions?.[0]
        if (active) {
          setSessionId(active.id)
          const messagesResponse = await fetch(`/api/assistant/sessions?session_id=${active.id}`)
          const messagesData = await messagesResponse.json()
          if (!cancelled && messagesData.messages?.length) setMessages(messagesData.messages.map((message: any) => ({ id: String(message.id), role: message.role, text: message.content, results: message.results, loans: message.loans })))
        } else {
          const created = await fetch('/api/assistant/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
          const createdData = await created.json()
          if (!cancelled && createdData.session) {
            setSessionId(createdData.session.id)
            setSessions([createdData.session])
          }
        }
      } catch {
        try {
          const saved = window.localStorage.getItem('smart-lib-assistant-session')
          if (saved && !cancelled) setMessages(JSON.parse(saved))
        } catch {
          // Keep the welcome message when browser storage is unavailable.
        }
      }
    }
    void loadSession()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('smart-lib-assistant-session', JSON.stringify(messages))
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  const handleSearch = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const trimmedQuery = query.trim()
    if (!trimmedQuery || loading) return

    const userMessage = { id: `${Date.now()}-user`, role: 'user' as const, text: trimmedQuery }
    setMessages((current) => [...current, userMessage])
    setQuery('')
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmedQuery }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'The assistant could not answer right now.')
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        text: data.answer || 'I could not find an answer for that request.',
        results: data.results || [],
        loans: data.loans || [],
      }
      setMessages((current) => [...current, assistantMessage])
      if (sessionId) {
        await Promise.all([
          fetch('/api/assistant/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, role: 'user', content: userMessage.text }) }),
          fetch('/api/assistant/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, role: 'assistant', content: assistantMessage.text, results: assistantMessage.results, loans: assistantMessage.loans }) }),
        ])
      }
    } catch (err: any) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  const clearSession = () => {
    async function createNewSession() {
      setMessages([initialMessage])
      setError(null)
      const response = await fetch('/api/assistant/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await response.json()
      if (data.session) {
        setSessionId(data.session.id)
        setSessions((current) => [data.session, ...current])
      }
    }
    void createNewSession()
  }

  const selectSession = async (selectedSession: ChatSession) => {
    setSessionId(selectedSession.id)
    const response = await fetch(`/api/assistant/sessions?session_id=${selectedSession.id}`)
    const data = await response.json()
    setMessages(data.messages?.length ? data.messages.map((message: any) => ({ id: String(message.id), role: message.role, text: message.content, results: message.results, loans: message.loans })) : [initialMessage])
  }

  return (
    <section id="research" className="assistant-panel assistant-chat-panel">
      <div className="assistant-heading">
        <div className="assistant-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3 13.7 9.3 20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z" strokeLinecap="round" strokeLinejoin="round" /><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6L19 17Z" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <div className="assistant-heading-copy"><p className="assistant-kicker">Research desk</p><h2>Library assistant</h2><p>A focused conversation for discovery, policy, and access.</p></div>
        <button type="button" className="assistant-clear" onClick={clearSession}>New chat</button>
      </div>

      {sessions.length > 0 ? <div className="assistant-session-list" aria-label="Chat sessions">{sessions.slice(0, 5).map((session) => <button key={session.id} type="button" className={session.id === sessionId ? 'active' : ''} onClick={() => void selectSession(session)}>{session.title}</button>)}</div> : null}

      <div className="assistant-thread" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`assistant-message assistant-message-${message.role}`}>
            <div className="assistant-avatar">{message.role === 'assistant' ? 'S' : 'You'}</div>
            <div className="assistant-message-body">
              <p>{message.text}</p>
              {message.loans?.length ? <div className="assistant-inline-results">{message.loans.map((loan) => <div key={loan.id} className="assistant-result"><strong>{loan.books?.title || 'Book'}</strong><span>{loan.status}{loan.due_date ? ` · expires ${new Date(loan.due_date).toLocaleDateString()}` : ''}</span></div>)}</div> : null}
              {message.results?.length ? <div className="assistant-inline-results">{message.results.map((book) => <div key={book.id} className="assistant-result"><div><span className="assistant-result-category">{book.category}</span><h3>{book.title}</h3><span>{book.author}</span></div>{book.pdf_url ? <a href={book.pdf_url} target="_blank" rel="noreferrer">Open</a> : null}</div>)}</div> : null}
            </div>
          </div>
        ))}
        {loading ? <div className="assistant-message assistant-message-assistant"><div className="assistant-avatar">S</div><div className="assistant-typing"><span /><span /><span /></div></div> : null}
        <div ref={endRef} />
      </div>

      {messages.length === 1 ? <div className="assistant-suggestions">{starterPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => setQuery(prompt)}>{prompt}</button>)}</div> : null}
      {error ? <div className="assistant-error">{error}</div> : null}

      <form onSubmit={handleSearch} className="assistant-composer">
        <textarea value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSearch() } }} placeholder="Message your library assistant..." rows={1} aria-label="Message your library assistant" />
        <button type="submit" className="assistant-submit" disabled={loading || !query.trim()} aria-label="Send message">Send</button>
      </form>
      <p className="assistant-disclaimer">Assistant responses are based on your library catalog and account data.</p>
    </section>
  )
}
