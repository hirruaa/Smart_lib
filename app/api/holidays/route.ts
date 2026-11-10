import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests } from '@/utils/requestSecurity'

type NagerHoliday = {
  date: string
  localName: string
  name: string
  countryCode: string
  global: unknown
  types: string[]
}

function isNagerHoliday(value: unknown): value is NagerHoliday {
  if (!value || typeof value !== 'object') return false
  const holiday = value as Record<string, unknown>
  return typeof holiday.date === 'string'
    && typeof holiday.localName === 'string'
    && typeof holiday.name === 'string'
    && holiday.countryCode === 'PH'
    && typeof holiday.global === 'boolean'
    && Array.isArray(holiday.types)
    && holiday.types.every((type) => typeof type === 'string')
}

function isCalendarDate(value: string, year: number) {
  if (!new RegExp(`^${year}-\\d{2}-\\d{2}$`).test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function GET(request: Request) {
  const requestLimit = rateLimit(request, { name: 'public-holiday-calendar', limit: 10, windowMs: 60_000 })
  if (!requestLimit.allowed) return tooManyRequests(requestLimit.retryAfterSeconds)

  const yearValue = new URL(request.url).searchParams.get('year')
  const year = Number(yearValue)
  const currentYear = new Date().getFullYear()
  if (!yearValue || !/^\d{4}$/.test(yearValue) || !Number.isInteger(year) || year < currentYear || year > currentYear + 2) {
    return NextResponse.json({ error: `Choose a year from ${currentYear} to ${currentYear + 2}.` }, { status: 400 })
  }

  let response: Response
  try {
    response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The holiday provider could not be reached.'
    console.error(`[SmartLib] Philippine holiday provider request failed: ${message}`)
    return NextResponse.json({ error: 'The Philippine holiday calendar is temporarily unavailable. Try again later.' }, { status: 502 })
  }

  if (!response.ok) {
    console.error(`[SmartLib] Philippine holiday provider returned HTTP ${response.status} for ${year}.`)
    return NextResponse.json({ error: `The holiday provider could not return a calendar for ${year}.` }, { status: 502 })
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return NextResponse.json({ error: 'The holiday provider returned an invalid calendar.' }, { status: 502 })
  }
  if (!Array.isArray(payload) || !payload.every(isNagerHoliday)) {
    return NextResponse.json({ error: 'The holiday provider returned an unsupported calendar format.' }, { status: 502 })
  }

  const holidays = payload
    .filter((holiday) => holiday.global
      && holiday.types.includes('Public')
      && isCalendarDate(holiday.date, year)
      && (holiday.localName.trim() || holiday.name.trim()).length >= 1
      && (holiday.localName.trim() || holiday.name.trim()).length <= 120)
    .map((holiday) => ({ holiday_date: holiday.date, name: holiday.localName.trim() || holiday.name.trim() }))
  if (holidays.length === 0) {
    return NextResponse.json({ error: `No Philippine public holidays were returned for ${year}.` }, { status: 502 })
  }

  return NextResponse.json({ holidays })
}
