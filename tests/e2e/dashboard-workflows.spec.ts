import { expect, test } from '@playwright/test'
import { clearBrowserSession, createTestUser, removeTestUser, signInInBrowser } from './support'

test('student and faculty dashboards keep common library dialogs available and closable', async ({ page }) => {
  const student = await createTestUser('student')
  const faculty = await createTestUser('faculty')

  try {
    for (const [user, route] of [[student, '/dashboard/student'], [faculty, '/dashboard/faculty']] as const) {
      await signInInBrowser(page, user)
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('#explore').getByRole('searchbox', { name: 'Search the library catalog' })).toBeVisible()
      await expect(page.locator('.student-hero-summary')).toBeVisible()

      await page.getByRole('button', { name: 'Open borrow requests' }).click()
      const requestsDialog = page.getByRole('dialog', { name: 'Borrow requests' })
      await expect(requestsDialog).toBeVisible()
      await requestsDialog.getByRole('button', { name: 'Close borrow requests' }).click()
      await expect(requestsDialog).toHaveCount(0)

      await page.locator('.student-hero-actions button[title="Notifications"]').click()
      const notificationsDialog = page.getByRole('dialog', { name: 'Notifications' })
      await expect(notificationsDialog).toBeVisible()
      await notificationsDialog.getByRole('button', { name: 'Close notifications' }).click()

      await page.getByRole('button', { name: 'Wallet' }).click()
      const walletDialog = page.getByRole('dialog', { name: 'Points wallet' })
      await expect(walletDialog).toBeVisible()
      const walletClose = walletDialog.getByRole('button', { name: 'Close Points wallet' })
      await expect(walletClose).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(walletDialog).toHaveCount(0)

      await page.getByRole('button', { name: 'View loans and charges' }).click()
      const loansDialog = page.getByRole('dialog', { name: 'Physical requests & loans' })
      await expect(loansDialog).toBeVisible()
      await loansDialog.getByRole('button', { name: 'Close transactions' }).click()

      await page.getByRole('button', { name: 'History' }).click()
      const historyDialog = page.getByRole('dialog', { name: 'Reading history' })
      await expect(historyDialog).toBeVisible()
      await historyDialog.getByRole('button', { name: 'Close reading history' }).click()

      await page.getByRole('button', { name: 'My library' }).click()
      const libraryDialog = page.getByRole('dialog', { name: 'My library' })
      await expect(libraryDialog).toBeVisible()
      await libraryDialog.getByRole('button', { name: 'Close my library' }).click()

      await page.getByRole('button', { name: 'Profile' }).click()
      const profileDialog = page.getByRole('dialog', { name: 'Your profile' })
      await expect(profileDialog).toBeVisible()
      await profileDialog.getByRole('button', { name: 'Close Your profile' }).click()

      await page.getByRole('button', { name: 'Scan book QR' }).click()
      const scannerDialog = page.getByRole('dialog', { name: 'Scan book QR' })
      await expect(scannerDialog).toBeVisible()
      await scannerDialog.getByRole('button', { name: 'Close QR scanner' }).click()

      await clearBrowserSession(page)
    }
  } finally {
    await clearBrowserSession(page)
    await removeTestUser(student)
    await removeTestUser(faculty)
  }
})
