import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('public information pages have no automated WCAG 2.2 A/AA violations', async ({ page }) => {
  for (const route of ['/privacy', '/terms', '/cookies']) {
    await page.goto(route)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(results.violations, `${route}: ${results.violations.map((violation) => `${violation.id}: ${violation.help}`).join('; ')}`).toEqual([])
  }
})
