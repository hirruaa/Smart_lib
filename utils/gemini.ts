import 'server-only'

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } }

export async function askGemini(prompt: string, attachment?: GeminiPart) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini is not configured. Set GEMINI_API_KEY in the server environment.')
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, ...(attachment ? [attachment] : [])] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  )
  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Gemini request failed (${response.status}): ${details.slice(0, 500)}`)
  }
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim()
  if (!text) throw new Error('Gemini did not return a screening result.')
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('Gemini returned an unreadable result. Please retry or review manually.')
  }
}
