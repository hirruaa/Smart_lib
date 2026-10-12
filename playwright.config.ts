import { defineConfig, devices } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'

const baseURL = 'http://127.0.0.1:3100'
const testEnvPath = resolve(process.cwd(), '.env.test.local')

if (!existsSync(testEnvPath)) {
  throw new Error('Playwright requires a local-only .env.test.local file. Copy .env.test.example and use keys from the local Supabase instance.')
}

const testEnv = parse(readFileSync(testEnvPath))
const supabaseUrl = testEnv.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = testEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = testEnv.SUPABASE_SERVICE_ROLE_KEY

if (
  !supabaseUrl ||
  !supabaseAnonKey ||
  !supabaseServiceRoleKey ||
  [supabaseAnonKey, supabaseServiceRoleKey].some((key) => key.startsWith('replace-with-'))
) {
  throw new Error('.env.test.local must contain the local Supabase URL, anon key, and service-role key.')
}

const supabaseOrigin = new URL(supabaseUrl)
if (
  supabaseOrigin.protocol !== 'http:' ||
  !['localhost', '127.0.0.1', '[::1]', '::1'].includes(supabaseOrigin.hostname)
) {
  throw new Error('Playwright only accepts a loopback Supabase URL; refusing to run against a remote project.')
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: baseURL,
    env: {
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3100',
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
      GEMINI_API_KEY: '',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_REFRESH_TOKEN: '',
      GOOGLE_DRIVE_ROOT_FOLDER_ID: '',
      GOOGLE_DRIVE_SHARED_DRIVE_ID: '',
      CRON_SECRET: '',
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
