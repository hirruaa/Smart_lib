/**
 * Create a unique, checksum-valid ISBN-13-shaped identifier for catalog use.
 * This is not a publisher-assigned ISBN and must not be presented as one.
 */
export function generateCatalogIsbn(existingIsbns: Array<string | null | undefined>): string {
  const existing = new Set(existingIsbns.map((isbn) => (isbn ?? '').replace(/[^0-9X]/gi, '').toUpperCase()).filter(Boolean))

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const random = new Uint8Array(9)
    crypto.getRandomValues(random)
    const firstTwelve = `978${Array.from(random, (value) => String(value % 10)).join('')}`
    const checksum = firstTwelve.split('').reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
    const candidate = `${firstTwelve}${(10 - (checksum % 10)) % 10}`
    if (!existing.has(candidate)) return candidate
  }

  throw new Error('Unable to generate a unique catalog identifier. Please try again.')
}
