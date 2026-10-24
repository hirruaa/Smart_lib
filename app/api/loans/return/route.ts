import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, sameOrigin, tooManyRequests, originViolation } from '@/utils/requestSecurity'

export async function POST(request: Request) {
  if (!sameOrigin(request)) return originViolation()
  const requestLimit = rateLimit(request, { name: 'digital-loan-return', limit: 10, windowMs: 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  return NextResponse.json({ error: 'Self-service returns are unavailable. Digital access expires on its displayed date; contact the librarian if you need help.' }, { status: 410 })
}
