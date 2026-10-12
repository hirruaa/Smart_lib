import { expect, test } from '@playwright/test'

test('guest reader remains gated after a full page refresh', async ({ page }) => {
  await page.goto('/reader/1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Sign in to read this resource' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in to read this resource' })).toBeVisible()
  await expect(page.getByText('Digital reading is available to authenticated library members.')).toBeVisible()
})

test('invalid QR links show a recoverable error and retain it after refresh', async ({ page }) => {
  await page.goto('/physical-library?copy=not-a-uuid', { waitUntil: 'domcontentloaded' })
  const cookieConsent = page.getByRole('dialog', { name: 'Cookie consent' })
  if (await cookieConsent.isVisible()) {
    await cookieConsent.getByRole('button', { name: 'Necessary only' }).click()
  }

  await expect(page.getByRole('heading', { name: 'Browse the collection' })).toBeVisible()
  await expect(page.getByText('This QR label is invalid or its copy was removed.', { exact: false })).toBeVisible()
  await expect(page.getByText('Unable to check your sign-in status')).toHaveCount(0)

  await page.reload()
  await expect(page.getByText('This QR label is invalid or its copy was removed.', { exact: false })).toBeVisible()
  await expect(page.getByText('Unable to check your sign-in status')).toHaveCount(0)
  await expect(page.getByPlaceholder('Search title, author, category')).toBeVisible()
})
