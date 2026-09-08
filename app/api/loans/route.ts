import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const allowedDurations = new Set([7, 14, 30, 45, 60, 90])

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const bookId = Number(body.bookId)
    const durationDays = Number(body.durationDays)

    if (!Number.isInteger(bookId) || !Number.isInteger(durationDays) || !allowedDurations.has(durationDays)) {
      return NextResponse.json({ error: 'Choose a valid lending period.' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Please sign in to borrow a resource.' }, { status: 401 })

    const { error } = await supabase.rpc('request_digital_loan', {
      p_book_id: bookId,
      p_duration_days: durationDays,
    })

    if (error) {
      if (error.message?.includes('request_digital_loan')) {
        return NextResponse.json({ error: 'Digital lending is not configured yet. Ask an administrator to finish the Supabase setup.' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message || 'Unable to create the digital loan request.' }, { status: 409 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong while requesting digital access.' }, { status: 500 })
  }
}
