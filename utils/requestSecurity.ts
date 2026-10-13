import { NextResponse } from 'next/server'

type RateLimitOptions = {
  name: string
  limit: number
  windowMs: number
  identity?: string
}

type Bucket = { count: number; resetAt: number }

// This is a safe single-instance fallback. Production deployments should back
// this with Redis/Upstash so limits are shared by every app instance.
const buckets = new Map<string, Bucket>()
let lastCleanup = 0

function clientAddress(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown-client'
}

export function rateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now()
  if (now - lastCleanup > 60_000) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
    lastCleanup = now
  }

  const key = `${options.name}:${options.identity || clientAddress(request)}`
  const existing = buckets.get(key)
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + options.windowMs }
  bucket.count += 1
  buckets.set(key, bucket)

  return {
    allowed: bucket.count <= options.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

export function tooManyRequests(retryAfterSeconds: number) {
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
