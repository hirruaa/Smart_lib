import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const query = (body.query || '').toString().trim()
    if (!query) return NextResponse.json({ error: 'Empty query' }, { status: 400 })

    const supabase = createClient()

    // Use server-side full-text search RPC when available for better relevance
    const limit = 8
    const rpc = await supabase.rpc('search_books', { p_query: query, p_limit: limit })
    const results = (rpc.data ?? []) as any[]

    return NextResponse.json({ query, results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 })
  }
}
