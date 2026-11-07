import { expect, test } from '@playwright/test'
import { adminClient, clearBrowserSession, createTestUser, removeTestUser } from './support'

test('student sign-in rejects an invalid password, routes by role, and persists the profile', async ({ page }) => {
  const user = await createTestUser()
  try {
    await page.goto('/login')

    await page.getByPlaceholder('Your username or email').fill(user.email)
    await page.getByPlaceholder('Your password').fill('incorrect-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('The username/email or password is incorrect.', { exact: true })).toBeVisible()

    await page.getByPlaceholder('Your password').fill(user.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard\/student(?:$|[?#])/, { timeout: 15_000 })

    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    expect(error).toBeNull()
    expect(profile?.role).toBe('student')
  } finally {
    await clearBrowserSession(page)
    await removeTestUser(user)
  }
})
