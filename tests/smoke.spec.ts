import { test, expect } from '@playwright/test'

const adminEmail = process.env.SMOKE_ADMIN_EMAIL || 'admin@test.com'
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || 'admin123'
const studentEmail = process.env.SMOKE_STUDENT_EMAIL || 'student@test.com'
const studentPassword = process.env.SMOKE_PASSWORD || 'student123'

const waitForUserNavigation = async (page: any, url: RegExp) => {
  await page.waitForURL(url, { timeout: 20000 })
}

const signInAccount = async (page: any, email: string, password: string) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: /sign in to your account/i })).toBeVisible()
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button:has-text("Sign in")')

  // Wait for either dashboard navigation or an auth error message
  try {
    await page.waitForURL(/dashboard\/(admin|student)/, { timeout: 8000 })
    return
  } catch (e) {
    // If sign-in failed, look for invalid credentials text
    const invalid = await page.getByText(/invalid login credentials/i).first().isVisible().catch(() => false)
    if (invalid) {
      throw new Error(`Invalid login credentials for ${email}. Create the account or set correct env vars.`)
    }
  }
}

const signUpAccount = async (page: any, email: string, password: string) => {
  await page.goto('/login')
  await page.click('button:has-text("Create an account")')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.selectOption('select', 'student')
  await page.click('button:has-text("Create account")')
  await expect(page.getByText('Sign-up successful')).toBeVisible({ timeout: 20000 })
}

test.describe('Smart Lib smoke test', () => {
  test.setTimeout(120000)
  // no global signup; test will attempt signup if sign-in fails

  test('login and dashboard redirect flow works', async ({ page }) => {
    await signInAccount(page, adminEmail, adminPassword)
    await waitForUserNavigation(page, /dashboard\/(admin|student)/)
    await expect(page).toHaveURL(/dashboard\/(admin|student)/)
  })

  test('admin dashboard renders and public navigation is available', async ({ page }) => {
    await signInAccount(page, adminEmail, adminPassword)
    await waitForUserNavigation(page, /dashboard\/admin/)
    await expect(page.getByText('Admin Menu')).toBeVisible({ timeout: 60000 })
    await expect(page.getByText('Book inventory')).toBeVisible({ timeout: 60000 })
  })

  test('student dashboard redirects and shows student header', async ({ page }) => {
    await signInAccount(page, studentEmail, studentPassword)
    await waitForUserNavigation(page, /dashboard\/student/)
    await expect(page.getByText('Student Dashboard')).toBeVisible({ timeout: 60000 })
  })
})
