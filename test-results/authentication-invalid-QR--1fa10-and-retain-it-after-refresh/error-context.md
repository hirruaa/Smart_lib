# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: authentication.spec.ts >> invalid QR links show a recoverable error and retain it after refresh
- Location: tests\e2e\authentication.spec.ts:12:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Browse the collection' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Browse the collection' }) with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Browse the collection' })

```

```yaml
- main "Loading physical collection"
- alert
- dialog "Cookie consent":
  - heading "Your privacy matters" [level=2]
  - paragraph:
    - text: Smart Lib uses necessary cookies for sign-in, security, and preferences. Read our
    - link "Privacy Policy":
      - /url: /privacy
    - text: and
    - link "Cookie Notice":
      - /url: /cookies
    - text: for details.
  - button "Accept"
  - button "Necessary only"
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | 
  3  | test('guest reader remains gated after a full page refresh', async ({ page }) => {
  4  |   await page.goto('/reader/1', { waitUntil: 'domcontentloaded' })
  5  |   await expect(page.getByRole('heading', { name: 'Sign in to read this resource' })).toBeVisible()
  6  | 
  7  |   await page.reload()
  8  |   await expect(page.getByRole('heading', { name: 'Sign in to read this resource' })).toBeVisible()
  9  |   await expect(page.getByText('Digital reading is available to authenticated library members.')).toBeVisible()
  10 | })
  11 | 
  12 | test('invalid QR links show a recoverable error and retain it after refresh', async ({ page }) => {
  13 |   await page.goto('/physical-library?copy=not-a-uuid', { waitUntil: 'domcontentloaded' })
> 14 |   await expect(page.getByRole('heading', { name: 'Browse the collection' })).toBeVisible()
     |                                                                              ^ Error: expect(locator).toBeVisible() failed
  15 |   await expect(page.getByText('This QR label is invalid or its copy was removed.', { exact: false })).toBeVisible()
  16 |   await expect(page.getByText('Unable to check your sign-in status')).toHaveCount(0)
  17 | 
  18 |   await page.reload()
  19 |   await expect(page.getByText('This QR label is invalid or its copy was removed.', { exact: false })).toBeVisible()
  20 |   await expect(page.getByText('Unable to check your sign-in status')).toHaveCount(0)
  21 |   await expect(page.getByPlaceholder('Search title, author, category')).toBeVisible()
  22 | })
  23 | 
```