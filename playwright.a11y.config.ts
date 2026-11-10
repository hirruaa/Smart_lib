import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:3200'

export default defineConfig({
  testDir: './tests/a11y',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
  },
  webServer: {
    command: 'npm run start -- --hostname 127.0.0.1 --port 3200',
    url: `${baseURL}/privacy`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'accessibility-test-placeholder',
    },
  },
})
