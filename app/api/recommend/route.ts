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

const BUILTIN_LIBRARY_KNOWLEDGE = `
[MARY THE QUEEN COLLEGE OF QUEZON CITY - SMART LIB KNOWLEDGE BASE]

1. USER ROLES & ACCESS HIERARCHY:
- System Administrator: Highest-level role with absolute platform control, responsible for system-wide configuration, accessing audit logs, and exclusively handling the creation and provisioning of all new user accounts (students, faculty, librarians).
- Librarian: Management role controlling day-to-day library operations, including physical and digital catalog inventory, loan approvals, physical return inspections, fine resolution and waivers, and point distribution, but is strictly restricted from creating or deleting member accounts.
- Faculty: Elevated end-user role allowing members to borrow physical and digital materials with extended loan durations or higher point allowances, while also granting them the ability to submit academic materials or course contributions for librarian review.
- Student: Standard end-user role restricted to personal account activities, including browsing catalogs, checking out books, reading digital e-books, interacting with the AI assistant, tracking personal active loans, and earning or spending reward points.

2. OVERDUE FINES & PENALTY POLICY:
- Late Return Fee: Overdue physical book loans incur a daily late fee (standard default: ₱10.00 per school day overdue, or as configured by library administration) until the physical book is checked in at the desk.
- Clearance Impact: Any unpaid overdue fine or unreturned book automatically places an academic clearance hold on the student's records, graduation clearance, and future borrowing privileges.
- Settling Fines: Members pay fines at the library circulation desk or cashier. Librarians record the payment in the system and issue an official receipt with a receipt number. Librarians can also waive fines under valid institutional justifications.

3. WHAT TO DO WHEN A BOOK IS LOST:
- Step 1 (Immediate Notification): The borrower must immediately notify the library circulation desk or librarian. Reporting a lost book immediately freezes accumulating daily overdue fees.
- Step 2 (Incident Assessment): The librarian performs an assessment where the borrower is given two standard options:
  a) Pay the assessed replacement charge (the acquisition cost of the book plus a standard administrative processing fee), OR
  b) Provide an exact replacement copy of the lost title in brand-new, acceptable condition (same ISBN/edition).
- Step 3 (Payment & Clearance): Once the replacement charge or replacement copy is submitted and any pending late fees are settled, staff record the resolution, issue an official cashier receipt, and lift all clearance holds.

4. WHAT TO DO WHEN A BOOK IS DAMAGED:
- Physical return inspection: All physical returns are inspected at the circulation desk (graded: Good, Fair, Minor Damage, or Severe Damage).
- Normal wear: Light wear from normal academic reading is excused.
- Severe damage: Defaced pages, missing covers, or liquid damage incur a repair fee or full replacement cost as assessed by the librarian.

5. PHYSICAL BOOK BORROWING & LOAN DURATIONS:
- How to Borrow: Members search the catalog, select an available physical book, and choose a duration: 1, 3, 5, 7, 14, or 30 days.
- Pickup: Visit the circulation desk with your school ID. A librarian confirms the request and scans the physical book copy QR label to complete checkout.
- Return: Return the book to the circulation desk on or before the due date for staff inspection.

6. DIGITAL CATALOG & E-BOOK READING:
- Instant Browser Reader: Digital e-books can be read directly in the web browser with page navigation, zoom, and search capabilities.
- Free Access titles: Can be unlocked immediately at 0 points cost for 1, 3, 7, 14, or 30 days.
- Points Access titles: Unlocked by spending student reward points for the selected duration period.
- Digital loans expire automatically when duration ends, with no late fees. Members can also return or renew them online.

7. REWARD POINTS & ACADEMIC CONTRIBUTIONS:
- How to Earn: Students and faculty earn points by uploading academic contributions (lecture notes, study materials, research papers, or contributed books) that are reviewed and approved by librarians, or through special administrator recognition.
- How to Spend: Reward points are used to unlock premium/points-based digital e-books in the catalog.
`

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
  if (/(recommend|suggest|find books|search book|looking for book|materials about|resources on|books on|titles by|reading list)/i.test(q) && !/(lost|fine|damage|penalty|how much|policy|rule|role|clearance|hours|what to do|procedure)/i.test(q)) {
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
    const { data: memberProfile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const memberRole = ['admin', 'librarian', 'faculty', 'student'].includes(memberProfile?.role ?? '')
      ? memberProfile?.role
      : 'student'
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'The AI assistant is not configured. Ask the administrator to add GEMINI_API_KEY.' }, { status: 503 })
    }

    let policyText = ''
    let frontDeskFallback = 'the Mary the Queen College Library circulation desk'
    try {
      const { data: assistantSettings } = await supabase.from('library_assistant_settings')
        .select('librarian_name, policy_text, front_desk_fallback').eq('id', true).maybeSingle()
      if (assistantSettings?.policy_text?.trim()) policyText = assistantSettings.policy_text.trim()
      if (assistantSettings?.front_desk_fallback?.trim()) frontDeskFallback = assistantSettings.front_desk_fallback.trim()
    } catch {
      // Safe fallback when custom settings table is not present
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
    const loanPromise = intent === 'loans'
      ? supabase
        .from('borrow_requests')
        .select('status, due_date, books(title, author)')
        .eq('student_id', user.id)
        .order('request_date', { ascending: false })
        .limit(20)
      : Promise.resolve({ data: [], error: null })

    const [rpc, loanResult] = await Promise.all([catalogPromise, loanPromise])
    let results: CatalogSearchRow[] = []
    if (shouldSearchCatalog) {
      if (!rpc.error) {
        results = filterRelevantCatalogRows(catalogQuerySource, (rpc.data ?? []) as CatalogSearchRow[])
      }
    }

    let loans: Array<Record<string, unknown>> = []
    if (intent === 'loans') {
      if (!loanResult.error) {
        loans = (loanResult.data ?? []).map((loan) => ({
          status: loan.status,
          due_date: loan.due_date,
          books: loan.books,
        }))
      }
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
          'You are an intelligent, friendly, proactive, and comprehensive academic library assistant.',
          'Always directly, clearly, and helpfully answer any user concern — including how much overdue fines cost, what to do when a book is lost, borrowing durations, account clearance, user roles, points, or general library inquiries.',
          'Do NOT act merely as a search bar. When a user asks a question, explain the answer thoroughly, step-by-step, with reassuring and actionable guidance.',
          BUILTIN_LIBRARY_KNOWLEDGE,
          'When users ask for book recommendations or specific subjects, suggest titles and describe why they fit.',
          'When users ask about their active borrowings or personal loans, summarize their records from currentUserLoans accurately.',
          'For physical title inventory, availability, or shelf location queries, you can call the search_physical_inventory tool.',
          `If a member needs in-person assistance, physical fee payment, or physical book pickups/returns, warmly advise them to visit ${frontDeskFallback} during campus library hours.`,
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
