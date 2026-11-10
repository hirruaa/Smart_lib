import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { parse } from 'dotenv'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'

const env = parse(readFileSync(resolve(process.cwd(), '.env.test.local')))
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('E2E tests require local Supabase credentials in .env.test.local.')
}

export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export type TestUser = {
  id: string
  email: string
  password: string
  role: 'student' | 'faculty' | 'admin' | 'librarian'
}

export async function setTestInstitutionalId(user: TestUser): Promise<string> {
  const digits = `7${randomUUID().replace(/\D/g, '').slice(0, 7)}`
  const institutionalId = digits
  const { error } = await adminClient.from('profiles').upsert({
    id: user.id,
    email: user.email,
    full_name: `E2E member ${digits.slice(-4)}`,
    role: 'student',
    institutional_id: institutionalId,
  }, { onConflict: 'id' })
  if (error) throw new Error(`Unable to prepare a test institutional ID: ${error.message}`)
  return institutionalId
}

export async function createTestUser(role: 'student' | 'faculty' | 'admin' | 'librarian' = 'student'): Promise<TestUser> {
  const suffix = randomUUID()
  const email = `e2e-${suffix}@smartlib.test`
  const password = `E2e!${randomUUID()}`
  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: `E2E ${role} ${suffix.slice(0, 8)}`,
      member_type: role,
    },
  })

  if (error || !data.user) throw new Error(`Unable to create local E2E invitation: ${error?.message ?? 'No user returned'}`)

  const { error: passwordError } = await adminClient.auth.admin.updateUserById(data.user.id, {
    email,
    password,
    email_confirm: true,
  })
  if (passwordError) {
    await adminClient.auth.admin.deleteUser(data.user.id)
    throw new Error(`Unable to prepare the local E2E account: ${passwordError.message}`)
  }

  if (role !== 'student') {
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ role })
      .eq('id', data.user.id)
    if (profileError) {
      await adminClient.auth.admin.deleteUser(data.user.id)
      throw new Error(`Unable to assign the local E2E account role: ${profileError.message}`)
    }
  }

  return { id: data.user.id, email, password, role }
}

export function createUserClient(): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function signInInBrowser(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login', { waitUntil: 'networkidle' })
  const consentDialog = page.getByRole('dialog', { name: 'Cookie consent' })
  if (await consentDialog.isVisible()) {
    await consentDialog.getByRole('button', { name: 'Necessary only' }).click()
  }
  await page.getByPlaceholder('Your username or email').fill(user.email)
  await page.getByPlaceholder('Your password').fill(user.password)
  await Promise.all([
    page.waitForURL(/\/dashboard(?:\/|$)/, { timeout: 15_000, waitUntil: 'domcontentloaded' }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  const readyState = user.role === 'admin'
    ? page.getByRole('heading', { name: 'Management attention', exact: true })
    : user.role === 'librarian'
      ? page.getByRole('heading', { name: 'Today at the desk', exact: true })
      : page.getByRole('searchbox', { name: 'Search the library catalog' })
  await expect(readyState).toBeVisible({ timeout: 20_000 })
}

export async function clearBrowserSession(page: Page): Promise<void> {
  if (page.isClosed()) return
  await page.goto('about:blank')
  await page.context().clearCookies()
}

export async function removeTestUser(user: TestUser): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(user.id)
  if (error) throw new Error(`Unable to remove local E2E account: ${error.message}`)
}

export async function createDigitalBook(title: string): Promise<number> {
  const { data, error } = await adminClient
    .from('books')
    .insert({
      title,
      author: 'E2E Test Author',
      category: 'E2E Test',
      source_type: 'staff_added',
      catalog_type: 'digital',
      access_mode: 'free',
      access_points: 0,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Unable to create local E2E digital book: ${error.message}`)
  return data.id
}

export async function createPhysicalBook(title: string): Promise<{ bookId: number; copyId: number }> {
  const { data: book, error: bookError } = await adminClient
    .from('books')
    .insert({
      title,
      author: 'E2E Test Author',
      category: 'E2E Test',
      source_type: 'staff_added',
      catalog_type: 'physical',
      access_mode: 'free',
      access_points: 0,
    })
    .select('id')
    .single()
  if (bookError) throw new Error(`Unable to create local E2E physical book: ${bookError.message}`)

  const { data: copy, error: copyError } = await adminClient
    .from('physical_book_copies')
    .insert({ book_id: book.id, copy_code: `E2E-${randomUUID()}` })
    .select('id')
    .single()
  if (copyError) {
    await adminClient.from('books').delete().eq('id', book.id)
    throw new Error(`Unable to create local E2E physical copy: ${copyError.message}`)
  }

  const { error: optionError } = await adminClient
    .from('physical_loan_options')
    .upsert({ book_id: book.id, duration_days: 14, fee_amount: 0, is_active: true }, { onConflict: 'book_id,duration_days' })
  if (optionError) {
    await adminClient.from('books').delete().eq('id', book.id)
    throw new Error(`Unable to create local E2E loan option: ${optionError.message}`)
  }

  return { bookId: book.id, copyId: copy.id }
}

export async function removeTestBook(bookId: number): Promise<void> {
  const { error: physicalHistoryError } = await adminClient
    .from('physical_book_loan_history')
    .delete()
    .eq('book_id', bookId)
  if (physicalHistoryError) throw new Error(`Unable to remove local E2E physical history: ${physicalHistoryError.message}`)

  const { error: historyError } = await adminClient
    .from('digital_book_loan_history')
    .delete()
    .eq('book_id', bookId)
  if (historyError) throw new Error(`Unable to remove local E2E digital history: ${historyError.message}`)

  const { error: digitalRequestsError } = await adminClient
    .from('borrow_requests')
    .delete()
    .eq('book_id', bookId)
  if (digitalRequestsError) throw new Error(`Unable to remove local E2E digital requests: ${digitalRequestsError.message}`)

  const { error: physicalRequestsError } = await adminClient
    .from('physical_book_requests')
    .delete()
    .eq('book_id', bookId)
  if (physicalRequestsError) throw new Error(`Unable to remove local E2E physical requests: ${physicalRequestsError.message}`)

  const { error: copiesError } = await adminClient
    .from('physical_book_copies')
    .delete()
    .eq('book_id', bookId)
  if (copiesError) throw new Error(`Unable to remove local E2E physical copies: ${copiesError.message}`)

  const { error: optionsError } = await adminClient
    .from('physical_loan_options')
    .delete()
    .eq('book_id', bookId)
  if (optionsError) throw new Error(`Unable to remove local E2E loan options: ${optionsError.message}`)

  const { error } = await adminClient.from('books').delete().eq('id', bookId)
  if (error) throw new Error(`Unable to remove local E2E book: ${error.message}`)
}
