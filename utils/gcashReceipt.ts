type ReferenceScan = { reference: string | null }

function normalizeReference(value: string): string | null {
  const normalized = value
    .replace(/[OoQ]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[^0-9]/g, '')

  return /^\d{10,16}$/.test(normalized) ? normalized : null
}

export function parseGcashReference(ocrText: string): string | null {
  const lines = ocrText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const label = /(?:transaction\s*(?:reference|id|no\.?|number)|reference\s*(?:no\.?|number|#)?|ref\.?\s*(?:no\.?|#)?)/i

  for (let index = 0; index < lines.length; index += 1) {
    const match = label.exec(lines[index])
    if (!match) continue

    const followingText = `${lines[index].slice(match.index + match[0].length)} ${lines[index + 1] ?? ''}`
    const candidates = followingText.match(/[0-9OoQIl|][0-9OoQIl|\s-]{8,24}[0-9OoQIl|]/g) ?? []
    for (const candidate of candidates) {
      const reference = normalizeReference(candidate)
      if (reference) return reference
    }
  }

  return null
}

export async function extractGcashReference(file: File): Promise<ReferenceScan> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG, or WebP receipt image no larger than 5 MB.')
  }

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(file)
    return { reference: parseGcashReference(data.text) }
  } finally {
    await worker.terminate()
  }
}
