import { NextResponse } from 'next/server'

/** Keep provider/database details in server logs, not in client-visible responses. */
export function apiError(message: string, status: number, error?: unknown) {
  if (error) console.error(message, error)
  return NextResponse.json({ error: message }, { status })
}

export function positiveInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : null
}

export function boundedText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length <= max ? text : null
}
