import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { clearBrowserSession, createTestUser, removeTestUser, signInInBrowser } from './support'

test('member dashboard and wallet modal have no critical or serious WCAG 2.2 violations', async ({ page }) => {
  const student = await createTestUser()
  try {
    await signInInBrowser(page, student)
    const dashboardResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const dashboardIssues = dashboardResults.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    expect(dashboardIssues, dashboardIssues.map((violation) => `${violation.id}: ${violation.help}`).join('; ')).toEqual([])

    await page.getByRole('button', { name: 'Wallet' }).click()
    const wallet = page.getByRole('dialog', { name: 'Points wallet' })
    await expect(wallet).toBeVisible()
    const modalResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    const modalIssues = modalResults.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    expect(modalIssues, modalIssues.map((violation) => `${violation.id}: ${violation.help}`).join('; ')).toEqual([])
  } finally {
    await clearBrowserSession(page)
    await removeTestUser(student)
  }
})

test('student and faculty dashboards keep common library dialogs available and closable', async ({ page }) => {
  const student = await createTestUser('student')
  const faculty = await createTestUser('faculty')

  try {
    for (const [user, route] of [[student, '/dashboard/student'], [faculty, '/dashboard/faculty']] as const) {
      await signInInBrowser(page, user)
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('#explore').getByRole('searchbox', { name: 'Search the library catalog' })).toBeVisible()
      await expect(page.locator('#explore').getByRole('heading', { name: 'Explore the catalog' })).toBeVisible()
      await expect(page.locator('#explore .catalog-heading-stat')).toBeVisible()
      await expect(page.locator('#explore .dashboard-catalog-search-submit')).toHaveCSS('color', 'rgb(255, 255, 255)')
      await expect(page.locator('.student-hero-summary')).toBeVisible()
      const walletButton = page.getByRole('button', { name: 'Wallet' })
      await expect(walletButton).toHaveCSS('font-size', '12px')
      await expect(walletButton).toHaveCSS('color', 'rgb(255, 255, 255)')
      await expect(page.locator('.student-hero-stat-value span').first()).toHaveCSS('font-size', '11px')
      await expect(page.locator('.student-hero-stat-value').first()).toHaveCSS('display', 'grid')
      await expect(page.locator('.student-hero-stat-value strong').first()).toHaveCSS('font-variant-numeric', 'tabular-nums')
      const summaryCards = page.locator('.student-hero-summary > .student-hero-stat')
      await expect(summaryCards).toHaveCount(3)
      await expect(summaryCards.first()).toHaveCSS('border-radius', '18px')
      await expect(summaryCards.first()).toHaveCSS('background-color', 'rgb(252, 251, 247)')
      await expect(summaryCards.first().locator('.student-hero-stat-value strong')).toHaveCSS('font-size', '25px')
      await expect(page.getByRole('button', { name: 'Scan book QR' })).toHaveCount(0)
      await expect(page.locator('.student-hero-actions')).toBeVisible()

      const sidebar = page.locator('.student-sidebar')
      await expect(page.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
      await page.getByRole('button', { name: 'Collapse navigation' }).click()
      await expect(page.locator('.student-layout')).toHaveClass(/sidebar-collapsed/)
      await expect(sidebar).toHaveCSS('padding-top', '16px')
      await page.getByRole('button', { name: 'Expand navigation' }).click()
      await expect(page.locator('.student-layout')).not.toHaveClass(/sidebar-collapsed/)

      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await expect(sidebar).toHaveClass(/sidebar-open/)
      await page.keyboard.press('Escape')
      await expect(sidebar).not.toHaveClass(/sidebar-open/)
      await page.setViewportSize({ width: 1280, height: 900 })

      let recommendationAttempts = 0
      await page.route('**/api/assistant/sessions**', async (route) => {
        const request = route.request()
        if (request.method() === 'GET') {
          const hasSessionId = new URL(request.url()).searchParams.has('session_id')
          await route.fulfill({ json: hasSessionId ? { messages: [] } : { sessions: [] } })
          return
        }
        const body = request.postDataJSON()
        await route.fulfill({
          json: body.sessionId
            ? { success: true }
            : { session: { id: 'mock-assistant-session', title: body.title } },
        })
      })
      await page.route('**/api/recommend', async (route) => {
        recommendationAttempts += 1
        if (recommendationAttempts === 1) {
          await route.fulfill({ status: 504, json: { error: 'Gemini is taking too long to respond. Please try again.' } })
          return
        }
        await route.fulfill({ json: { answer: 'The current library policy is available from the circulation desk.' } })
      })
      await page.setViewportSize({ width: 517, height: 570 })
      await page.getByRole('button', { name: 'Open library assistant' }).click()
      const assistantPanel = page.locator('.assistant-floating-window')
      await expect(assistantPanel).toBeVisible()
      const assistantLayout = await assistantPanel.evaluate((panel) => {
        const bounds = (selector: string) => {
          const element = panel.querySelector<HTMLElement>(selector)
          if (!element) throw new Error(`Missing assistant layout element: ${selector}`)
          const rect = element.getBoundingClientRect()
          return { top: rect.top, bottom: rect.bottom }
        }
        return {
          thread: bounds('.assistant-thread'),
          suggestions: bounds('.assistant-suggestions'),
          composer: bounds('.assistant-composer'),
        }
      })
      expect(assistantLayout.thread.bottom).toBeLessThanOrEqual(assistantLayout.suggestions.top + 1)
      expect(assistantLayout.suggestions.bottom).toBeLessThanOrEqual(assistantLayout.composer.top + 1)
      await page.setViewportSize({ width: 1280, height: 900 })
      const assistantPrompt = 'What is the overdue fine policy?'
      await assistantPanel.getByRole('textbox', { name: 'Message your library assistant' }).fill(assistantPrompt)
      await assistantPanel.getByRole('button', { name: 'Send message' }).click()
      await expect(assistantPanel.locator('.assistant-error')).toContainText('Gemini is taking too long')
      await expect(assistantPanel.getByRole('button', { name: 'Retry' })).toBeEnabled()
      await assistantPanel.getByRole('button', { name: 'Retry' }).click()
      await expect(assistantPanel.locator('.assistant-message-assistant').last()).toContainText('available from the circulation desk')
      await expect(assistantPanel.locator('.assistant-session-select')).toHaveText(assistantPrompt)
      await assistantPanel.getByRole('button', { name: 'New chat' }).click()
      await expect(assistantPanel.locator('.assistant-session-item')).toHaveCount(1)
      await page.unroute('**/api/assistant/sessions**')
      await page.unroute('**/api/recommend')

      await page.getByRole('button', { name: 'Open borrow requests' }).click()
      const requestsDialog = page.getByRole('dialog', { name: 'Borrow requests' })
      await expect(requestsDialog).toBeVisible()
      await requestsDialog.getByRole('button', { name: 'Close borrow requests' }).click()
      await expect(requestsDialog).toHaveCount(0)

      await page.locator('.student-hero-actions button[title="Notifications"]').click()
      const notificationsDialog = page.getByRole('dialog', { name: 'Notifications' })
      await expect(notificationsDialog).toBeVisible()
      await notificationsDialog.getByRole('button', { name: 'Close notifications' }).click()

      const walletLauncher = page.getByRole('button', { name: 'Wallet' })
      await walletLauncher.click()
      const walletDialog = page.getByRole('dialog', { name: 'Points wallet' })
      await expect(walletDialog).toBeVisible()
      const walletClose = walletDialog.getByRole('button', { name: 'Close Points wallet' })
      await expect(walletClose).toBeFocused()
      const walletDetails = walletDialog.getByRole('button', { name: 'View wallet details' })
      await page.keyboard.press('Shift+Tab')
      await expect(walletDetails).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(walletClose).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(walletDialog).toHaveCount(0)
      await expect(walletLauncher).toBeFocused()

      await page.getByRole('button', { name: 'View loans and charges' }).click()
      const loansDialog = page.getByRole('dialog', { name: 'Physical requests & loans' })
      await expect(loansDialog).toBeVisible()
      await loansDialog.getByRole('button', { name: 'Close transactions' }).click()

      await page.getByRole('button', { name: 'History' }).click()
      const historyDialog = page.getByRole('dialog', { name: 'Reading history' })
      await expect(historyDialog).toBeVisible()
      await historyDialog.getByRole('button', { name: 'Close reading history' }).click()

      const myLibraryNavigation = page.getByRole('button', { name: 'My library' })
      await myLibraryNavigation.click()
      await expect(myLibraryNavigation).toHaveAttribute('aria-current', 'page')
      await expect(myLibraryNavigation).toHaveClass(/active/)
      const libraryDialog = page.getByRole('dialog', { name: 'My library' })
      await expect(libraryDialog).toBeVisible()
      await libraryDialog.getByRole('button', { name: 'Close my library' }).click()

      await page.getByRole('button', { name: 'Profile' }).click()
      const profileDialog = page.getByRole('dialog', { name: 'Your profile' })
      await expect(profileDialog).toBeVisible()
      await expect(profileDialog.locator('.profile-identity')).toBeVisible()
      await expect(profileDialog.getByRole('heading', { name: 'Personal details' })).toBeVisible()
      await expect(profileDialog.getByRole('heading', { name: 'Account activity' })).toHaveCount(0)
      await expect(profileDialog.getByText('School', { exact: true })).toHaveCount(0)
      await expect(profileDialog.getByRole('button', { name: 'Update password' })).toHaveCSS('color', 'rgb(255, 255, 255)')
      await expect(profileDialog).toHaveCSS('width', '672px')
      await expect(profileDialog.locator('.base-modal-content')).toHaveJSProperty('scrollWidth', await profileDialog.locator('.base-modal-content').evaluate((element) => element.clientWidth))
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(profileDialog).toBeVisible()
      const profileBounds = await profileDialog.boundingBox()
      expect(profileBounds?.width).toBeLessThan(390)
      await expect(profileDialog.locator('.base-modal-content')).toHaveJSProperty('scrollWidth', await profileDialog.locator('.base-modal-content').evaluate((element) => element.clientWidth))
      await page.setViewportSize({ width: 1280, height: 900 })
      await profileDialog.getByRole('button', { name: 'Close Your profile' }).click()

      await clearBrowserSession(page)
    }
  } finally {
    await clearBrowserSession(page)
    await removeTestUser(student)
    await removeTestUser(faculty)
  }
})
