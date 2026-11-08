'use client'

import { useEffect, useRef, useState } from 'react'

type Book = {
  id: number
  title: string
  author: string
  category?: string
  description?: string
  has_document?: boolean
}

type Loan = {
  id: number
  type?: string
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
  'What should I do if I lost a book?',
  'How much are overdue fines?',
  'What books do I currently have borrowed?',
]

const initialMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hello! I am your Smart Lib Assistant for Mary the Queen College. Ask me any question or concern — how overdue fines work, what to do if a book is lost, borrowing rules, library clearance, or book recommendations.',
}

function getSessionTitle(message: string) {
  const title = message.trim().replace(/\s+/g, ' ')
  return title.length > 48 ? `${title.slice(0, 45).trimEnd()}...` : title
}

export default function BookAssistant() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sessionLoadedRef = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || sessionLoadedRef.current) return
    sessionLoadedRef.current = true
    let cancelled = false
    async function loadSession() {
      try {
        const response = await fetch('/api/assistant/sessions')
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || 'Unable to load saved conversations.')
        if (cancelled) return
        setSessions(data.sessions ?? [])
        const active = data.sessions?.[0]
        if (active) {
          setSessionId(active.id)
          const messagesResponse = await fetch(`/api/assistant/sessions?session_id=${encodeURIComponent(active.id)}`)
          const messagesData = await messagesResponse.json().catch(() => ({}))
          if (!messagesResponse.ok) throw new Error(messagesData?.error || 'Unable to load this conversation.')
          if (!cancelled && messagesData.messages?.length) {
            setMessages(messagesData.messages.map((message: any) => ({ id: String(message.id), role: message.role, text: message.content, results: message.results, loans: message.loans })))
          }
        }
      } catch {
        if (cancelled) return
        setError('Saved conversations are unavailable. You can still chat, but this conversation may not be saved.')
        try {
          const saved = window.localStorage.getItem('smart-lib-assistant-session')
          if (saved) {
            const restored = JSON.parse(saved)
            if (Array.isArray(restored)) setMessages(restored)
          }
        } catch {
          setMessages([initialMessage])
        }
      }
    }
    void loadSession()
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    try {
      window.localStorage.setItem('smart-lib-assistant-session', JSON.stringify(messages))
    } catch {
      setError((current) => current ?? 'Browser storage is unavailable. This conversation will not be saved on this device.')
    }
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
      let activeSessionId = sessionId
      let sessionSaveWarning: string | null = null
      if (!activeSessionId) {
        try {
          const created = await fetch('/api/assistant/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: getSessionTitle(trimmedQuery) }),
          })
          const createdData = await created.json().catch(() => ({}))
          if (!created.ok || !createdData.session) throw new Error(createdData?.error || 'Unable to start a new conversation.')
          activeSessionId = createdData.session.id
          setSessionId(activeSessionId)
          setSessions((current) => [createdData.session, ...current.filter((session) => session.id !== createdData.session.id)])
        } catch (err: unknown) {
          sessionSaveWarning = err instanceof Error ? err.message : 'Unable to save this conversation.'
        }
      } else {
        setSessions((current) => current.map((session) => (
          session.id === activeSessionId && session.title === 'New research chat'
            ? { ...session, title: getSessionTitle(trimmedQuery) }
            : session
        )))
      }
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: trimmedQuery,
          history: messages.slice(-8).map(({ role, text }) => ({ role, content: text })),
        }),
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
      if (activeSessionId) {
        void (async () => {
          for (const message of [
            { role: 'user', content: userMessage.text },
            { role: 'assistant', content: assistantMessage.text, results: assistantMessage.results, loans: assistantMessage.loans },
          ]) {
            const saveResponse = await fetch('/api/assistant/sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: activeSessionId, ...message }),
            })
            const saveData = await saveResponse.json().catch(() => ({}))
            if (!saveResponse.ok) throw new Error(saveData?.error || 'Unable to save this conversation.')
          }
        })().catch((err: unknown) => {
          const detail = err instanceof Error ? err.message : 'Unable to save this conversation.'
          setError(`Your reply is ready, but something went wrong while saving chat history. ${detail}`)
        })
      } else if (sessionSaveWarning) {
        setError(`Your chat is available, but it will not appear in saved conversations. ${sessionSaveWarning}`)
      }
    } catch (err: any) {
      setError(err.message || String(err))
      setQuery(trimmedQuery)
      setMessages((current) => current.filter((message) => message.id !== userMessage.id))
    } finally {
      setLoading(false)
    }
  }

  const clearSession = () => {
    setSessionId(null)
    setMessages([initialMessage])
    setQuery('')
    setError(null)
  }

  const selectSession = async (selectedSession: ChatSession) => {
    try {
      const response = await fetch(`/api/assistant/sessions?session_id=${encodeURIComponent(selectedSession.id)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Unable to load this conversation.')
      setSessionId(selectedSession.id)
      setMessages(data.messages?.length ? data.messages.map((message: any) => ({ id: String(message.id), role: message.role, text: message.content, results: message.results, loans: message.loans })) : [initialMessage])
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load this conversation.')
    }
  }

  const deleteSession = async (selectedSession: ChatSession) => {
    if (deletingSessionId) return
    setDeletingSessionId(selectedSession.id)
    setError(null)
    const previousSessions = sessions
    const previousSessionId = sessionId
    const previousMessages = messages
    const remaining = sessions.filter((session) => session.id !== selectedSession.id)

    // Remove it locally before the round trip completes so the list reflects
    // the user's action immediately. Restore the previous state if deletion fails.
    setSessions(remaining)
    setConfirmDeleteSessionId(null)
    if (selectedSession.id === sessionId) {
      const nextSession = remaining[0]
      setSessionId(nextSession?.id ?? null)
      setMessages([initialMessage])
    }

    try {
      const response = await fetch(`/api/assistant/sessions?session_id=${encodeURIComponent(selectedSession.id)}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Unable to delete this conversation.')

      if (selectedSession.id === sessionId) {
        const nextSession = remaining[0]
        if (nextSession) {
          try {
            await selectSession(nextSession)
          } catch {
            setError('The conversation was deleted, but the next chat could not be loaded.')
          }
        } else {
          setSessionId(null)
          setMessages([initialMessage])
          window.localStorage.setItem('smart-lib-assistant-session', JSON.stringify([initialMessage]))
        }
      }
    } catch (err: any) {
      setSessions(previousSessions)
      setSessionId(previousSessionId)
      setMessages(previousMessages)
      setError(err.message || 'Unable to delete this conversation.')
    } finally {
      setDeletingSessionId(null)
    }
  }

  return (
    <>
      {!open ? <button type="button" className="assistant-launcher" onClick={() => setOpen(true)} aria-label="Open library assistant"><span className="assistant-launcher-mark" aria-hidden="true">✦</span><span className="assistant-launcher-label">Ask the library</span></button> : null}
      {open ? <section id="research" className="assistant-panel assistant-chat-panel assistant-floating-window" aria-label="Library assistant chat">
      <div className="assistant-heading">
        <div className="assistant-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3 13.7 9.3 20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z" strokeLinecap="round" strokeLinejoin="round" /><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6L19 17Z" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <div className="assistant-heading-copy"><p className="assistant-kicker">Research desk</p><h2>Library assistant</h2><p>A focused conversation for discovery, policy, and access.</p></div>
        <div className="assistant-window-actions"><button type="button" className="assistant-clear" onClick={clearSession}>New chat</button><button type="button" className="assistant-window-close" onClick={() => setOpen(false)} aria-label="Minimize library assistant">−</button></div>
      </div>

      {sessions.length > 0 ? <>
        <div className="assistant-session-heading"><span>Recent chats</span><span>{sessions.length} saved</span></div>
        <div className="assistant-session-list" aria-label="Recent chats">{sessions.slice(0, 5).map((session, index) => {
          const title = session.title === 'New research chat' ? `Untitled chat ${index + 1}` : session.title
          return <div key={session.id} className={`assistant-session-item ${session.id === sessionId ? 'active' : ''}`}><button type="button" className="assistant-session-select" onClick={() => void selectSession(session)}>{title}</button>{confirmDeleteSessionId === session.id ? <span className="assistant-session-confirm"><span>{deletingSessionId === session.id ? 'Deleting…' : 'Delete?'}</span><button type="button" onClick={() => void deleteSession(session)} disabled={deletingSessionId !== null} aria-label={`Confirm deleting ${title}`}>Yes</button><button type="button" onClick={() => setConfirmDeleteSessionId(null)} disabled={deletingSessionId !== null} aria-label="Cancel deleting conversation">No</button></span> : <button type="button" className="assistant-session-delete" onClick={() => setConfirmDeleteSessionId(session.id)} disabled={deletingSessionId !== null} aria-label={`Delete ${title}`} title="Delete conversation">×</button>}</div>
        })}</div>
      </> : null}

      <div className="assistant-thread" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`assistant-message assistant-message-${message.role}`}>
            <div className="assistant-avatar" aria-hidden="true">{message.role === 'assistant' ? 'S' : 'You'}</div>
            <div className="assistant-message-body">
              <p>{message.text}</p>
              {message.loans?.length ? <div className="assistant-inline-results">{message.loans.map((loan, index) => <div key={`${message.id}-loan-${loan.id ?? index}`} className="assistant-result"><div><strong>{loan.books?.title || 'Book'}</strong><span className="block text-xs text-slate-500">{loan.type ? `${loan.type} · ` : ''}{loan.status}{loan.due_date ? ` · due ${new Date(loan.due_date).toLocaleDateString()}` : ''}</span></div></div>)}</div> : null}
              {message.results?.length ? <div className="assistant-inline-results">{message.results.map((book, index) => <div key={`${message.id}-book-${book.id ?? index}`} className="assistant-result"><div><span className="assistant-result-category">{book.category}</span><h3>{book.title}</h3><span>{book.author}</span></div>{book.has_document ? <a href={`/reader/${book.id}`}>Open in reader</a> : null}</div>)}</div> : null}
            </div>
          </div>
        ))}
        {loading ? <div className="assistant-message assistant-message-assistant" role="status" aria-label="Assistant is responding"><div className="assistant-avatar" aria-hidden="true">S</div><div className="assistant-typing"><span /><span /><span /></div></div> : null}
        <div ref={endRef} />
      </div>

      {messages.length === 1 ? <div className="assistant-suggestions">{starterPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => setQuery(prompt)}>{prompt}</button>)}</div> : null}
      {error ? <div className="assistant-error" role="alert"><span>{error}</span>{query.trim() ? <button type="button" onClick={() => void handleSearch()} disabled={loading}>Retry</button> : null}</div> : null}

      <form onSubmit={handleSearch} className="assistant-composer">
        <textarea value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSearch() } }} placeholder="Message your library assistant..." rows={1} aria-label="Message your library assistant" />
        <button type="submit" className="assistant-submit" disabled={loading || !query.trim()} aria-label="Send message">Send</button>
      </form>
      <p className="assistant-disclaimer">Gemini uses your message, recent chat context, matching catalog details, and—when asked—your own loan details to reply. Don’t share sensitive information.</p>
      </section> : null}
    </>
  )
}
