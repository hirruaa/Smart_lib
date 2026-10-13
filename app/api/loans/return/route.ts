import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { bodyTooLarge, rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  if (bodyTooLarge(request, 8_192)) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 })
  const requestLimit = rateLimit(request, { name: 'digital-loan-return', limit: 10, windowMs: 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)

  let body: { requestId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'The request body must be valid JSON.' }, { status: 400 })
  }
  const requestId = Number(body.requestId)
  if (!Number.isSafeInteger(requestId) || requestId < 1) {
    return NextResponse.json({ error: 'A valid loan request is required.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const { data: loan, error } = await supabase.rpc('return_digital_loan', { request_id: requestId })
  if (error) return NextResponse.json({ error: error.message || 'Unable to return this e-book.' }, { status: 409 })
  return NextResponse.json({ success: true, loan })
}
