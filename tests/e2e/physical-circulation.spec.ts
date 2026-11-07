import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { adminClient, clearBrowserSession, createPhysicalBook, createTestUser, createUserClient, removeTestBook, removeTestUser, setTestInstitutionalId, signInInBrowser } from './support'

test('staff sees a member physical request in circulation and the separate finance ledger', async ({ page }) => {
  const member = await createTestUser()
  const staff = await createTestUser('librarian')
  const title = `E2E Physical ${randomUUID()}`
  const institutionalId = await setTestInstitutionalId(member)
  let bookId: number | undefined

  try {
    const book = await createPhysicalBook(title)
    bookId = book.bookId
    const memberClient = createUserClient()
    const { error: signInError } = await memberClient.auth.signInWithPassword({
      email: member.email,
      password: member.password,
    })
    expect(signInError).toBeNull()

    const { data: request, error: requestError } = await memberClient.rpc('request_physical_book', {
      p_book_id: book.bookId,
      p_copy_id: null,
      p_duration_days: 14,
      p_payment_method: 'cash',
      p_transaction_reference: null,
      p_payment_proof_path: null,
    })
    expect(requestError).toBeNull()
    expect(request?.status).toBe('pending')

    await signInInBrowser(page, staff)
    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard\/admin\/physical$/)
    await expect(page.getByRole('heading', { name: 'Librarian desk' })).toBeVisible({ timeout: 15_000 })
    const deskNavigation = page.getByRole('navigation', { name: 'Librarian desk navigation' })
    await expect(deskNavigation).toBeVisible()
    await expect(deskNavigation.getByRole('button', { name: /^Requests/ })).toHaveCount(1)
    await expect(deskNavigation.getByRole('button', { name: 'Checked out' })).toHaveCount(1)
    await expect(deskNavigation.getByRole('button', { name: /^Lost items/ })).toHaveCount(1)
    await expect(deskNavigation.getByRole('button', { name: 'Daily records' })).toHaveCount(1)
    await expect(deskNavigation.getByRole('button', { name: 'Inventory' })).toHaveCount(1)
    await expect(deskNavigation.getByRole('button', { name: 'Transactions' })).toHaveCount(0)
    await expect(deskNavigation.getByRole('button', { name: 'Profile' })).toHaveCount(1)
    await expect(deskNavigation.getByRole('button', { name: 'Sign out' })).toHaveCount(1)
    await expect(deskNavigation.locator('a')).toHaveCount(0)
    await expect(deskNavigation.getByRole('button', { name: /catalog|policy|manage/i })).toHaveCount(0)
    await expect(page.getByRole('toolbar', { name: 'Physical circulation actions' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Review requests' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Requests/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Find member / start checkout' })).toBeVisible()
    const queueItem = page.locator('article').filter({ hasText: title }).filter({ hasText: 'Cash checkout request' })
    await expect(queueItem).toBeVisible()
    await expect(queueItem.getByText(`Student ID: ${institutionalId}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Today at the desk' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Shift reconciliation' })).toHaveCount(0)
    await queueItem.getByRole('button', { name: 'Process checkout' }).click()
    const queueRequestDialog = page.getByRole('dialog', { name: 'Physical book requests' })
    await expect(queueRequestDialog).toBeVisible()
    await expect(queueRequestDialog.getByText(title, { exact: true })).toBeVisible()
    await queueRequestDialog.getByRole('button', { name: 'Close requests' }).click()
    await deskNavigation.getByRole('button', { name: /^Checked out/ }).click()
    const checkedOutDialog = page.getByRole('dialog', { name: 'Checked-out copies' })
    await expect(checkedOutDialog).toBeVisible()
    await checkedOutDialog.getByRole('button', { name: 'Close' }).click()
    await deskNavigation.getByRole('button', { name: /^Lost items/ }).click()
    const lostCasesDialog = page.getByRole('dialog', { name: 'Lost and damage cases' })
    await expect(lostCasesDialog).toBeVisible()
    await lostCasesDialog.getByRole('button', { name: 'Close cases' }).click()
    await page.getByRole('button', { name: 'Find member / start checkout' }).click()
    const memberSearch = page.getByRole('combobox', { name: 'Student / member ID or name' })
    await expect(memberSearch).toBeFocused()
    await memberSearch.press('Control+k')
    await expect(memberSearch).toBeFocused()
    await expect(page.getByRole('heading', { name: 'Physical book catalog' })).toBeVisible()
    await page.getByRole('button', { name: 'Close Find a member' }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(deskNavigation).toBeVisible()
    await expect(deskNavigation.getByRole('button', { name: 'Sign out' })).toBeVisible()
    await expect(deskNavigation.getByRole('button', { name: 'Daily records' })).toBeVisible()
    const mobileCatalogCard = page.locator('.physical-catalog-mobile-card').filter({ hasText: title })
    await expect(mobileCatalogCard).toBeVisible()
    await expect(mobileCatalogCard.getByRole('button', { name: 'View copies' })).toBeVisible()
    await expect(mobileCatalogCard.getByRole('button', { name: 'Manage title' })).toHaveCount(0)
    await mobileCatalogCard.getByRole('button', { name: 'View copies' }).click()
    await expect(mobileCatalogCard.locator('.physical-catalog-mobile-copies')).toContainText('available')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: /^Requests/ }).click()
    const requestsDialog = page.getByRole('dialog', { name: 'Physical book requests' })
    await expect(requestsDialog).toBeVisible()
    await expect(requestsDialog.getByText(title, { exact: true })).toBeVisible()

    const { data: persistedRequest, error: readError } = await adminClient
      .from('physical_book_requests')
      .select('status')
      .eq('id', request.id)
      .single()
    expect(readError).toBeNull()
    expect(persistedRequest?.status).toBe('pending')

    await requestsDialog.getByRole('button', { name: 'Close requests' }).click()
    await deskNavigation.getByRole('button', { name: 'Daily records' }).click()
    await expect(page).toHaveURL(/\/dashboard\/admin\/physical\/finance$/)
    await expect(page.getByRole('heading', { name: 'Sales & borrowing history' })).toBeVisible()
    await expect(page.getByLabel('Daily record date')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Books borrowed on this date' })).toBeVisible()
    await expect(page.getByText('Cash · checkout fees')).toBeVisible()
    await expect(page.getByText('Other receipts', { exact: true })).toBeVisible()
    await expect(page.getByText('Fines, renewals, and print fees · channel not recorded.')).toBeVisible()
    await expect(page.getByText('Refunds recorded')).toBeVisible()
    await page.getByRole('button', { name: 'Desk' }).click()
    await expect(page).toHaveURL(/\/dashboard\/admin\/physical$/)
    await deskNavigation.getByRole('button', { name: 'Profile' }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await expect(page.getByRole('heading', { name: 'Your Profile' })).toBeVisible()
    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Librarian desk' })).toBeVisible()
    await deskNavigation.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
  } finally {
    await clearBrowserSession(page)
    if (bookId !== undefined) await removeTestBook(bookId)
    await removeTestUser(member)
    await removeTestUser(staff)
  }
})

test('physical-book requests accept cash only and reject online payment data', async () => {
  const member = await createTestUser()
  const title = `E2E Queue Payment ${randomUUID()}`
  let bookId: number | undefined

  try {
    const book = await createPhysicalBook(title)
    bookId = book.bookId

    const memberClient = createUserClient()
    const { error: signInError } = await memberClient.auth.signInWithPassword({ email: member.email, password: member.password })
    expect(signInError).toBeNull()
    const { error: onlineError } = await memberClient.rpc('request_physical_book', {
      p_book_id: book.bookId,
      p_copy_id: null,
      p_duration_days: 14,
      p_payment_method: 'gcash',
      p_transaction_reference: null,
      p_payment_proof_path: null,
    })
    expect(onlineError?.message).toContain('cash at the library desk only')

    const { error: referenceError } = await memberClient.rpc('request_physical_book', {
      p_book_id: book.bookId,
      p_copy_id: null,
      p_duration_days: 14,
      p_payment_method: 'cash',
      p_transaction_reference: `E2E-${randomUUID()}`,
      p_payment_proof_path: null,
    })
    expect(referenceError?.message).toContain('cash at the library desk only')

    const { data: request, error: cashError } = await memberClient.rpc('request_physical_book', {
      p_book_id: book.bookId,
      p_copy_id: null,
      p_duration_days: 14,
      p_payment_method: 'cash',
      p_transaction_reference: null,
      p_payment_proof_path: null,
    })
    expect(cashError).toBeNull()
    expect(request?.payment_method).toBe('cash')
    expect(request?.payment_status).toBe('unpaid')
  } finally {
    if (bookId !== undefined) await removeTestBook(bookId)
    await removeTestUser(member)
  }
})

test('librarian can issue manually selected accession tags from a member profile and batch return copies', async ({ page }) => {
  const member = await createTestUser()
  const staff = await createTestUser('librarian')
  const firstTitle = `E2E Desk Issue ${randomUUID()}`
  const secondTitle = `E2E Desk Issue ${randomUUID()}`
  const institutionalId = await setTestInstitutionalId(member)
  let firstBookId: number | undefined
  let secondBookId: number | undefined

  try {
    const firstBook = await createPhysicalBook(firstTitle)
    const secondBook = await createPhysicalBook(secondTitle)
    firstBookId = firstBook.bookId
    secondBookId = secondBook.bookId
    const { data: copyRows, error: copyError } = await adminClient
      .from('physical_book_copies')
      .select('copy_code')
      .in('id', [firstBook.copyId, secondBook.copyId])
      .order('copy_code')
    expect(copyError).toBeNull()
    expect(copyRows).toHaveLength(2)
    const copyCodes = copyRows?.map((copy) => copy.copy_code) ?? []

    await signInInBrowser(page, staff)
    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Find member / start checkout' }).click()
    const memberSearch = page.getByRole('combobox', { name: 'Student / member ID or name' })
    await memberSearch.fill(institutionalId)
    await memberSearch.press('Enter')
    await expect(page.getByText(institutionalId, { exact: true })).toBeVisible()
    await page.getByRole('checkbox', { name: /I confirm the member presented/ }).check()

    for (const copyCode of copyCodes) {
      await page.getByLabel('Physical copy accession tag').fill(copyCode)
      await page.getByRole('option', { name: new RegExp(copyCode) }).click()
      await expect(page.getByRole('button', { name: 'Issue loan' })).toBeEnabled()
      await page.getByRole('button', { name: 'Issue loan' }).click()
      await expect(page.getByText(new RegExp(`${copyCode} issued to`))).toBeVisible()
    }

    const memberProfile = page.getByRole('region', { name: 'Find a student or faculty member' })
    await expect(memberProfile.getByText('2 / 3', { exact: true })).toBeVisible()
    for (const copyCode of copyCodes) {
      await page.getByRole('checkbox', { name: `Select ${copyCode} for return` }).check()
    }
    await page.getByRole('button', { name: 'Mark 2 selected returned' }).click()
    await expect(page.getByText('2 physical copies returned and marked available.')).toBeVisible()

    const { data: requests, error: requestError } = await adminClient
      .from('physical_book_requests')
      .select('status,copy_id')
      .eq('student_id', member.id)
      .in('copy_id', [firstBook.copyId, secondBook.copyId])
    expect(requestError).toBeNull()
    expect(requests).toHaveLength(2)
    expect(requests?.every((request) => request.status === 'returned')).toBe(true)
    const { data: copies, error: copyStatusError } = await adminClient
      .from('physical_book_copies')
      .select('status')
      .in('id', [firstBook.copyId, secondBook.copyId])
    expect(copyStatusError).toBeNull()
    expect(copies?.every((copy) => copy.status === 'available')).toBe(true)
  } finally {
    await clearBrowserSession(page)
    if (firstBookId !== undefined) await removeTestBook(firstBookId)
    if (secondBookId !== undefined) await removeTestBook(secondBookId)
    await removeTestUser(member)
    await removeTestUser(staff)
  }
})

test('overdue return and damage case are actionable from the priority queue for librarians only', async ({ page }) => {
  const member = await createTestUser()
  const staff = await createTestUser('librarian')
  const bookTitle = `E2E Queue Overdue ${randomUUID()}`
  const damageTitle = `E2E Queue Damage ${randomUUID()}`
  const institutionalId = await setTestInstitutionalId(member)
  let overdueBookId: number | undefined
  let damageBookId: number | undefined
  let unauthorizedStudent: Awaited<ReturnType<typeof createTestUser>> | undefined
  let adminUser: Awaited<ReturnType<typeof createTestUser>> | undefined

  try {
    const { error: profileError } = await adminClient.from('profiles').update({ institutional_id: institutionalId }).eq('id', member.id)
    expect(profileError).toBeNull()
    const overdueBook = await createPhysicalBook(bookTitle)
    overdueBookId = overdueBook.bookId
    const damageBook = await createPhysicalBook(damageTitle)
    damageBookId = damageBook.bookId
    const memberClient = createUserClient()
    const { error: memberSignInError } = await memberClient.auth.signInWithPassword({ email: member.email, password: member.password })
    expect(memberSignInError).toBeNull()

    const requestLoan = async (bookId: number) => {
      const { data, error } = await memberClient.rpc('request_physical_book', {
        p_book_id: bookId,
        p_copy_id: null,
        p_duration_days: 14,
        p_payment_method: 'cash',
        p_transaction_reference: null,
        p_payment_proof_path: null,
      })
      expect(error).toBeNull()
      return data
    }
    const overdueRequest = await requestLoan(overdueBook.bookId)
    const damageRequest = await requestLoan(damageBook.bookId)
    const staffClient = createUserClient()
    const { error: staffSignInError } = await staffClient.auth.signInWithPassword({ email: staff.email, password: staff.password })
    expect(staffSignInError).toBeNull()
    const { data: visibleMember, error: memberProfileError } = await staffClient.from('profiles')
      .select('id,institutional_id')
      .eq('id', member.id)
      .maybeSingle()
    expect(memberProfileError).toBeNull()
    expect(visibleMember?.institutional_id).toBe(institutionalId)
    const { data: adminProfiles, error: adminProfileError } = await staffClient.from('profiles')
      .select('id')
      .eq('role', 'admin')
    expect(adminProfileError).toBeNull()
    expect(adminProfiles).toEqual([])
    const checkoutResults = await Promise.all([overdueRequest, damageRequest].map((request) =>
      staffClient.rpc('admin_confirm_physical_checkout', {
        p_request_id: request.id,
        p_amount_paid: 0,
        p_payment_notes: null,
        p_id_card_presented: true,
      }),
    ))
    expect(checkoutResults.map(({ error }) => error)).toEqual([null, null])

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const { error: dueDateError } = await adminClient.from('physical_book_requests')
      .update({ due_date: yesterday.toISOString() })
      .eq('id', overdueRequest.id)
    expect(dueDateError).toBeNull()
    const { error: damageError } = await staffClient.rpc('admin_inspect_physical_return', {
      p_request_id: damageRequest.id,
      p_copy_condition: 'damaged',
      p_assessed_amount: 0,
      p_assessment_reason: 'E2E damage inspection',
      p_id_card_presented: true,
    })
    expect(damageError).toBeNull()

    await signInInBrowser(page, staff)
    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Today at the desk' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Due today or overdue' }).click()
    const overdueItem = page.locator('article').filter({ hasText: bookTitle })
    await expect(overdueItem.getByText('Overdue return')).toBeVisible()
    await overdueItem.getByRole('button', { name: 'Verify ID & return' }).click()
    const memberSearch = page.getByRole('combobox', { name: 'Student / member ID or name' })
    await expect(memberSearch).toHaveValue(institutionalId)
    await memberSearch.press('Enter')
    await page.getByRole('checkbox', { name: /I confirm the member presented/ }).check()
    await page.getByRole('button', { name: 'Continue to return' }).click()
    const checkedOutDialog = page.getByRole('dialog', { name: 'Checked-out copies' })
    await expect(checkedOutDialog).toBeVisible()
    const overdueLoan = checkedOutDialog.locator('article').filter({ hasText: bookTitle })
    await expect(overdueLoan).toBeVisible()
    await overdueLoan.getByRole('button', { name: 'Record good return' }).click()
    await page.getByRole('dialog', { name: 'Record physical-book return?' }).getByRole('button', { name: 'Record return' }).click()
    await expect(page.getByText('Return inspection recorded', { exact: false })).toBeVisible()
    await checkedOutDialog.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Close Find a member' }).click()
    await page.getByRole('button', { name: 'Dismiss success message' }).click()

    await page.getByRole('button', { name: 'All urgent' }).click()
    const damageItem = page.locator('article').filter({ hasText: damageTitle })
    await expect(damageItem.getByText('Damaged item case')).toBeVisible()
    await damageItem.getByRole('button', { name: 'Review case' }).click()
    const damageDialog = page.getByRole('dialog', { name: 'Review damage case' })
    await expect(damageDialog).toBeVisible()
    await damageDialog.getByRole('button', { name: 'Close' }).click()
    const casesDialog = page.getByRole('dialog', { name: 'Lost and damage cases' })
    await expect(casesDialog).toBeVisible()
    await casesDialog.getByRole('button', { name: 'Close cases' }).click()

    adminUser = await createTestUser('admin')
    await clearBrowserSession(page)
    await signInInBrowser(page, adminUser)
    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard\/admin$/)
    await expect(page.getByRole('heading', { name: 'Today at the desk' })).toHaveCount(0)

    await clearBrowserSession(page)
    unauthorizedStudent = await createTestUser()
    await signInInBrowser(page, unauthorizedStudent)
    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/\/dashboard\/admin\/physical$/)
    await expect(page.getByRole('heading', { name: 'Today at the desk' })).toHaveCount(0)
  } finally {
    await clearBrowserSession(page)
    if (overdueBookId !== undefined) await removeTestBook(overdueBookId)
    if (damageBookId !== undefined) await removeTestBook(damageBookId)
    if (adminUser) await removeTestUser(adminUser)
    if (unauthorizedStudent) await removeTestUser(unauthorizedStudent)
    await removeTestUser(member)
    await removeTestUser(staff)
  }
})

test('parallel physical-book requests for one member create exactly one open request', async () => {
  const member = await createTestUser()
  const title = `E2E Duplicate Physical ${randomUUID()}`
  let bookId: number | undefined

  try {
    const book = await createPhysicalBook(title)
    bookId = book.bookId
    const firstClient = createUserClient()
    const secondClient = createUserClient()
    const signIns = await Promise.all([
      firstClient.auth.signInWithPassword({ email: member.email, password: member.password }),
      secondClient.auth.signInWithPassword({ email: member.email, password: member.password }),
    ])
    expect(signIns.map(({ error }) => error)).toEqual([null, null])

    const makeRequest = (client: ReturnType<typeof createUserClient>) => client.rpc('request_physical_book', {
      p_book_id: book.bookId,
      p_copy_id: null,
      p_duration_days: 14,
      p_payment_method: 'cash',
      p_transaction_reference: null,
      p_payment_proof_path: null,
    })
    const results = await Promise.all([makeRequest(firstClient), makeRequest(secondClient)])
    expect(results.filter(({ data, error }) => data?.status === 'pending' && !error)).toHaveLength(1)
    expect(results.filter(({ error }) => error?.message.includes('You already have an open request or loan for this book'))).toHaveLength(1)

    const { count, error: countError } = await adminClient
      .from('physical_book_requests')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', member.id)
      .eq('book_id', book.bookId)
      .eq('status', 'pending')
    expect(countError).toBeNull()
    expect(count).toBe(1)
  } finally {
    if (bookId !== undefined) await removeTestBook(bookId)
    await removeTestUser(member)
  }
})

test('parallel staff checkout attempts create one loan and one receipt', async () => {
  const member = await createTestUser()
  const firstStaff = await createTestUser('librarian')
  const secondStaff = await createTestUser('librarian')
  const title = `E2E Checkout Race ${randomUUID()}`
  let bookId: number | undefined

  try {
    const book = await createPhysicalBook(title)
    bookId = book.bookId
    const memberClient = createUserClient()
    const { error: memberSignInError } = await memberClient.auth.signInWithPassword({
      email: member.email,
      password: member.password,
    })
    expect(memberSignInError).toBeNull()
    const { data: request, error: requestError } = await memberClient.rpc('request_physical_book', {
      p_book_id: book.bookId,
      p_copy_id: null,
      p_duration_days: 14,
      p_payment_method: 'cash',
      p_transaction_reference: null,
      p_payment_proof_path: null,
    })
    expect(requestError).toBeNull()
    expect(request?.status).toBe('pending')

    const staffClients = [createUserClient(), createUserClient()]
    const staffAccounts = [firstStaff, secondStaff]
    const staffSignIns = await Promise.all(staffClients.map((client, index) =>
      client.auth.signInWithPassword({
        email: staffAccounts[index].email,
        password: staffAccounts[index].password,
      }),
    ))
    expect(staffSignIns.map(({ error }) => error)).toEqual([null, null])

    const results = await Promise.all(staffClients.map((client) => client.rpc('admin_confirm_physical_checkout', {
      p_request_id: request.id,
      p_amount_paid: 0,
      p_payment_notes: null,
      p_id_card_presented: true,
    })))
    expect(results.filter(({ data, error }) => data?.status === 'checked_out' && !error)).toHaveLength(1)
    expect(results.filter(({ error }) => error?.message.includes('This request is not ready for checkout'))).toHaveLength(1)

    const [history, copy, audit] = await Promise.all([
      adminClient.from('physical_book_loan_history').select('id', { count: 'exact', head: true }).eq('request_id', request.id),
      adminClient.from('physical_book_copies').select('status').eq('book_id', book.bookId).single(),
      adminClient.from('audit_logs').select('id', { count: 'exact', head: true }).eq('action', 'physical_id_verified_at_checkout').eq('target_id', String(request.id)),
    ])
    expect(history.error).toBeNull()
    expect(history.count).toBe(1)
    expect(copy.error).toBeNull()
    expect(copy.data?.status).toBe('borrowed')
    expect(audit.error).toBeNull()
    expect(audit.count).toBe(1)
  } finally {
    if (bookId !== undefined) await removeTestBook(bookId)
    await removeTestUser(member)
    await removeTestUser(firstStaff)
    await removeTestUser(secondStaff)
  }
})
