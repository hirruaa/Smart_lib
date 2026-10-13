import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return originViolation()
    if (bodyTooLarge(request, 8_192)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
    const requestLimit = rateLimit(request, { name: 'digital-loan', limit: 10, windowMs: 60_000 })
    if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
    const body = await request.json()
    const bookId = Number(body.bookId)
    const durationDays = Number(body.durationDays)

    if (!Number.isInteger(bookId) || ![1, 3, 7, 14, 30].includes(durationDays)) {
      return NextResponse.json({ error: 'Choose a valid lending period.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Please sign in to borrow a resource.' }, { status: 401 })

    const { data: loan, error } = await supabase.rpc('request_digital_loan', {
      p_book_id: bookId,
      p_duration_days: durationDays,
    })

    if (error) {
      if (error.message?.includes('request_digital_loan')) {
        return NextResponse.json({ error: 'Digital lending is not configured yet. Ask an administrator to finish the Supabase setup.' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message || 'Unable to create the digital loan request.' }, { status: 409 })
    }

    return NextResponse.json({ success: true, status: loan?.status, dueDate: loan?.due_date, pointsCost: loan?.points_cost })
  } catch {
    return NextResponse.json({ error: 'Something went wrong while requesting digital access.' }, { status: 500 })
  }
}
