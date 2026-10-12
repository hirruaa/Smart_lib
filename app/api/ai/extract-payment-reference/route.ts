import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { askGemini } from '@/utils/gemini'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const image = form?.get('image')
  if (!(image instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Choose a JPG, PNG, or WebP receipt image no larger than 5 MB.' }, { status: 400 })
  }

  try {
    const result = await askGemini(
      'Read this payment receipt image and find the transaction/reference ID only. Do not infer whether payment succeeded or is genuine. Respond as JSON: {"reference":"exact printed reference or empty string","confidence":0-1}.',
      { inlineData: { mimeType: image.type, data: Buffer.from(await image.arrayBuffer()).toString('base64') } },
    )
    const reference = String(result.reference || '').trim().slice(0, 100)
    const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0))
    return NextResponse.json({ reference, confidence, requiresConfirmation: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gemini could not read the receipt.' }, { status: 502 })
  }
}
