import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/verify-email'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/verify-email'

  if (!code) {
    const error = requestUrl.searchParams.get('error_description') || 'The verification link is missing or has expired.'
    return NextResponse.redirect(new URL(`/verify-email?status=error&message=${encodeURIComponent(error)}`, requestUrl.origin))
  }

  const supabase = createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(new URL(`/verify-email?status=error&message=${encodeURIComponent(error.message)}`, requestUrl.origin))
  }

  return NextResponse.redirect(new URL(`${safeNext}?status=success`, requestUrl.origin))
}
