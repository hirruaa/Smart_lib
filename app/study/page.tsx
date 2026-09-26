'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'

type Book = { id: number; title: string; author: string; category: string; isbn: string | null }
type Flashcard = { id: string; front: string; back: string }
type Goal = { id: string; title: string; target: number; progress: number; unit: string }
type Collection = { id: string; title: string; description: string; bookIds: number[] }
type Tab = 'tools' | 'collections' | 'goals' | 'citations' | 'accessibility'

const storage = {
  get<T>(key: string, fallback: T): T {
    try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
  },
  set(key: string, value: unknown) { window.localStorage.setItem(key, JSON.stringify(value)) },
}

function makeFlashcards(source: string): Flashcard[] {
  const sentences = source.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 35)
  return sentences.slice(0, 8).map((sentence, index) => {
    const words = sentence.split(/\s+/)
    const answer = words.slice(0, Math.min(8, words.length)).join(' ')
    return { id: `${Date.now()}-${index}`, front: `What is the key idea in this passage?`, back: answer }
  })
}

function citation(book: Book, style: string) {
  const year = new Date().getFullYear()
  if (style === 'MLA') return `${book.author}. “${book.title}.” Smart Lib, ${year}.`
  if (style === 'Chicago') return `${book.author}. “${book.title}.” Smart Lib. ${year}.`
  return `${book.author}. (${year}). ${book.title}. Smart Lib.`
}

export default function StudyPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('tools')
  const [books, setBooks] = useState<Book[]>([])
  const [source, setSource] = useState('')
  const [flashcards, setFlashcards] = useState<Flashcard[]>([])
  const [cardIndex, setCardIndex] = useState(0)
  const [cardFlipped, setCardFlipped] = useState(false)
  const [quizMode, setQuizMode] = useState(false)
  const [goals, setGoals] = useState<Goal[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [newGoal, setNewGoal] = useState({ title: '', target: '10', unit: 'pages' })
  const [newCollection, setNewCollection] = useState({ title: '', description: '' })
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [citationBookId, setCitationBookId] = useState('')
  const [citationStyle, setCitationStyle] = useState('APA')
  const [fontScale, setFontScale] = useState(1)
  const [highContrast, setHighContrast] = useState(false)
  const [dyslexiaMode, setDyslexiaMode] = useState(false)

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => { if (!data.user) router.replace('/login') })
    getSupabase().from('books').select('id,title,author,category,isbn').order('title').then(({ data }) => setBooks((data ?? []) as Book[]))
    setGoals(storage.get('smart-lib:study-goals', []))
    setCollections(storage.get('smart-lib:collections', []))
    setFontScale(storage.get('smart-lib:font-scale', 1))
    setHighContrast(storage.get('smart-lib:high-contrast', false))
    setDyslexiaMode(storage.get('smart-lib:dyslexia-mode', false))
  }, [router])

  useEffect(() => { storage.set('smart-lib:study-goals', goals) }, [goals])
  useEffect(() => { storage.set('smart-lib:collections', collections) }, [collections])
  useEffect(() => { storage.set('smart-lib:font-scale', fontScale); document.documentElement.style.setProperty('--study-font-scale', String(fontScale)) }, [fontScale])
  useEffect(() => { storage.set('smart-lib:high-contrast', highContrast); document.documentElement.classList.toggle('study-high-contrast', highContrast) }, [highContrast])
  useEffect(() => { storage.set('smart-lib:dyslexia-mode', dyslexiaMode); document.documentElement.classList.toggle('study-dyslexia', dyslexiaMode) }, [dyslexiaMode])

  const selectedBook = useMemo(() => books.find((book) => String(book.id) === citationBookId), [books, citationBookId])
  const activeCard = flashcards[cardIndex]

  function generateCards() {
    const cards = makeFlashcards(source)
    setFlashcards(cards); setCardIndex(0); setCardFlipped(false); setQuizMode(false)
  }
  function addGoal(event: React.FormEvent) {
    event.preventDefault()
    if (!newGoal.title.trim()) return
    setGoals((items) => [...items, { id: crypto.randomUUID(), title: newGoal.title.trim(), target: Math.max(1, Number(newGoal.target) || 1), progress: 0, unit: newGoal.unit }])
    setNewGoal({ title: '', target: '10', unit: 'pages' })
  }
  function addCollection(event: React.FormEvent) {
    event.preventDefault()
    if (!newCollection.title.trim()) return
    const collection = { id: crypto.randomUUID(), title: newCollection.title.trim(), description: newCollection.description.trim(), bookIds: [] }
    setCollections((items) => [...items, collection]); setSelectedCollection(collection.id); setNewCollection({ title: '', description: '' })
  }
  function toggleBook(collectionId: string, bookId: number) {
    setCollections((items) => items.map((collection) => collection.id === collectionId ? { ...collection, bookIds: collection.bookIds.includes(bookId) ? collection.bookIds.filter((id) => id !== bookId) : [...collection.bookIds, bookId] } : collection))
  }

  return <main className={`study-hub min-h-screen bg-paper-100 px-4 py-6 text-slate-900 dark:bg-forest-900 dark:text-paper-100 sm:px-8 ${highContrast ? 'study-hub-contrast' : ''}`}><div className="mx-auto max-w-6xl">
    <header className="study-hub-header"><div><button type="button" onClick={() => router.push('/dashboard')} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Dashboard</button><p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-pine-600 dark:text-pine-200">Smart Lib Study Hub</p><h1 className="mt-2 text-3xl font-semibold">Learn with your library</h1><p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">Turn reading material into review cards, quizzes, citations, collections, and achievable study goals.</p></div></header>
    <nav className="study-tabs" aria-label="Study hub sections">{([['tools', 'Flashcards & quiz'], ['collections', 'Collections'], ['goals', 'Goals'], ['citations', 'Citations'], ['accessibility', 'Accessibility']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={tab === value ? 'active' : ''}>{label}</button>)}</nav>

    {tab === 'tools' ? <section className="study-hub-panel"><div><h2>Turn text into study material</h2><p>Paste a passage from your reading session to create quick review cards.</p></div><textarea value={source} onChange={(event) => setSource(event.target.value)} className="study-source-input" rows={7} placeholder="Paste a passage or your notes here..." /><div className="study-action-row"><button type="button" onClick={generateCards} disabled={source.trim().length < 35} className="pine-action rounded-xl px-4 py-2 text-sm font-semibold">Generate flashcards</button><span className="text-xs text-slate-500">Cards are created in your browser and can be regenerated anytime.</span></div>{activeCard ? <div className="study-card-area"><div className={`study-flashcard ${cardFlipped ? 'flipped' : ''}`} onClick={() => setCardFlipped((value) => !value)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setCardFlipped((value) => !value) }}><span className="study-card-label">{cardFlipped ? 'Answer' : 'Question'}</span><strong>{cardFlipped ? activeCard.back : activeCard.front}</strong><span className="study-card-hint">Click to flip · {cardIndex + 1} of {flashcards.length}</span></div><div className="study-action-row"><button type="button" onClick={() => { setCardIndex((index) => (index + flashcards.length - 1) % flashcards.length); setCardFlipped(false) }} className="secondary-action rounded-xl border px-3 py-2 text-sm">Previous</button><button type="button" onClick={() => { setCardIndex((index) => (index + 1) % flashcards.length); setCardFlipped(false) }} className="pine-action rounded-xl px-3 py-2 text-sm">Next</button><button type="button" onClick={() => setQuizMode((value) => !value)} className="secondary-action rounded-xl border px-3 py-2 text-sm">{quizMode ? 'Hide quiz mode' : 'Quiz mode'}</button></div>{quizMode ? <div className="study-quiz-box"><p className="text-sm font-semibold">Explain this idea in your own words:</p><textarea className="study-source-input mt-3" rows={3} placeholder="Write your answer, then compare it with the answer on the card." /></div> : null}</div> : <div className="study-empty-state">Generate cards from a passage of at least a few sentences to begin reviewing.</div>}</section> : null}

    {tab === 'collections' ? <section className="study-hub-panel"><h2>Study collections</h2><p>Group books by course, project, or exam.</p><form onSubmit={addCollection} className="study-inline-form"><input value={newCollection.title} onChange={(event) => setNewCollection({ ...newCollection, title: event.target.value })} placeholder="Collection name" required /><input value={newCollection.description} onChange={(event) => setNewCollection({ ...newCollection, description: event.target.value })} placeholder="Short description" /><button type="submit" className="pine-action rounded-xl px-4 py-2 text-sm font-semibold">Create</button></form><div className="study-collection-grid">{collections.map((collection) => <article key={collection.id} className={`study-collection ${selectedCollection === collection.id ? 'selected' : ''}`}><button type="button" onClick={() => setSelectedCollection(collection.id)} className="text-left"><h3>{collection.title}</h3><p>{collection.description || 'No description'}</p><span>{collection.bookIds.length} book{collection.bookIds.length === 1 ? '' : 's'}</span></button>{selectedCollection === collection.id ? <div className="study-book-picker">{books.map((book) => <label key={book.id}><input type="checkbox" checked={collection.bookIds.includes(book.id)} onChange={() => toggleBook(collection.id, book.id)} />{book.title}</label>)}</div> : null}</article>)}{collections.length === 0 ? <div className="study-empty-state">Create a collection for a course, research topic, or exam.</div> : null}</div></section> : null}

    {tab === 'goals' ? <section className="study-hub-panel"><h2>Reading goals</h2><p>Set small targets and update them as you study.</p><form onSubmit={addGoal} className="study-inline-form"><input value={newGoal.title} onChange={(event) => setNewGoal({ ...newGoal, title: event.target.value })} placeholder="Goal name" required /><input type="number" min="1" value={newGoal.target} onChange={(event) => setNewGoal({ ...newGoal, target: event.target.value })} aria-label="Goal target" /><select value={newGoal.unit} onChange={(event) => setNewGoal({ ...newGoal, unit: event.target.value })}><option>pages</option><option>minutes</option><option>books</option></select><button type="submit" className="pine-action rounded-xl px-4 py-2 text-sm font-semibold">Add goal</button></form><div className="study-goal-list">{goals.map((goal) => <article key={goal.id}><div className="flex items-start justify-between gap-3"><div><h3>{goal.title}</h3><p>{goal.progress} of {goal.target} {goal.unit}</p></div><button type="button" onClick={() => setGoals((items) => items.filter((item) => item.id !== goal.id))} className="text-xs font-semibold text-rose-700">Remove</button></div><input type="range" min="0" max={goal.target} value={goal.progress} onChange={(event) => setGoals((items) => items.map((item) => item.id === goal.id ? { ...item, progress: Number(event.target.value) } : item))} aria-label={`Progress for ${goal.title}`} /></article>)}{goals.length === 0 ? <div className="study-empty-state">Set a weekly reading target to build momentum.</div> : null}</div></section> : null}

    {tab === 'citations' ? <section className="study-hub-panel"><h2>Citation generator</h2><p>Choose a catalog book and copy a reference for your assignment.</p><div className="study-inline-form"><select value={citationBookId} onChange={(event) => setCitationBookId(event.target.value)}><option value="">Select a book</option>{books.map((book) => <option key={book.id} value={book.id}>{book.title}</option>)}</select><select value={citationStyle} onChange={(event) => setCitationStyle(event.target.value)}><option>APA</option><option>MLA</option><option>Chicago</option></select></div>{selectedBook ? <div className="citation-result"><p>{citation(selectedBook, citationStyle)}</p><button type="button" onClick={() => void navigator.clipboard?.writeText(citation(selectedBook, citationStyle))} className="pine-action rounded-xl px-3 py-2 text-sm font-semibold">Copy citation</button></div> : <div className="study-empty-state">Select a book to generate a citation.</div>}</section> : null}

    {tab === 'accessibility' ? <section className="study-hub-panel"><h2>Reading preferences</h2><p>These preferences apply to the Study Hub and can make long study sessions more comfortable.</p><div className="study-preference-list"><label>Text size<input type="range" min="0.9" max="1.25" step="0.05" value={fontScale} onChange={(event) => setFontScale(Number(event.target.value))} /></label><label><input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} /> High contrast</label><label><input type="checkbox" checked={dyslexiaMode} onChange={(event) => setDyslexiaMode(event.target.checked)} /> Reading-friendly type spacing</label></div></section> : null}
  </div></main>
}
