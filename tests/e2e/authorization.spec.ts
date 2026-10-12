import { expect, test } from '@playwright/test'

test('private APIs reject requests without an authenticated session', async ({ request }) => {
  const checks = [
    request.get('/api/reader/1'),
    request.get('/api/reading-progress?book_id=1'),
    request.get('/api/notifications'),
    request.post('/api/loans', { data: { bookId: 1, durationDays: 7 } }),
    request.post('/api/admin/students', { data: {} }),
  ]

  for (const responsePromise of checks) {
    const response = await responsePromise
    expect(response.status(), `${response.url()} should require authentication`).toBe(401)
  }
})

test('unauthenticated members cannot access contribution files', async ({ request }) => {
  const response = await request.get('/api/contributions/1/file')
  expect(response.status()).toBe(401)
})
