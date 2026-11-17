import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
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

test('an unconfirmed member can sign in before verifying their email', async ({ page }) => {
  const suffix = randomUUID()
  const email = `e2e-unconfirmed-${suffix}@smartlib.test`
  const password = `E2e!${randomUUID()}`
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      full_name: `E2E unconfirmed ${suffix.slice(0, 8)}`,
      member_type: 'student',
    },
  })

  if (error || !data.user) throw new Error(`Unable to create an unconfirmed test account: ${error?.message ?? 'No user returned'}`)
  const user = { id: data.user.id, email, password, role: 'student' as const }

  try {
    expect(data.user.email_confirmed_at).toBeFalsy()
    await page.goto('/login')
    await page.getByPlaceholder('Your username or email').fill(email)
    await page.getByPlaceholder('Your password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/dashboard\/student(?:$|[?#])/, { timeout: 15_000 })
  } finally {
    await clearBrowserSession(page)
    await removeTestUser(user)
  }
})
