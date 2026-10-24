import 'server-only'

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } } | { functionCall: { name: string; args: Record<string, unknown> } } | { functionResponse: { name: string; response: Record<string, unknown> } }
type GeminiChatMessage = { role: 'user' | 'model'; text: string }
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'
const MAX_TRANSIENT_RETRIES = 1

function retryDelay(response: Response, retry: number) {
  const retryAfter = response.headers.get('retry-after')
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds * 1000, 3000)
  }
  return 400 * 2 ** retry
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly reason?: string,
  ) {
    super(message)
    this.name = 'GeminiRequestError'
  }
}

async function callGemini(contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }>, config?: Record<string, unknown>, systemInstruction?: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini is not configured. Set GEMINI_API_KEY in the server environment.')
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  const deadline = Date.now() + 30_000
  const requestModel = async (modelName: string) => {
    let currentResponse: Response | undefined
    for (let retry = 0; retry <= MAX_TRANSIENT_RETRIES; retry++) {
      const remainingMs = deadline - Date.now()
      if (remainingMs <= 0) throw new GeminiRequestError('Gemini request timed out.', undefined, 'timeout')
      currentResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents,
            ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
            generationConfig: config,
          }),
          signal: AbortSignal.timeout(Math.min(20_000, remainingMs)),
        },
      )
      if (currentResponse.status !== 503 || retry === MAX_TRANSIENT_RETRIES) return currentResponse
      await wait(Math.min(retryDelay(currentResponse, retry), Math.max(0, deadline - Date.now())))
    }
    if (!currentResponse) throw new Error('Gemini request did not produce an HTTP response.')
    return currentResponse
  }
  let response: Response
  try {
    response = await requestModel(model)
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new GeminiRequestError('Gemini request timed out.', undefined, 'timeout')
    }
    throw new GeminiRequestError('Gemini could not be reached from the server.', undefined, 'network')
  }
  if (!response.ok) {
    const details = await response.text()
    const retiredModel = response.status === 404
      ? /update your code to use models\/([a-zA-Z0-9._-]+)/i.exec(details)?.[1]
      : undefined
    if (retiredModel && retiredModel !== model) {
      try {
        response = await requestModel(retiredModel)
      } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
          throw new GeminiRequestError('Gemini request timed out.', undefined, 'timeout')
        }
        throw new GeminiRequestError('Gemini could not be reached from the server.', undefined, 'network')
      }
    } else {
      throw new GeminiRequestError(`Gemini request failed with status ${response.status}.`, response.status, response.status === 503 ? 'unavailable' : 'provider')
    }
  }
  if (!response.ok) {
    throw new GeminiRequestError(`Gemini request failed with status ${response.status}.`, response.status, response.status === 503 ? 'unavailable' : 'provider')
  }
  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
    promptFeedback?: { blockReason?: string }
  }
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim()
  if (!text) {
    const reason = payload.promptFeedback?.blockReason || payload.candidates?.[0]?.finishReason
    throw new GeminiRequestError(
      reason ? `Gemini did not return text (reason: ${reason}).` : 'Gemini returned an empty response.',
      undefined,
      reason ? 'blocked' : 'empty',
    )
  }
  return text
}

export async function askGemini(prompt: string, attachment?: GeminiPart) {
  const text = await callGemini(
    [{ role: 'user', parts: [{ text: prompt }, ...(attachment ? [attachment] : [])] }],
    {
      responseMimeType: 'application/json',
      maxOutputTokens: 1200,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  )
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('Gemini returned an unreadable result. Please retry or review manually.')
  }
}

export async function generateGeminiChatReply(messages: GeminiChatMessage[], systemInstruction: string) {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = []
  for (const { role, text } of messages) {
    if (!text.trim()) continue
    const previous = contents[contents.length - 1]
    if (!previous && role === 'model') continue
    if (previous?.role === role) {
      previous.parts[0].text = `${previous.parts[0].text}\n\n${text}`
      continue
    }
    contents.push({ role, parts: [{ text }] })
  }
  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    throw new GeminiRequestError('The conversation has no current user message.', undefined, 'invalid-history')
  }
  return callGemini(
    contents,
    { maxOutputTokens: 450, thinkingConfig: { thinkingLevel: 'low' } },
    systemInstruction,
  )
}

export type GeminiFunctionDeclaration = { name: string; description: string; parameters: Record<string, unknown> }
export type GeminiFunctionHandler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>

export async function generateGeminiToolChatReply(
  messages: GeminiChatMessage[],
  systemInstruction: string,
  declarations: GeminiFunctionDeclaration[],
  handlers: Record<string, GeminiFunctionHandler>,
) {
  const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = []
  for (const { role, text } of messages) {
    if (!text.trim()) continue
    const previous = contents[contents.length - 1]
    if (!previous && role === 'model') continue
    if (previous?.role === role) previous.parts.push({ text })
    else contents.push({ role, parts: [{ text }] })
  }
  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    throw new GeminiRequestError('The conversation has no current user message.', undefined, 'invalid-history')
  }
  const tools = [{ functionDeclarations: declarations }]
  let calls = 0
  while (calls <= 3) {
    const result = await callGeminiResponse(contents, { maxOutputTokens: 450, thinkingConfig: { thinkingLevel: 'low' } }, systemInstruction, tools)
    const candidate = result.candidates?.[0]?.content
    const parts = candidate?.parts ?? []
    const functionCalls = parts.filter((part): part is Extract<GeminiPart, { functionCall: { name: string; args: Record<string, unknown> } }> => 'functionCall' in part)
    if (!functionCalls.length) {
      const answer = parts.map((part) => 'text' in part ? part.text : '').join('').trim()
      if (answer) return answer
      const reason = result.promptFeedback?.blockReason || result.candidates?.[0]?.finishReason
      throw new GeminiRequestError('Gemini returned no usable response.', undefined, reason ? 'blocked' : 'empty')
    }
    if (calls + functionCalls.length > 3) break
    contents.push({ role: 'model', parts })
    const functionResponses: GeminiPart[] = []
    for (const call of functionCalls) {
      const handler = handlers[call.functionCall.name]
      const response = handler ? await handler(call.functionCall.args ?? {}) : { error: 'This lookup is unavailable.' }
      functionResponses.push({ functionResponse: { name: call.functionCall.name, response } })
      calls++
    }
    contents.push({ role: 'user', parts: functionResponses })
  }
  throw new GeminiRequestError('Gemini exceeded the allowed number of library lookups.', undefined, 'tool-limit')
}

async function callGeminiResponse(
  contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }>,
  config: Record<string, unknown>,
  systemInstruction: string,
  tools: Array<Record<string, unknown>>,
) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini is not configured. Set GEMINI_API_KEY in the server environment.')
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  let response: Response
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemInstruction }] }, generationConfig: config, tools }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    throw new GeminiRequestError('Gemini could not be reached from the server.', undefined, error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network')
  }
  if (!response.ok) throw new GeminiRequestError(`Gemini request failed with status ${response.status}.`, response.status, response.status === 503 ? 'unavailable' : 'provider')
  return await response.json() as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>
    promptFeedback?: { blockReason?: string }
  }
}

export async function generateGeminiEmbedding(text: string) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Gemini is not configured.')
  const model = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text }] }, outputDimensionality: 768 }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new GeminiRequestError(`Gemini embedding failed with status ${response.status}.`, response.status, 'provider')
  const payload = await response.json() as { embedding?: { values?: number[] } }
  if (!payload.embedding?.values || payload.embedding.values.length !== 768) throw new Error('Gemini returned an invalid 768-dimension embedding.')
  return payload.embedding.values
}
