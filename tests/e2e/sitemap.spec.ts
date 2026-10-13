import { expect, test } from '@playwright/test'

test('sitemap serves well-formed XML with the configured local canonical origin', async ({ page, request }) => {
  const response = await request.get('/sitemap.xml')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/xml')

  const result = await page.evaluate((xml) => {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    return {
      root: document.documentElement.localName,
      hasParseError: document.querySelector('parsererror') !== null,
      urls: Array.from(document.getElementsByTagName('loc'), (element) => element.textContent),
    }
  }, await response.text())

  expect(result.root).toBe('urlset')
  expect(result.hasParseError).toBe(false)
  expect(result.urls).toEqual(expect.arrayContaining([
    'http://localhost:3100/',
    'http://localhost:3100/privacy',
    'http://localhost:3100/terms',
    'http://localhost:3100/cookies',
  ]))
})

test('robots publishes the sitemap URL for the configured local canonical origin', async ({ request }) => {
  const response = await request.get('/robots.txt')
  expect(response.status()).toBe(200)
  await expect(response.text()).resolves.toContain('Sitemap: http://localhost:3100/sitemap.xml')
})
