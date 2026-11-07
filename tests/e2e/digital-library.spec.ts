import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { adminClient, clearBrowserSession, createDigitalBook, createTestUser, createUserClient, removeTestBook, removeTestUser, signInInBrowser } from './support'

test('free digital access appears in the member transaction view and remains persisted', async ({ page, browser }) => {
  const user = await createTestUser()
  const title = `E2E Digital ${randomUUID()}`
  let bookId: number | undefined
  const unauthenticatedContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' })

  try {
    bookId = await createDigitalBook(title)
    const memberClient = createUserClient()
    const { error: signInError } = await memberClient.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    })
    expect(signInError).toBeNull()

    const { data: loan, error: requestError } = await memberClient.rpc('request_digital_loan', {
      p_book_id: bookId,
      p_duration_days: 7,
    })
    expect(requestError).toBeNull()
    expect(loan?.status).toBe('approved')

    await signInInBrowser(page, user)
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
    await expect(page.getByText(title, { exact: true })).toBeVisible()

    const { data: persistedLoan, error: readError } = await adminClient
      .from('borrow_requests')
      .select('status')
      .eq('student_id', user.id)
      .eq('book_id', bookId)
      .single()
    expect(readError).toBeNull()
    expect(persistedLoan?.status).toBe('approved')

    const unauthenticatedPage = await unauthenticatedContext.newPage()
    await unauthenticatedPage.goto('/library')
    await expect(unauthenticatedPage).toHaveURL(/\/login/)
  } finally {
    await unauthenticatedContext.close()
    await clearBrowserSession(page)
    if (bookId !== undefined) await removeTestBook(bookId)
    await removeTestUser(user)
  }
})

test('catalog relevance ranks title and subject matches ahead of description-only matches', async ({ page }) => {
  const user = await createTestUser()
  const suffix = randomUUID()
  const titleMatch = `Quantum Biology Handbook ${suffix}`
  const descriptionMatch = `General Science Resource ${suffix}`
  let titleMatchId: number | undefined
  let descriptionMatchId: number | undefined

  try {
    titleMatchId = await createDigitalBook(titleMatch)
    descriptionMatchId = await createDigitalBook(descriptionMatch)
    const [{ error: titleUpdateError }, { error: descriptionUpdateError }] = await Promise.all([
      adminClient.from('books').update({ author: 'Academic Reference', category: 'Biology', description: 'A practical reference for students.', created_at: '2025-01-01T00:00:00Z' }).eq('id', titleMatchId),
      adminClient.from('books').update({ author: 'Science Faculty', category: 'General Studies', description: 'An introduction to quantum biology for general readers.', created_at: '2020-01-01T00:00:00Z' }).eq('id', descriptionMatchId),
    ])
    expect(titleUpdateError).toBeNull()
    expect(descriptionUpdateError).toBeNull()

    await signInInBrowser(page, user)
    await page.goto('/dashboard/student', { waitUntil: 'domcontentloaded' })
    const catalogSearch = page.getByRole('searchbox', { name: 'Search the library catalog' })
    await expect(catalogSearch).toBeVisible()
    await catalogSearch.fill('quantum biology')

    const results = page.locator('.resource-card h3')
    await expect(results).toHaveCount(2)
    await expect(results.first()).toHaveText(titleMatch)
    await expect(results.nth(1)).toHaveText(descriptionMatch)
    await page.getByRole('combobox', { name: 'Sort by' }).selectOption('newest')
    await expect(results.first()).toHaveText(titleMatch)
  } finally {
    await clearBrowserSession(page)
    if (titleMatchId !== undefined) await removeTestBook(titleMatchId)
    if (descriptionMatchId !== undefined) await removeTestBook(descriptionMatchId)
    await removeTestUser(user)
  }
})
