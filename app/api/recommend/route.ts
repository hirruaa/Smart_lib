import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateGeminiEmbedding, generateGeminiToolChatReply, GeminiRequestError } from '@/utils/gemini'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'

type AssistantIntent = 'search' | 'research' | 'loans' | 'policy'
type RecentMessage = { role: 'user' | 'assistant'; content: string }
type CatalogSearchRow = {
  id: number
  title: string
  author: string
  category: string
  description: string | null
  pdf_url: string | null
  available_copies: number
  rank: number
}

const assistantSearchFillers = new Set([
  'a', 'an', 'and', 'about', 'are', 'book', 'books', 'can', 'could', 'find',
  'for', 'give', 'help', 'i', 'in', 'looking', 'me', 'need', 'of', 'on',
  'please', 'recommend', 'resource', 'resources', 'search', 'show', 'some',
  'the', 'to', 'want', 'what', 'with', 'you',
])

function getIntent(query: string): AssistantIntent {
  const q = query.toLowerCase()
  if (/(my|i currently have|active|borrowed|my loan|my due|my account|my status|my clearance|my books|i have)/i.test(q) && /(book|books|loan|due|borrow|expire|renew|return)/i.test(q)) {
    return 'loans'
  }
  if (/(recommend|suggest|find (?:books?|resources?)|search (?:for )?(?:books?|resources?)|looking for (?:books?|resources?)|(?:books?|resources?|materials) (?:about|on|for)|titles by|reading list)/i.test(q) && !/(lost|fine|damage|penalty|how much|policy|rule|role|clearance|hours|what to do|procedure)/i.test(q)) {
    return 'search'
  }
  if (/(research paper|academic study|thesis sources|journal articles|literature review)/i.test(q)) {
    return 'research'
  }
  return 'policy'
}

function getCatalogQuery(query: string) {
  const keywords = query.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => !assistantSearchFillers.has(word)) ?? []
  return keywords.join(' ') || query
}

function filterRelevantCatalogRows(query: string, rows: CatalogSearchRow[]) {
  const terms = [...new Set(getCatalogQuery(query).split(/\s+/).filter(Boolean))]
  if (!terms.length) return rows.slice(0, 5)

  return rows
    .map((row) => {
      const searchableText = `${row.title} ${row.author} ${row.category} ${row.description ?? ''}`.toLowerCase()
      const matchingTerms = terms.filter((term) => searchableText.includes(term)).length
      return { row, matchingTerms }
    })
    .filter(({ matchingTerms }) => matchingTerms > 0 && matchingTerms / terms.length >= 0.5)
    .sort((left, right) => right.matchingTerms - left.matchingTerms || right.row.rank - left.row.rank)
    .slice(0, 5)
    .map(({ row }) => row)
}

function parseHistory(value: unknown): RecentMessage[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const messages = value.slice(-6)
  if (messages.some((message) =>
    !message || typeof message !== 'object'
    || !['user', 'assistant'].includes(message.role)
    || typeof message.content !== 'string'
    || !message.content.trim()
    || message.content.length > 2000
  )) return null
  return messages.map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content.trim(),
  }))
}

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return originViolation()
    if (bodyTooLarge(req, 32_768)) return NextResponse.json({ error: 'Chat request is too large.' }, { status: 413 })
    const requestLimit = rateLimit(req, { name: 'assistant', limit: 20, windowMs: 60_000 })
    if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
    const requestText = await req.text()
    if (requestText.length > 24000) {
      return NextResponse.json({ error: 'Chat request is too large.' }, { status: 413 })
    }
    let body: unknown
    try {
      body = JSON.parse(requestText)
    } catch {
      return NextResponse.json({ error: 'Invalid chat request.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid chat request.' }, { status: 400 })
    }
    const requestBody = body as Record<string, unknown>
    const query = typeof requestBody.query === 'string' ? requestBody.query.trim() : ''
    if (!query || query.length > 1200) return NextResponse.json({ error: 'Enter a message up to 1,200 characters.' }, { status: 400 })
    const history = parseHistory(requestBody.history)
    if (!history) return NextResponse.json({ error: 'Invalid conversation history.' }, { status: 400 })
    const supabase = await createClient()
    const intent = getIntent(query)
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user
    if (!user) {
      return NextResponse.json({ error: 'Sign in to use the library assistant.' }, { status: 401 })
    }
    const { data: memberProfile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (profileError || !memberProfile) {
      console.error('Library assistant could not load member role:', profileError)
      return NextResponse.json({ error: 'Your library profile could not be verified. Please try again.' }, { status: 503 })
    }
    const memberRole = memberProfile.role
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'The AI assistant is not configured. Ask the administrator to add GEMINI_API_KEY.' }, { status: 503 })
    }

    let policyText = ''
    let frontDeskFallback = 'the Mary the Queen College Library circulation desk'
    let policySettingsUnavailable = false
    try {
      const { data: assistantSettings, error: settingsError } = await supabase.from('library_assistant_settings')
        .select('librarian_name, policy_text, front_desk_fallback').eq('id', true).maybeSingle()
      if (settingsError) throw settingsError
      if (assistantSettings?.policy_text?.trim()) policyText = assistantSettings.policy_text.trim()
      if (assistantSettings?.front_desk_fallback?.trim()) frontDeskFallback = assistantSettings.front_desk_fallback.trim()
    } catch (error) {
      policySettingsUnavailable = true
      console.error('Library assistant policy settings could not be loaded:', error)
    }
    if (intent === 'policy' && policySettingsUnavailable) {
      return NextResponse.json({ error: 'Library policy settings are temporarily unavailable. Please contact the library desk.' }, { status: 503 })
    }

    const previousUserQuery = [...history].reverse().find((message) => message.role === 'user')?.content
    const isShortFollowUp = query.length < 60 && /\b(it|that|those|them|these|more|similar|same)\b/i.test(query)
    const previousIntent = previousUserQuery ? getIntent(previousUserQuery) : null
    const catalogQuerySource = isShortFollowUp && previousUserQuery && (previousIntent === 'search' || previousIntent === 'research')
      ? previousUserQuery
      : query
    const shouldSearchCatalog = intent === 'search' || intent === 'research'
    const catalogQuery = getCatalogQuery(catalogQuerySource)
    const catalogPromise = shouldSearchCatalog
      ? supabase.rpc('search_books', { p_query: catalogQuery, p_limit: 10 })
      : Promise.resolve({ data: [], error: null })
    const digitalLoanPromise = intent === 'loans'
      ? supabase
        .from('borrow_requests')
        .select('status, due_date, books(title, author)')
        .eq('student_id', user.id)
        .order('request_date', { ascending: false })
        .limit(20)
      : Promise.resolve({ data: [], error: null })
    const physicalLoanPromise = intent === 'loans'
      ? supabase
        .from('physical_book_requests')
        .select('status, due_date, books(title, author)')
        .eq('student_id', user.id)
        .order('requested_at', { ascending: false })
        .limit(20)
      : Promise.resolve({ data: [], error: null })

    const [rpc, digitalLoanResult, physicalLoanResult] = await Promise.all([catalogPromise, digitalLoanPromise, physicalLoanPromise])
    let results: CatalogSearchRow[] = []
    if (shouldSearchCatalog) {
      if (rpc.error) {
        console.error('Library assistant catalog search failed:', rpc.error)
        return NextResponse.json({ error: 'Catalog search is temporarily unavailable. Please try again.' }, { status: 503 })
      }
      results = filterRelevantCatalogRows(catalogQuerySource, (rpc.data ?? []) as CatalogSearchRow[])
    }

    let loans: Array<Record<string, unknown>> = []
    if (intent === 'loans') {
      if (digitalLoanResult.error || physicalLoanResult.error) {
        console.error('Library assistant loan lookup failed:', digitalLoanResult.error ?? physicalLoanResult.error)
        return NextResponse.json({ error: 'Your loan details are temporarily unavailable. Please try again.' }, { status: 503 })
      }
      loans = [
        ...(digitalLoanResult.data ?? []).map((loan) => ({
          type: 'Digital access',
          status: loan.status,
          due_date: loan.due_date,
          books: loan.books,
        })),
        ...(physicalLoanResult.data ?? []).map((loan) => ({
          type: 'Physical circulation',
          status: loan.status,
          due_date: loan.due_date,
          books: loan.books,
        })),
      ]
    }

    const catalogContext = results.map(({ id, title, author, category, description, available_copies }) => ({
      id,
      title,
      author,
      category,
      description: description?.slice(0, 300) ?? null,
      available_copies,
    }))

    const context = JSON.stringify({
      memberRole,
      currentUserLoans: loans,
      catalog: catalogContext,
      customPolicy: policyText || undefined,
    })

    const geminiMessages = [
      ...history.map((message) => ({
        role: message.role === 'assistant' ? 'model' as const : 'user' as const,
        text: message.content,
      })),
      {
        role: 'user' as const,
        text: `User query: ${query}\n\nLive context: ${context}`,
      },
    ]

    let answer: string
    try {
      answer = await generateGeminiToolChatReply(
        geminiMessages,
        [
          'You are the Smart Lib AI Assistant for Mary the Queen College of Quezon City.',
          'Be friendly, concise, and useful. Treat the live context and configured library policy as the only authoritative source for library-specific facts.',
          'Never invent fines, due-date rules, replacement requirements, clearance effects, payment methods, loan durations, account permissions, library hours, or staff contacts. If the configured policy does not answer a policy question, say that you cannot verify it and direct the member to the library desk.',
          'For book discovery, recommend only titles present in the supplied catalog results. Explain relevance using their title, author, category, or description, and do not claim a title is available unless the supplied data says so.',
          'When asked about personal loans, use only currentUserLoans. Do not infer loans or account status from conversation history.',
          'For physical inventory, availability, or location questions, use search_physical_inventory and report only its returned matches.',
          `For in-person assistance, physical payments, or pickups and returns, direct the member to ${frontDeskFallback}.`,
          policyText ? `Configured library policy:\n${policyText}` : 'No verified policy text is configured. Do not answer policy-specific questions from general assumptions.',
        ].join('\n\n'),
        [{ name: 'search_physical_inventory', description: 'Find active physical or hybrid titles with current availability and recorded shelf locations.', parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'Title, author, ISBN, or category.' } }, required: ['query'] } }],
        {
          search_physical_inventory: async (args) => {
            const lookup = typeof args.query === 'string' ? args.query.trim().slice(0, 120) : ''
            if (!lookup) return { error: 'A title, author, ISBN, or category is required.' }
            try {
              const { data, error } = await supabase.rpc('assistant_search_physical_inventory', { p_query: lookup })
              if (error) return { error: 'Physical inventory lookup is temporarily unavailable.' }
              return { matches: data ?? [] }
            } catch {
              return { error: 'Physical inventory lookup is temporarily unavailable.' }
            }
          },
        },
      )
    } catch (error: unknown) {
      if (error instanceof GeminiRequestError) {
        console.error('Gemini chat generation failed:', { status: error.status, reason: error.reason, message: error.message })
        const response = error.status === 401 || error.status === 403
          ? { status: 502, message: 'The server’s Gemini API key was rejected. Ask the administrator to verify its key and API access.' }
          : error.status === 404
            ? { status: 502, message: 'The configured Gemini model was not found. Ask the administrator to check GEMINI_MODEL.' }
            : error.status === 503
              ? { status: 503, message: 'Gemini is temporarily unavailable. Please wait a moment and try again.' }
            : error.status === 429
              ? { status: 429, message: 'Gemini is temporarily at its usage limit. Please wait a moment and try again.' }
              : error.status === 400
                ? { status: 502, message: 'Gemini rejected the request. Please start a new chat and try again.' }
                : error.reason === 'timeout'
                  ? { status: 504, message: 'Gemini is taking too long to respond. Please try again.' }
                  : error.reason === 'network'
                    ? { status: 502, message: 'The server could not reach Gemini. Please try again shortly.' }
                    : error.reason === 'blocked'
                      ? { status: 422, message: 'Gemini could not answer that prompt. Try rephrasing it.' }
                      : { status: 502, message: 'Gemini returned no usable response. Please try again.' }
        return NextResponse.json({ error: response.message }, { status: response.status })
      }
      console.error('Gemini chat generation failed unexpectedly:', error)
      return NextResponse.json({ error: 'The assistant encountered an unexpected error. Please try again.' }, { status: 502 })
    }

    const safeResults = results.map(({ pdf_url, rank: _rank, ...book }) => ({
      ...book,
      has_document: Boolean(pdf_url),
    }))
    return NextResponse.json({ query, intent, answer, results: safeResults, loans })
  } catch (error: unknown) {
    console.error('Library assistant request failed:', error)
    return NextResponse.json({
      error: error instanceof Error && error.message.startsWith('Unable to ')
        ? error.message
        : 'The library assistant could not complete your request. Please try again.',
    }, { status: 500 })
  }
}
