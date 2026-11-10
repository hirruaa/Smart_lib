import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateGeminiChatReply, GeminiRequestError } from '@/utils/gemini'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'

type AssistantIntent = 'search' | 'research' | 'loans' | 'policy'
type RecentMessage = { role: 'user' | 'assistant'; content: string }
type LibraryPolicy = {
  fine_grace_days: number
  late_fee_per_day: number | string
  late_fee_cap: number | string
  lost_after_days: number
  policy_notice: string
}
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
  'for', 'give', 'help', 'i', 'in', 'is', 'it', 'located', 'looking', 'me', 'near', 'need', 'of', 'on',
  'please', 'recommend', 'resource', 'resources', 'search', 'show', 'some',
  'the', 'to', 'want', 'what', 'where', 'with', 'you', 'physical', 'inventory',
  'available', 'availability', 'copies', 'copy', 'shelf', 'location',
])

function needsLibrarianRoster(query: string) {
  return /\b(librarian|library staff|who(?:'s| is) (?:working|on duty))\b/i.test(query)
}

function needsLibraryPolicy(query: string, intent: AssistantIntent) {
  if (needsLibrarianRoster(query) && !/\b(fine|fines|overdue|lost|damage|renew|clearance|restriction|suspend|policy)\b/i.test(query)) return false
  return intent === 'policy'
    || /\b(fine|fines|late fee|overdue|lost|damage|damaged|renew|renewal|clearance|restriction|suspend|borrow(?:ing)? rule|policy|eligible|eligibility)\b/i.test(query)
}

function needsPhysicalInventory(query: string) {
  return /\b(where(?: can i| do i| is| are)?|location|shelf|available|availability|in stock|physical copy|copies)\b/i.test(query)
}

function getIntent(query: string): AssistantIntent {
  const q = query.toLowerCase()
  if (/(my|for me|i currently have|active|borrowed|my loan|my due|my account|my status|my clearance|my books|i have|do i owe|will i owe|what do i owe|am i eligible|can i borrow|am i allowed)/i.test(q) && /(book|books|loan|due|borrow|expire|renew|return|fine|fines|fee|clearance|balance|eligible|overdue|status|account|owe)/i.test(q)) {
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

function getImmediatePolicyAnswer(
  query: string,
  policy: LibraryPolicy | null,
  librarians: string[],
  configuredLibrarian: string | null,
  librarianLookupFailed: boolean,
  frontDeskFallback: string,
) {
  const q = query.toLowerCase()
  if (/\b(who(?:'s| is) (?:the )?(?:current )?librarian|current librarian|name of (?:the )?librarian|librarian(?:'s)? name)\b/i.test(q)) {
    const names = librarians.length ? librarians : configuredLibrarian ? [configuredLibrarian] : []
    if (names.length) return `The current librarian${names.length === 1 ? ' is' : 's are'} ${names.join(', ')}.`
    if (librarianLookupFailed) return `I can't verify the current librarian roster right now. Please ask at ${frontDeskFallback}.`
    return `I don't have a current librarian name on file. Please ask at ${frontDeskFallback}.`
  }

  if (/\b(?:digital|ebook|e-book)\b/i.test(q) && /\b(overdue|late|fine|fines)\b/i.test(q)) {
    return 'Digital access does not accrue overdue fines. Access ends on the due date shown in your account; ask the library desk if you need help with a specific title.'
  }

  if (/\b(damag(?:e|ed)|wet|torn|broken)\b/i.test(q) && /\b(book|item|borrowed|library)\b/i.test(q)) {
    return `Please stop using the item and report the damage to library staff as soon as possible. Staff must inspect it and assess any charge; I can't quote a fixed damage fee. Ask at ${frontDeskFallback}.`
  }

  if (/\b(lost|misplaced|can't find|cannot find)\b/i.test(q) && /\b(book|item|borrowed)\b/i.test(q)) {
    if (!policy) return null
    const dailyFee = Number(policy.late_fee_per_day).toFixed(2)
    const cap = Number(policy.late_fee_cap).toFixed(2)
    return `Report the lost physical book to library staff as soon as possible so they can update the loan and explain the next steps. An overdue or lost physical item restricts new checkouts. For general-circulation physical books, the current policy has a ${policy.fine_grace_days}-day grace period, then PHP ${dailyFee} per chargeable day (excluding Sundays and library-recorded holidays), capped at PHP ${cap} per item. At ${policy.lost_after_days} days overdue, the item is classified as lost and late-fine accrual stops. Any lost-item/replacement charge is assessed by staff; there is no fixed replacement amount I can quote. Existing loans retain the policy snapshot saved at checkout, so staff can confirm the exact terms for your loan. Ask at ${frontDeskFallback}.`
  }

  if (/\b(overdue|late|fine|fines|late fee)\b/i.test(q) && /\b(how much|how are|what is|what are|calculate|policy|charge|charged|work)\b/i.test(q)) {
    if (/\b(my|me|for me|my account|my fine|my fines|i owe|do i|will i)\b/i.test(q)) return null
    if (!policy) return null
    return `For general-circulation physical books, the current policy allows ${policy.fine_grace_days} grace days, then charges PHP ${Number(policy.late_fee_per_day).toFixed(2)} per chargeable day. Sundays and library-recorded holidays are not chargeable, and the total is capped at PHP ${Number(policy.late_fee_cap).toFixed(2)} per item. This doesn't apply to digital access, which does not accrue overdue fines. Existing physical loans retain the policy snapshot saved at checkout, so check with staff about a specific loan.`
  }

  return null
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
  const messages = value.slice(-4)
  if (messages.some((message) =>
    !message || typeof message !== 'object'
    || !['user', 'assistant'].includes(message.role)
    || typeof message.content !== 'string'
    || !message.content.trim()
    || message.content.length > 1000
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
    const requestLimit = await rateLimit(req, { name: 'assistant', limit: 20, windowMs: 60_000 })
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
    let frontDeskFallback = 'the Mary the Queen College Library circulation desk'
    const needsRoster = needsLibrarianRoster(query)
    const needsPolicy = needsLibraryPolicy(query, intent)
    const needsAssistantSettings = needsRoster || needsPolicy
    const [assistantSettingsResult, policyResult, librarianResult] = await Promise.all([
      needsAssistantSettings
        ? supabase.from('library_assistant_settings')
          .select('librarian_name, front_desk_fallback').eq('id', true).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      needsPolicy
        ? supabase.from('library_policy_settings')
          .select('fine_grace_days, late_fee_per_day, late_fee_cap, lost_after_days, policy_notice').eq('id', 1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      needsRoster
        ? supabase.rpc('assistant_current_librarians')
        : Promise.resolve({ data: null, error: null }),
    ])
    if (assistantSettingsResult.error) console.error('Library assistant settings could not be loaded:', assistantSettingsResult.error)
    if (policyResult.error) console.error('Live library policy could not be loaded:', policyResult.error)
    if (librarianResult.error) console.error('Current librarian roster could not be loaded:', librarianResult.error)
    if (assistantSettingsResult.data?.front_desk_fallback?.trim()) frontDeskFallback = assistantSettingsResult.data.front_desk_fallback.trim()
    const currentPolicy = policyResult.data as LibraryPolicy | null
    const currentLibrarians = ((librarianResult.data ?? []) as Array<{ full_name: string | null }>)
      .map((librarian) => librarian.full_name?.trim())
      .filter((name): name is string => Boolean(name))
    const configuredLibrarian = assistantSettingsResult.data?.librarian_name?.trim() || null

    const immediateAnswer = getImmediatePolicyAnswer(
      query,
      currentPolicy,
      currentLibrarians,
      configuredLibrarian,
      Boolean(librarianResult.error),
      frontDeskFallback,
    )
    if (immediateAnswer) return NextResponse.json({ query, intent, answer: immediateAnswer, results: [], loans: [] })
    if (needsPolicy && !currentPolicy) {
      return NextResponse.json({ error: 'Current library policy is temporarily unavailable. Please contact the library desk.' }, { status: 503 })
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'The AI assistant is not configured. Ask the administrator to add GEMINI_API_KEY.' }, { status: 503 })
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
    const shouldSearchInventory = needsPhysicalInventory(query)
    const inventoryPromise = shouldSearchInventory
      ? supabase.rpc('assistant_search_physical_inventory', { p_query: getCatalogQuery(query) })
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
        .select('id, status, due_date, policy_grace_days, policy_daily_fine, policy_fine_cap, policy_lost_days, books(title, author)')
        .eq('student_id', user.id)
        .order('requested_at', { ascending: false })
        .limit(20)
      : Promise.resolve({ data: [], error: null })
    const finesPromise = intent === 'loans'
      ? supabase
        .from('fines')
        .select('amount, status, fine_type, fine_reason, physical_book_request_id, created_at')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)
      : Promise.resolve({ data: [], error: null })

    const [rpc, inventoryResult, digitalLoanResult, physicalLoanResult, finesResult] = await Promise.all([
      catalogPromise,
      inventoryPromise,
      digitalLoanPromise,
      physicalLoanPromise,
      finesPromise,
    ])
    let results: CatalogSearchRow[] = []
    if (shouldSearchCatalog) {
      if (rpc.error) {
        console.error('Library assistant catalog search failed:', rpc.error)
        return NextResponse.json({ error: 'Catalog search is temporarily unavailable. Please try again.' }, { status: 503 })
      }
      results = filterRelevantCatalogRows(catalogQuerySource, (rpc.data ?? []) as CatalogSearchRow[])
    }
    if (shouldSearchInventory && inventoryResult.error) {
      console.error('Library assistant physical inventory search failed:', inventoryResult.error)
      return NextResponse.json({ error: 'Physical inventory is temporarily unavailable. Please try again.' }, { status: 503 })
    }

    let loans: Array<Record<string, unknown>> = []
    if (intent === 'loans') {
      if (digitalLoanResult.error || physicalLoanResult.error || finesResult.error) {
        console.error('Library assistant account lookup failed:', digitalLoanResult.error ?? physicalLoanResult.error ?? finesResult.error)
        return NextResponse.json({ error: 'Your loan or fine details are temporarily unavailable. Please try again.' }, { status: 503 })
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
          request_id: loan.id,
          status: loan.status,
          due_date: loan.due_date,
          books: loan.books,
          policySnapshot: {
            graceDays: loan.policy_grace_days,
            dailyFine: loan.policy_daily_fine,
            fineCap: loan.policy_fine_cap,
            lostAfterDays: loan.policy_lost_days,
          },
        })),
      ]
    }

    const catalogContext = results.map(({ id, title, author, category, description, available_copies }) => ({
      id,
      title,
      author,
      category,
      description: description?.slice(0, 160) ?? null,
      available_copies,
    }))

    const context = JSON.stringify({
      memberRole,
      currentUserLoans: loans,
      currentUserFines: intent === 'loans' ? (finesResult.data ?? []) : [],
      catalog: catalogContext,
      physicalInventory: shouldSearchInventory ? inventoryResult.data ?? [] : [],
      currentLibrarians: currentLibrarians.length ? currentLibrarians : configuredLibrarian ? [configuredLibrarian] : [],
      ...(needsPolicy ? { circulationGuidance: {
        overdueOrLostPhysicalItem: 'Blocks new physical checkout requests and availability-queue entries; new digital checkouts are also restricted while a physical item is overdue or lost.',
        unpaidPhysicalFine: 'Can affect borrowing privileges; staff collect physical fine payments at the library cashier.',
        physicalRenewals: 'Handled by library staff. Overdue physical loans and loans with an open incident cannot be renewed; fees depend on the selected active term.',
        numericSuspensionThreshold: 'Do not state a numeric fine-balance suspension threshold; ask library staff to confirm.',
      } } : {}),
      libraryPolicy: currentPolicy ? {
        fineGraceDays: currentPolicy.fine_grace_days,
        lateFeePerChargeableDay: currentPolicy.late_fee_per_day,
        lateFeeCapPerItem: currentPolicy.late_fee_cap,
        lostAfterDays: currentPolicy.lost_after_days,
        notice: currentPolicy.policy_notice,
      } : null,
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
      answer = await generateGeminiChatReply(
        geminiMessages,
        [
          'You are the Smart Lib AI Assistant for Mary the Queen College of Quezon City.',
          'Be concise and practical: answer directly, give ordered next steps, and explain likely consequences. Ask only a necessary follow-up.',
          'Use supplied live data as the only authority for library facts. Never invent fees, dates, eligibility, clearance effects, locations, hours, or contacts. If information is missing, say so and refer the user to the library desk.',
          'Use libraryPolicy for current physical fine and lost-item rules; for an existing physical loan use its policySnapshot. Lost/damage charges are staff-assessed; never make up a replacement cost. Digital access has no overdue fines.',
          'Use only currentUserLoans/currentUserFines for the signed-in member; report unpaid fines as outstanding and never infer their account status from chat history.',
          'Recommend only supplied catalog titles. Use physicalInventory results for location and availability. currentLibrarians is a roster, not an on-duty schedule.',
          `For in-person help or physical payments, direct the member to ${frontDeskFallback}.`,
          currentPolicy ? `Current policy: ${JSON.stringify({
            fineGraceDays: currentPolicy.fine_grace_days,
            lateFeePerChargeableDay: currentPolicy.late_fee_per_day,
            lateFeeCapPerItem: currentPolicy.late_fee_cap,
            lostAfterDays: currentPolicy.lost_after_days,
          })}` : 'Live structured library policy is unavailable; do not state policy-specific facts.',
        ].join('\n'),
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
