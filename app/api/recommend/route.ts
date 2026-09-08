import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

type AssistantIntent = 'search' | 'research' | 'loans' | 'policy'

function getIntent(query: string): AssistantIntent {
  if (/research|paper|thesis|journal|academic|study|topic|sources|literature/i.test(query)) return 'research'
  if (/borrow|loan|expire|due|currently have|my books|renew/i.test(query)) return 'loans'
  if (/can i|how long|policy|maximum|limit|days/i.test(query)) return 'policy'
  return 'search'
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const query = (body.query || '').toString().trim()
    if (!query) return NextResponse.json({ error: 'Empty query' }, { status: 400 })

    const supabase = createClient()
    const intent = getIntent(query)
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (intent === 'loans' && !user) {
      return NextResponse.json({
        query,
        intent,
        answer: 'Sign in to view your loans and account-specific borrowing information.',
        results: [],
        loans: [],
      })
    }

    if (intent === 'loans' && user) {
      const { data: loans, error } = await supabase
        .from('borrow_requests')
        .select('id, book_id, status, request_date, due_date, returned_date, books(title, author)')
        .eq('student_id', user.id)
        .order('request_date', { ascending: false })

      if (error) throw error

      return NextResponse.json({
        query,
        intent,
        answer: loans?.length
          ? 'Here is your borrowing activity, including active and previous access.'
          : 'You do not have any borrowing activity yet.',
        results: [],
        loans: loans ?? [],
      })
    }

    // Use server-side full-text search RPC when available for better relevance
    const limit = 8
    const rpc = await supabase.rpc('search_books', { p_query: query, p_limit: limit })
    const results = (rpc.data ?? []) as any[]

    const answer = intent === 'research'
      ? `I found ${results.length} resource${results.length === 1 ? '' : 's'} to support your research. Try adding a method, population, or subject keyword to refine the results.`
      : intent === 'policy'
        ? 'Borrowing duration is configured by the library. Search for a title to see available resources, or ask an administrator about the current lending limit.'
        : results.length
          ? `I found ${results.length} resource${results.length === 1 ? '' : 's'} matching your request.`
          : 'I could not find a matching resource. Try a broader topic, title, author, or category.'

    return NextResponse.json({ query, intent, answer, results, loans: [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
