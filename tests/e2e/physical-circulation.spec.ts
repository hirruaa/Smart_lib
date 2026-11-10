import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { adminClient, clearBrowserSession, createPhysicalBook, createTestUser, createUserClient, removeTestBook, removeTestUser, setTestInstitutionalId, signInInBrowser } from './support'

test('student can clearly identify the selected physical loan period', async ({ page }) => {
  const member = await createTestUser()
  const title = `E2E Loan Period ${randomUUID()}`
  let bookId: number | undefined
  try {
    const book = await createPhysicalBook(title)
    bookId = book.bookId
    const { error: optionError } = await adminClient
      .from('physical_loan_options')
      .upsert({ book_id: book.bookId, duration_days: 7, fee_amount: 10, is_active: true }, { onConflict: 'book_id,duration_days' })
    expect(optionError).toBeNull()

    await signInInBrowser(page, member)
    await page.goto('/dashboard/student', { waitUntil: 'domcontentloaded' })
    await page.getByRole('searchbox', { name: 'Search the library catalog' }).fill(title)
    await page.getByRole('button', { name: `Choose loan options for ${title}` }).click()

    const borrowDialog = page.getByRole('dialog', { name: `${title} · Physical copy` })
    await expect(page.locator('.catalog-detail-modal')).toHaveCount(0)
    const sevenDayOption = borrowDialog.getByRole('button', { name: /7 days/ })
    const fourteenDayOption = borrowDialog.getByRole('button', { name: /14 days/ })
    await expect(sevenDayOption).toHaveAttribute('aria-pressed', 'true')
    await expect(sevenDayOption.getByText('Selected')).toBeVisible()
    await expect(sevenDayOption).toHaveCSS('border-width', '2px')

    await fourteenDayOption.click()
    await expect(fourteenDayOption).toHaveAttribute('aria-pressed', 'true')
    await expect(fourteenDayOption.getByText('Selected')).toBeVisible()
    await expect(sevenDayOption).toHaveAttribute('aria-pressed', 'false')
    await expect(sevenDayOption.getByText('Selected')).toHaveCount(0)
  } finally {
    await clearBrowserSession(page)
    if (bookId !== undefined) await removeTestBook(bookId)
    await removeTestUser(member)
  }
})

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
    const { data: availableCopy, error: copyError } = await adminClient
      .from('physical_book_copies')
      .select('copy_code')
      .eq('id', book.copyId)
      .single()
    expect(copyError).toBeNull()

    await signInInBrowser(page, staff)
    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard\/admin\/physical$/)
    await expect(page.getByRole('heading', { name: 'Librarian desk' })).toBeVisible({ timeout: 15_000 })
    const deskNavigation = page.getByRole('navigation', { name: 'Librarian desk navigation' })
    await expect(deskNavigation).toBeVisible()
    await expect(deskNavigation.getByRole('button', { name: /^Requests/ })).toHaveCount(0)
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
    await expect(page.getByRole('button', { name: /^Requests/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Find a member' })).toBeVisible()
    const queueItem = page.locator('article').filter({ hasText: title }).filter({ hasText: 'Cash checkout request' })
    await expect(queueItem).toBeVisible()
    await expect(queueItem.getByText(`Member ID: ${institutionalId}`)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Today at the desk' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Shift reconciliation' })).toHaveCount(0)
    await queueItem.getByRole('button', { name: 'Process checkout' }).click()
    const checkoutReview = page.getByRole('dialog', { name: 'Review physical-book request' })
    await expect(checkoutReview).toBeVisible()
    await expect(checkoutReview.getByText(title, { exact: true })).toBeVisible()
    await expect(checkoutReview.getByText(`Member ID: ${institutionalId}`)).toBeVisible()
    const idConfirmation = checkoutReview.getByRole('checkbox', { name: /I confirm the member presented/ })
    const cashConfirmation = checkoutReview.getByRole('checkbox', { name: /I confirm I received PHP/ })
    const copyTag = checkoutReview.getByRole('textbox', { name: 'Copy accession tag' })
    const issueCheckout = checkoutReview.getByRole('button', { name: 'Record cash & issue receipt' })
    await expect(issueCheckout).toBeDisabled()
    await idConfirmation.check()
    await expect(issueCheckout).toBeDisabled()
    await copyTag.fill('NOT-A-COPY')
    await expect(issueCheckout).toBeDisabled()
    await copyTag.fill(availableCopy!.copy_code)
    if (await cashConfirmation.count()) await cashConfirmation.check()
    await expect(issueCheckout).toBeEnabled()
    await checkoutReview.getByRole('button', { name: 'Cancel' }).click()
    await deskNavigation.getByRole('button', { name: /^Checked out/ }).click()
    const checkedOutDialog = page.getByRole('dialog', { name: 'Checked-out copies' })
    await expect(checkedOutDialog).toBeVisible()
    await checkedOutDialog.getByRole('button', { name: 'Close' }).click()
    await deskNavigation.getByRole('button', { name: /^Lost items/ }).click()
    const lostCasesDialog = page.getByRole('dialog', { name: 'Lost and damage cases' })
    await expect(lostCasesDialog).toBeVisible()
    await lostCasesDialog.getByRole('button', { name: 'Close cases' }).click()
    await page.getByRole('button', { name: 'Find a member' }).click()
    const memberSearch = page.getByRole('combobox', { name: 'Search members' })
    await expect(memberSearch).toBeFocused()
    await memberSearch.press('Control+k')
    await expect(memberSearch).toBeFocused()
    await expect(page.getByRole('dialog', { name: 'Find a member' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Member profile lookup' })).toHaveCount(0)
    await expect(page.getByText('Shortcut: / or Ctrl+K')).toHaveCount(0)
    await expect(page.getByText('Issue a physical copy')).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: /I confirm the member presented/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Physical book catalog' })).toBeVisible()
    await memberSearch.fill(institutionalId)
    await page.getByRole('option').filter({ hasText: institutionalId }).click()
    const memberProfile = page.getByRole('dialog', { name: 'Member profile' })
    await expect(memberProfile.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    await expect(memberProfile.getByText(`ID · ${institutionalId}`)).toBeVisible()
    await memberProfile.getByRole('tab', { name: 'Borrowing' }).click()
    await expect(memberProfile.getByRole('heading', { name: 'Currently borrowed' })).toBeVisible()
    await expect(memberProfile.getByRole('heading', { name: 'Checkout history' })).toBeVisible()
    await memberProfile.getByRole('tab', { name: 'Charges' }).click()
    await expect(memberProfile.getByRole('heading', { name: 'Physical fines and assessments' })).toBeVisible()
    await memberProfile.getByRole('tab', { name: 'Activity' }).click()
    await expect(memberProfile.getByRole('heading', { name: 'Circulation activity' })).toBeVisible()
    await memberProfile.getByRole('button', { name: 'Back to search' }).click()
    await expect(page.getByRole('dialog', { name: 'Find a member' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Search members' })).toHaveValue(institutionalId)
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
    await queueItem.getByRole('button', { name: 'Process checkout' }).click()
    const checkoutDialog = page.getByRole('dialog', { name: 'Review physical-book request' })
    await expect(checkoutDialog).toBeVisible()
    await expect(checkoutDialog.getByText(title, { exact: true })).toBeVisible()
    await checkoutDialog.getByRole('textbox', { name: 'Copy accession tag' }).fill(availableCopy!.copy_code)
    await checkoutDialog.getByRole('checkbox', { name: /I confirm the member presented/ }).check()
    const checkoutCashConfirmation = checkoutDialog.getByRole('checkbox', { name: /I confirm I received PHP/ })
    if (await checkoutCashConfirmation.count()) await checkoutCashConfirmation.check()
    await checkoutDialog.getByRole('button', { name: 'Record cash & issue receipt' }).click()
    await expect(checkoutDialog).toBeHidden()
    await expect(page.getByText('Payment confirmed and physical checkout recorded. Digital receipt issued to the borrower.')).toBeVisible()

    const { data: persistedRequest, error: readError } = await adminClient
      .from('physical_book_requests')
      .select('status,copy_id')
      .eq('id', request.id)
      .single()
    expect(readError).toBeNull()
    expect(persistedRequest?.status).toBe('checked_out')
    expect(persistedRequest?.copy_id).toBe(book.copyId)
    const { data: persistedCopy, error: persistedCopyError } = await adminClient
      .from('physical_book_copies')
      .select('status')
      .eq('id', book.copyId)
      .single()
    expect(persistedCopyError).toBeNull()
    expect(persistedCopy?.status).toBe('borrowed')

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

test('librarian member lookup is a read-only profile, separate from checkout', async ({ page }) => {
  const member = await createTestUser()
  const staff = await createTestUser('librarian')
  const institutionalId = await setTestInstitutionalId(member)

  try {
    await signInInBrowser(page, staff)
    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Find a member' }).click()
    const memberSearch = page.getByRole('combobox', { name: 'Search members' })
    await memberSearch.fill(institutionalId)
    await memberSearch.press('Enter')
    await expect(page.getByText(institutionalId, { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Find a member' })).toBeVisible()
    await expect(page.getByText('Active physical loans')).toBeVisible()
    const topUpButton = page.getByRole('button', { name: 'Add points' })
    await expect(topUpButton).toBeVisible()
    await topUpButton.click()
    const topUpDialog = page.getByRole('dialog', { name: 'Add points' })
    await expect(topUpDialog).toBeVisible()
    await expect(topUpDialog.getByText('200 points', { exact: true })).toBeVisible()
    await topUpDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(topUpDialog).toHaveCount(0)
    await expect(page.getByText('Issue a physical copy')).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: /I confirm the member presented/ })).toHaveCount(0)
  } finally {
    await clearBrowserSession(page)
    await removeTestUser(member)
    await removeTestUser(staff)
  }
})

test('checkout exceptions, damage assessment, lost-item recovery, and fine payment follow explicit steps', async ({ page }) => {
  const member = await createTestUser()
  const staff = await createTestUser('librarian')
  const bookTitle = `E2E Queue Overdue ${randomUUID()}`
  const damageTitle = `E2E Queue Damage ${randomUUID()}`
  const lostTitle = `E2E Queue Lost ${randomUUID()}`
  const institutionalId = await setTestInstitutionalId(member)
  let overdueBookId: number | undefined
  let damageBookId: number | undefined
  let lostBookId: number | undefined
  let unauthorizedStudent: Awaited<ReturnType<typeof createTestUser>> | undefined
  let adminUser: Awaited<ReturnType<typeof createTestUser>> | undefined

  try {
    const { error: profileError } = await adminClient.from('profiles').update({ institutional_id: institutionalId }).eq('id', member.id)
    expect(profileError).toBeNull()
    const overdueBook = await createPhysicalBook(bookTitle)
    overdueBookId = overdueBook.bookId
    const damageBook = await createPhysicalBook(damageTitle)
    damageBookId = damageBook.bookId
    const lostBook = await createPhysicalBook(lostTitle)
    lostBookId = lostBook.bookId
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
    const lostRequest = await requestLoan(lostBook.bookId)
    const checkoutCopies = await Promise.all([overdueBook, damageBook, lostBook].map((book) =>
      adminClient.from('physical_book_copies').select('copy_code').eq('id', book.copyId).single(),
    ))
    expect(checkoutCopies.map(({ error }) => error)).toEqual([null, null, null])
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
    const checkoutResults = await Promise.all([overdueRequest, damageRequest, lostRequest].map((request, index) =>
      staffClient.rpc('admin_confirm_physical_checkout', {
        p_request_id: request.id,
        p_copy_code: checkoutCopies[index].data!.copy_code,
        p_amount_paid: 0,
        p_payment_notes: null,
        p_id_card_presented: true,
      }),
    ))
    expect(checkoutResults.map(({ error }) => error)).toEqual([null, null, null])

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
    const { error: lostError } = await staffClient.rpc('admin_inspect_physical_return', {
      p_request_id: lostRequest.id,
      p_copy_condition: 'lost',
      p_assessed_amount: 50,
      p_assessment_reason: 'E2E lost-item replacement assessment',
      p_id_card_presented: true,
    })
    expect(lostError).toBeNull()

    await signInInBrowser(page, staff)
    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Today at the desk' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('group', { name: 'Filter desk queue' })).toHaveCount(0)
    const overdueItem = page.locator('article').filter({ hasText: bookTitle })
    await expect(overdueItem.getByText('Overdue return')).toBeVisible()
    await overdueItem.getByRole('button', { name: 'Verify ID & return' }).click()
    const returnDialog = page.getByRole('dialog', { name: 'Verify ID & inspect return' })
    await expect(returnDialog).toBeVisible()
    await expect(returnDialog.getByText(institutionalId)).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Search members' })).toHaveCount(0)
    const goodReturn = returnDialog.getByRole('button', { name: /Good condition/ })
    await expect(goodReturn).toHaveAttribute('aria-pressed', 'true')
    await expect(returnDialog.getByRole('button', { name: /Damaged/ })).toBeVisible()
    await expect(returnDialog.getByRole('button', { name: /Not returned · lost/ })).toBeVisible()
    await returnDialog.getByRole('checkbox', { name: /I confirm the member presented/ }).check()
    await returnDialog.getByRole('button', { name: 'Continue to return' }).click()
    await page.getByRole('dialog', { name: 'Record physical-book return?' }).getByRole('button', { name: 'Record return' }).click()
    const successDialog = page.getByRole('dialog', { name: 'Action completed' })
    await expect(successDialog.getByText('Return inspection recorded', { exact: false })).toBeVisible()
    await successDialog.getByRole('button', { name: 'Done' }).click()

    const damageItem = page.locator('article').filter({ hasText: damageTitle })
    await expect(damageItem.getByText('Damaged item case')).toBeVisible()
    await damageItem.getByRole('button', { name: 'Review case' }).click()
    const damageDialog = page.getByRole('dialog', { name: 'Review damage case' })
    await expect(damageDialog).toBeVisible()
    await expect(damageDialog.getByText('inspect → assess → disposition')).toBeVisible()
    const damageAmount = damageDialog.getByRole('spinbutton', { name: 'Assessed damage charge (PHP)' })
    const damageReason = damageDialog.getByRole('textbox', { name: 'Assessment decision and reason' })
    await damageAmount.fill('15')
    await damageReason.fill('E2E assessed damage charge')
    await damageDialog.getByRole('button', { name: 'Save assessment' }).click()
    await expect(damageDialog.getByText('Assessed: PHP 15.00')).toBeVisible()
    await damageDialog.getByLabel('Copy disposition').selectOption('available')
    await damageDialog.getByLabel('Repair / disposition note').fill('E2E repair completed')
    await damageDialog.getByRole('button', { name: 'Save disposition' }).click()
    await expect(page.getByText('Copy marked repaired and returned to circulation.')).toBeVisible()
    const casesDialog = page.getByRole('dialog', { name: 'Lost and damage cases' })
    await expect(casesDialog).toBeVisible()
    const lostCase = casesDialog.locator('tr').filter({ hasText: lostTitle })
    await expect(lostCase).toBeVisible()
    await lostCase.getByRole('button', { name: 'Resolve case' }).click()
    const lostDialog = page.getByRole('dialog', { name: 'Resolve lost-item case' })
    await expect(lostDialog).toBeVisible()
    const confirmRecovery = lostDialog.getByRole('button', { name: 'Confirm recovery' })
    await expect(confirmRecovery).toBeDisabled()
    await expect(lostDialog.getByRole('button', { name: /Recovered · good condition/ })).toHaveAttribute('aria-pressed', 'false')
    await lostDialog.getByRole('button', { name: /Recovered · good condition/ }).click()
    await expect(confirmRecovery).toBeEnabled()
    await confirmRecovery.click()
    await expect(page.getByText(/Lost-book hold resolved/)).toBeVisible()
    const { data: recoveredLoan, error: recoveredLoanError } = await adminClient
      .from('physical_book_requests')
      .select('status,incident_status')
      .eq('id', lostRequest.id)
      .single()
    expect(recoveredLoanError).toBeNull()
    expect(recoveredLoan).toMatchObject({ status: 'returned', incident_status: 'resolved' })
    const { data: recoveredFine, error: recoveredFineError } = await adminClient
      .from('fines')
      .select('status')
      .eq('physical_book_request_id', lostRequest.id)
      .eq('fine_type', 'lost_item')
      .single()
    expect(recoveredFineError).toBeNull()
    expect(recoveredFine?.status).toBe('waived')
    await casesDialog.getByRole('button', { name: 'Close cases' }).click()

    adminUser = await createTestUser('admin')
    await clearBrowserSession(page)
    await signInInBrowser(page, adminUser)
    await page.goto('/dashboard/admin/physical/finance', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
    const financeSearch = page.getByRole('searchbox', { name: 'Search transactions' })
    await financeSearch.fill(damageTitle)
    const damageTransaction = page.getByRole('row').filter({ hasText: damageTitle })
    await expect(damageTransaction).toBeVisible()
    await damageTransaction.getByRole('button', { name: 'Record payment' }).click()
    const paymentDialog = page.getByRole('dialog', { name: 'Record cashier payment?' })
    const confirmPayment = paymentDialog.getByRole('button', { name: 'Confirm payment received' })
    await expect(confirmPayment).toBeDisabled()
    await paymentDialog.getByRole('checkbox', { name: /I confirm PHP 15.00 cash was received/ }).check()
    await expect(confirmPayment).toBeEnabled()
    await confirmPayment.click()
    await expect(page.getByText('Physical-book fine payment recorded.')).toBeVisible()
    const { data: paidDamageFine, error: paidDamageFineError } = await adminClient
      .from('fines')
      .select('status,receipt_number')
      .eq('physical_book_request_id', damageRequest.id)
      .eq('fine_type', 'damage')
      .single()
    expect(paidDamageFineError).toBeNull()
    expect(paidDamageFine?.status).toBe('paid')
    expect(paidDamageFine?.receipt_number).toBeTruthy()
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
    if (lostBookId !== undefined) await removeTestBook(lostBookId)
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

    const { data: availableCopy, error: copyError } = await adminClient
      .from('physical_book_copies')
      .select('copy_code')
      .eq('id', book.copyId)
      .single()
    expect(copyError).toBeNull()
    const wrongCopyResult = await staffClients[0].rpc('admin_confirm_physical_checkout', {
      p_request_id: request.id,
      p_copy_code: 'NOT-A-COPY',
      p_amount_paid: 0,
      p_payment_notes: null,
      p_id_card_presented: true,
    })
    expect(wrongCopyResult.error?.message).toContain('No physical copy matches')

    const results = await Promise.all(staffClients.map((client) => client.rpc('admin_confirm_physical_checkout', {
      p_request_id: request.id,
      p_copy_code: availableCopy!.copy_code,
      p_amount_paid: 0,
      p_payment_notes: null,
      p_id_card_presented: true,
    })))
    expect(results.filter(({ data, error }) => data?.status === 'checked_out' && !error)).toHaveLength(1)
    expect(results.filter(({ error }) => error?.message.includes('This request is not ready for checkout'))).toHaveLength(1)

    const [history, copy, audit] = await Promise.all([
      adminClient.from('physical_book_loan_history').select('copy_id', { count: 'exact' }).eq('request_id', request.id),
      adminClient.from('physical_book_copies').select('status').eq('book_id', book.bookId).single(),
      adminClient.from('audit_logs').select('id', { count: 'exact', head: true }).eq('action', 'physical_id_verified_at_checkout').eq('target_id', String(request.id)),
    ])
    expect(history.error).toBeNull()
    expect(history.count).toBe(1)
    expect(history.data?.[0]?.copy_id).toBe(book.copyId)
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
