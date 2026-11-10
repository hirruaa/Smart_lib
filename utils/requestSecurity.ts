import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type RateLimitOptions = {
  name: string
  limit: number
  windowMs: number
  identity?: string
}

let sharedRateLimitClient: SupabaseClient | null = null

function clientAddress(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown-client'
}

export async function rateLimit(request: Request, options: RateLimitOptions) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    console.error('Shared API rate limiting is not configured.')
    return { allowed: false, retryAfterSeconds: 0 }
  }

  sharedRateLimitClient ??= createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const clientIdentity = options.identity ? `user:${options.identity}` : `ip:${clientAddress(request)}`
  const keyHash = createHash('sha256').update(clientIdentity).digest('hex')
  const { data, error } = await sharedRateLimitClient.rpc('consume_api_rate_limit', {
    p_scope: options.name,
    p_key_hash: keyHash,
    p_limit: options.limit,
    p_window_seconds: Math.ceil(options.windowMs / 1000),
  })
  if (error) {
    console.error('Shared API rate-limit check failed.', { code: error.code, message: error.message })
    return { allowed: false, retryAfterSeconds: 0 }
  }
  const result = Array.isArray(data) ? data[0] : data
  if (!result || typeof result.allowed !== 'boolean' || !Number.isInteger(result.retry_after_seconds)) {
    console.error('Shared API rate-limit check returned an invalid response.')
    return { allowed: false, retryAfterSeconds: 0 }
  }
  return {
    allowed: result.allowed,
    retryAfterSeconds: Math.max(1, result.retry_after_seconds),
  }
}

export function tooManyRequests(retryAfterSeconds: number) {
  if (retryAfterSeconds < 1) {
    return NextResponse.json(
      { error: 'Request protection is temporarily unavailable. Please try again shortly.' },
      { status: 503 },
    )
  }
  return NextResponse.json(
    { error: 'Too many requests. Please wait and try again.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  )
}

export function bodyTooLarge(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get('content-length'))
  return Number.isFinite(contentLength) && contentLength > maxBytes
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true

  const requestOrigin = new URL(request.url).origin
  const configuredOrigins = (process.env.NEXT_PUBLIC_SITE_URL || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean)

  return origin === requestOrigin || configuredOrigins.includes(origin.replace(/\/$/, ''))
}

export function originViolation() {
  return NextResponse.json({ error: 'Untrusted request origin.' }, { status: 403 })
}
