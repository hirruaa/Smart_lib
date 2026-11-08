import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { adminClient, clearBrowserSession, createDigitalBook, createPhysicalBook, createTestUser, createUserClient, removeTestBook, removeTestUser, signInInBrowser } from './support'

test('admin dashboard keeps circulation processing in the librarian workspace', async ({ page }) => {
  const admin = await createTestUser('admin')
  try {
    const userClient = createUserClient()
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: admin.email,
      password: admin.password,
    })
    expect(signInError).toBeNull()
    const { error: issueError } = await userClient.rpc('admin_issue_physical_copy', {
      p_student_id: '00000000-0000-4000-8000-000000000001',
      p_copy_code: 'E2E-NOT-A-REAL-COPY',
      p_duration_days: 14,
      p_amount_paid: 0,
      p_payment_notes: null,
      p_id_card_presented: true,
    })
    expect(issueError?.message).toContain('Librarian access required')
    const { error: checkoutError } = await userClient.rpc('admin_confirm_physical_checkout', {
      p_request_id: -1,
      p_copy_code: 'E2E-NOT-A-REAL-COPY',
      p_amount_paid: 0,
      p_payment_notes: null,
      p_id_card_presented: true,
    })
    expect(checkoutError?.message).toContain('Librarian access required')

    await signInInBrowser(page, admin)

    await expect(page.getByRole('heading', { name: /^Welcome back,/ })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Quick actions' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Invite a member/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Record point top-up/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Add a physical book/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Management attention' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your library at a glance' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Library activity' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Analytics' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Transactions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Circulation management' })).toHaveCount(0)
    await expect(page.getByText('Physical checkout and return processing stays with the librarian desk.')).toBeVisible()

    await page.goto('/dashboard/admin/physical', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/dashboard\/admin$/, { timeout: 15_000 })
  } finally {
    await clearBrowserSession(page)
    await removeTestUser(admin)
  }
})

test('admin navigation sections and primary management dialogs render and close', async ({ page }) => {
  const admin = await createTestUser('admin')
  try {
    await signInInBrowser(page, admin)

    await page.getByRole('button', { name: 'Transactions' }).click()
    await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Print payments & receipts' }).click()
    const printDialog = page.getByRole('dialog', { name: 'Print payments and receipts' })
    await expect(printDialog).toBeVisible()
    await printDialog.getByRole('button', { name: 'Close' }).click()
    await expect(printDialog).toHaveCount(0)

    await page.getByRole('button', { name: 'Member accounts' }).click()
    await expect(page.getByRole('heading', { name: 'Member management' })).toBeVisible()
    await page.getByRole('button', { name: 'Invite member' }).click()
    const inviteDialog = page.getByRole('dialog', { name: 'Invite member' })
    await expect(inviteDialog).toBeVisible()
    await expect(inviteDialog.getByRole('textbox', { name: 'Full name' })).toBeVisible()
    await expect(inviteDialog.getByRole('textbox', { name: 'Username' })).toBeVisible()
    await expect(inviteDialog.getByRole('textbox', { name: 'Email address' })).toBeVisible()
    await expect(inviteDialog.getByRole('combobox', { name: 'Account type' })).toBeVisible()
    await expect(inviteDialog.getByRole('textbox', { name: 'Institutional ID' })).toBeVisible()
    await expect(inviteDialog.getByRole('combobox', { name: 'Course' })).toBeVisible()
    await expect(inviteDialog.getByRole('combobox', { name: 'Year level' })).toBeVisible()
    await inviteDialog.getByRole('button', { name: 'Close' }).click()
    await expect(inviteDialog).toHaveCount(0)

    await page.getByRole('button', { name: 'Digital history' }).click()
    await expect(page.getByRole('heading', { name: 'Digital history', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Faculty lessons' }).click()
    await expect(page.getByRole('heading', { name: 'Faculty lesson review' })).toBeVisible()
    await page.getByRole('button', { name: 'Catalog management' }).click()
    await expect(page.getByRole('heading', { name: 'Digital catalog' })).toBeVisible()
    await page.getByRole('button', { name: '+ Add digital title' }).click()
    const digitalBookDialog = page.getByRole('dialog', { name: 'Add digital title' })
    await expect(digitalBookDialog).toBeVisible()
    await expect(digitalBookDialog.getByRole('textbox', { name: 'Subject' })).toBeVisible()
    await expect(digitalBookDialog.getByRole('textbox', { name: 'Genre' })).toHaveCount(0)
    await digitalBookDialog.getByRole('button', { name: 'Close' }).click()
    await expect(digitalBookDialog).toHaveCount(0)

    await page.getByRole('button', { name: 'Physical catalog', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Physical book catalog' })).toBeVisible()
    await page.getByRole('button', { name: 'Add physical book' }).click()
    const physicalBookDialog = page.getByRole('dialog', { name: 'Add a physical book to the catalog' })
    await expect(physicalBookDialog).toBeVisible()
    await expect(physicalBookDialog.getByRole('textbox', { name: 'Subject' })).toBeVisible()
    await expect(physicalBookDialog.getByRole('textbox', { name: 'Genre' })).toHaveCount(0)
    await physicalBookDialog.getByRole('button', { name: 'Close' }).click()
    await expect(physicalBookDialog).toHaveCount(0)

    await page.getByRole('button', { name: 'Borrowing policy' }).click()
    await expect(page.getByRole('heading', { name: 'Borrowing policy & fine calendar', exact: true })).toBeVisible()
    const policySummary = page.getByText(/Each physical title can offer .* Overdue charges start after a/)
    if (await policySummary.count()) {
      await expect(policySummary).toBeVisible()
    } else {
      await expect(page.getByText(/Enforceable policy settings are unavailable/)).toBeVisible()
    }
    await page.getByRole('button', { name: 'Edit policy & holidays' }).click()
    const policyDialog = page.getByRole('dialog', { name: 'Borrowing policy & fine calendar' })
    await expect(policyDialog.getByRole('spinbutton', { name: 'Fine grace (days)' })).toBeVisible()
    await expect(policyDialog.getByRole('spinbutton', { name: 'Late fee per day (PHP)' })).toBeVisible()
    await expect(policyDialog.getByRole('spinbutton', { name: 'Fine cap per item (PHP)' })).toBeVisible()
    await expect(policyDialog.getByRole('spinbutton', { name: 'Classify lost after (days)' })).toBeVisible()
    await expect(policyDialog.getByRole('spinbutton', { name: 'Default lesson reward (points)' })).toBeVisible()
    await expect(policyDialog.getByRole('textbox', { name: /Student-facing policy and points notice/ })).toBeVisible()
    await policyDialog.getByRole('button', { name: 'Close' }).click()
    await page.getByRole('button', { name: 'Audit log' }).click()
    await expect(page.getByRole('heading', { name: 'Audit log', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Overview' }).click()
    await expect(page.getByRole('heading', { name: 'Management attention' })).toBeVisible()
  } finally {
    await clearBrowserSession(page)
    await removeTestUser(admin)
  }
})

test('admin sees saved digital access mode and point costs without closing book details', async ({ page }) => {
  const admin = await createTestUser('admin')
  const title = `E2E Access Mode ${randomUUID()}`
  let bookId: number | undefined
  try {
    const digitalBookId = await createDigitalBook(title)
    bookId = digitalBookId
    await signInInBrowser(page, admin)
    await page.getByRole('button', { name: 'Catalog management' }).click()

    const bookRow = page.getByRole('row').filter({ hasText: title })
    await expect(bookRow).toBeVisible()
    await bookRow.getByRole('button', { name: 'Manage book' }).click()

    const details = page.getByRole('dialog', { name: title })
    await details.getByRole('tab', { name: 'Permissions' }).click()
    await details.getByRole('button', { name: 'Edit access' }).click()
    await details.getByRole('combobox', { name: 'Mode' }).selectOption('points')
    const costs = details.getByRole('spinbutton')
    await expect(costs).toHaveCount(5)
    for (let index = 0; index < await costs.count(); index += 1) {
      await costs.nth(index).fill('3')
    }
    await details.getByRole('button', { name: 'Save permissions' }).click()

    await expect(details.getByText('Access mode: points')).toBeVisible()
    const { data: savedBook, error } = await adminClient
      .from('books')
      .select('access_mode,access_points,access_costs')
      .eq('id', digitalBookId)
      .single()
    expect(error).toBeNull()
    expect(savedBook).toMatchObject({ access_mode: 'points', access_points: 3 })
    expect(savedBook?.access_costs).toMatchObject({ '1': 3, '3': 3, '7': 3, '14': 3, '30': 3 })
  } finally {
    await clearBrowserSession(page)
    if (bookId !== undefined) await removeTestBook(bookId)
    await removeTestUser(admin)
  }
})

test('admin can open a physical copy to inspect its status and circulation history', async ({ page }) => {
  const admin = await createTestUser('admin')
  const title = `E2E Copy Details ${randomUUID()}`
  let bookId: number | undefined
  try {
    const book = await createPhysicalBook(title)
    bookId = book.bookId
    const { data: copy, error: copyError } = await adminClient
      .from('physical_book_copies')
      .select('copy_code')
      .eq('id', book.copyId)
      .single()
    expect(copyError).toBeNull()
    if (!copy) throw new Error('Expected the physical copy to be available for the test.')

    await signInInBrowser(page, admin)
    await page.getByRole('button', { name: 'Physical catalog', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Physical book catalog' })).toBeVisible()
    await page.getByPlaceholder('Search title, author, ISBN...').fill(title)
    const bookRow = page.locator('tr').filter({ hasText: title }).first()
    await bookRow.getByRole('button', { name: 'Manage title' }).click()
    const manageDialog = page.getByRole('dialog', { name: 'Manage physical book' })
    await expect(manageDialog.getByText('Subject')).toBeVisible()
    const archiveButton = manageDialog.getByRole('button', { name: 'Archive' })
    await expect(archiveButton).toBeVisible()
    await expect(archiveButton).toHaveClass(/bg-rose-700/)
    await expect(archiveButton).toHaveClass(/text-white/)
    await page.keyboard.press('Escape')
    await expect(manageDialog).toHaveCount(0)
    await bookRow.getByRole('button', { name: 'View copies' }).click()
    await page.getByRole('button', { name: `View copy details for ${copy.copy_code}` }).click()

    const copyDialog = page.getByRole('dialog', { name: `Copy details · ${copy.copy_code}` })
    await expect(copyDialog).toBeVisible()
    await expect(copyDialog.getByText(`Copy record #${book.copyId}`)).toBeVisible()
    await expect(copyDialog.getByText('Current status')).toBeVisible()
    await expect(copyDialog.getByText('available', { exact: true })).toBeVisible()
    await expect(copyDialog.getByText('No active borrower.')).toBeVisible()
    await expect(copyDialog.getByText('No completed checkout records for this copy yet.')).toBeVisible()
  } finally {
    await clearBrowserSession(page)
    if (bookId !== undefined) await removeTestBook(bookId)
    await removeTestUser(admin)
  }
})

test('admin audit log shows actor and event details and filters loaded records', async ({ page }) => {
  const admin = await createTestUser('admin')
  const actor = await createTestUser('librarian')
  const marker = `audit-${randomUUID()}`
  let auditLogId: number | undefined
  try {
    const { error: actorProfileError } = await adminClient
      .from('profiles')
      .update({ full_name: 'E2E Audit Librarian' })
      .eq('id', actor.id)
    expect(actorProfileError).toBeNull()
    const { data: auditLog, error: auditLogError } = await adminClient
      .from('audit_logs')
      .insert({
        actor_id: actor.id,
        action: 'e2e_admin_audit_check',
        target_type: 'profile',
        target_id: 1,
        details: {
          reason: marker,
          points: 15,
          category: 'profile',
          source: 'e2e',
          result: 'updated',
          previous_role: 'student',
          current_role: 'student',
          verification: true,
          actor_context: 'audit coverage',
          tail_marker: 'Visible beyond the previous eight-field limit',
        },
      })
      .select('id')
      .single()
    expect(auditLogError).toBeNull()
    if (!auditLog) throw new Error('Expected the audit event to be created.')
    auditLogId = auditLog.id

    await signInInBrowser(page, admin)
    await page.getByRole('button', { name: 'Audit log' }).click()
    await expect(page.getByRole('heading', { name: 'Audit log', exact: true })).toBeVisible()
    const auditPanel = page.getByRole('heading', { name: 'Audit log' }).locator('..')
    await expect(auditPanel.getByText(/e2e admin audit check/i)).toBeVisible()
    await expect(auditPanel.getByText(/E2E Audit Librarian · librarian/)).toBeVisible()
    await expect(auditPanel.getByText(marker)).toBeVisible()
    await expect(auditPanel.getByText('15', { exact: true })).toBeVisible()
    await expect(auditPanel.getByText('Visible beyond the previous eight-field limit')).toBeVisible()

    const auditSearch = auditPanel.getByRole('searchbox', { name: 'Search loaded events' })
    await auditSearch.fill(marker)
    await expect(auditPanel.getByText(/e2e admin audit check/i)).toBeVisible()
    await auditSearch.fill('no matching audit event')
    await expect(auditPanel.getByText('No loaded audit events match this search.')).toBeVisible()
  } finally {
    await clearBrowserSession(page)
    if (auditLogId !== undefined) {
      const { error } = await adminClient.from('audit_logs').delete().eq('id', auditLogId)
      if (error) throw new Error(`Unable to remove test audit event: ${error.message}`)
    }
    await removeTestUser(actor)
    await removeTestUser(admin)
  }
})

test('admin can suspend and restore a member account with an audited reason', async ({ page }) => {
  const admin = await createTestUser('admin')
  const member = await createTestUser('student')
  const adminClientForMember = createUserClient()
  const auditActions = ['member_account_suspended', 'member_account_unsuspended']
  try {
    await signInInBrowser(page, admin)
    await page.getByRole('button', { name: 'Member accounts' }).click()
    await expect(page.getByRole('heading', { name: 'Member management' })).toBeVisible()
    const memberSearch = page.getByRole('searchbox', { name: 'Search members' })
    await memberSearch.fill(member.email)
    const memberRow = page.getByRole('row').filter({ hasText: member.email })
    await expect(memberRow).toBeVisible()
    await memberRow.click()

    const memberDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /E2E student/ }) })
    await expect(memberDialog.getByText('Sign-in status: Active')).toBeVisible()
    await memberDialog.getByRole('button', { name: 'Suspend sign-in' }).click()
    const suspendDialog = page.getByRole('dialog', { name: 'Suspend member sign-in?' })
    await suspendDialog.getByLabel('Required reason').fill('Reviewing a reported account issue')
    await suspendDialog.getByRole('button', { name: 'Suspend sign-in' }).click()
    await expect(memberDialog.getByText(/Sign-in status: Suspended/)).toBeVisible()

    const { data: suspendedAuth, error: suspendedAuthError } = await adminClient.auth.admin.getUserById(member.id)
    expect(suspendedAuthError).toBeNull()
    expect(suspendedAuth.user?.banned_until).toBeTruthy()
    const { error: suspendedLoginError } = await adminClientForMember.auth.signInWithPassword({ email: member.email, password: member.password })
    expect(suspendedLoginError).toBeTruthy()

    await page.getByRole('button', { name: 'Done' }).click()
    await memberDialog.getByRole('button', { name: 'Lift suspension' }).click()
    const restoreDialog = page.getByRole('dialog', { name: 'Lift account suspension?' })
    await restoreDialog.getByLabel('Required reason').fill('Investigation completed')
    await restoreDialog.getByRole('button', { name: 'Lift suspension' }).click()
    await expect(memberDialog.getByText('Sign-in status: Active')).toBeVisible()

    const { data: restoredAuth, error: restoredAuthError } = await adminClient.auth.admin.getUserById(member.id)
    expect(restoredAuthError).toBeNull()
    expect(restoredAuth.user?.banned_until).toBeFalsy()
    const { error: restoredLoginError } = await adminClientForMember.auth.signInWithPassword({ email: member.email, password: member.password })
    expect(restoredLoginError).toBeNull()

    const { data: auditRows, error: auditError } = await adminClient
      .from('audit_logs')
      .select('action,details')
      .in('action', auditActions)
      .contains('details', { target_user_id: member.id })
    expect(auditError).toBeNull()
    expect(auditRows).toHaveLength(2)
    expect(auditRows?.map((row) => row.action).sort()).toEqual([...auditActions].sort())
    expect(auditRows?.some((row) => (row.details as Record<string, unknown>).reason === 'Reviewing a reported account issue')).toBe(true)
    expect(auditRows?.some((row) => (row.details as Record<string, unknown>).reason === 'Investigation completed')).toBe(true)
  } finally {
    await clearBrowserSession(page)
    const { error: auditCleanupError } = await adminClient
      .from('audit_logs')
      .delete()
      .in('action', auditActions)
      .contains('details', { target_user_id: member.id })
    if (auditCleanupError) throw new Error(`Unable to remove test suspension audit events: ${auditCleanupError.message}`)
    await removeTestUser(member)
    await removeTestUser(admin)
  }
})
