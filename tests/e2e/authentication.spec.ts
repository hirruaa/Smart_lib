import { expect, test } from '@playwright/test'

test('guest reader remains gated after a full page refresh', async ({ page }) => {
  await page.goto('/reader/1', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Sign in to read this resource' })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in to read this resource' })).toBeVisible()
  await expect(page.getByText('Digital reading is available to authenticated library members.')).toBeVisible()
})

test('physical-copy QR links use the unified member catalog and require sign-in', async ({ page }) => {
  await page.goto('/dashboard/student?copy=not-a-uuid', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(/\/login/)
})
