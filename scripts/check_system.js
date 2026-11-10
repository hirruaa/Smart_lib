const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const schemaDirectory = path.join(root, 'supabase')
const schemaFiles = fs.readdirSync(schemaDirectory).filter((file) => file.endsWith('.sql'))
const allowedSchemaFiles = ['ALL_MIGRATIONS.sql', 'COMPLETE_SCHEMA.sql']
if (allowedSchemaFiles.some((file) => !schemaFiles.includes(file)) || schemaFiles.some((file) => !allowedSchemaFiles.includes(file))) {
  throw new Error(`Expected only supabase/COMPLETE_SCHEMA.sql and supabase/ALL_MIGRATIONS.sql, found: ${schemaFiles.join(', ') || 'no SQL files'}`)
}
const schema = fs.readFileSync(path.join(schemaDirectory, 'COMPLETE_SCHEMA.sql'), 'utf8')
const requiredSchemaObjects = [
  'assistant_sessions',
  'assistant_messages',
  'admin_set_profile_role',
  'admin_decide_borrow_request',
  'renew_digital_loan',
  'return_digital_loan',
  'fines',
  'academic_departments',
  'provision_profile',
  'assistant_current_librarians',
  'api_rate_limit_buckets',
  'consume_api_rate_limit',
]

for (const objectName of requiredSchemaObjects) {
  if (!schema.includes(objectName)) throw new Error(`Missing schema object: ${objectName}`)
}

const departmentMigrationPath = path.join(root, 'supabase/migrations/20261111_seed_program_departments.sql')
if (!fs.existsSync(departmentMigrationPath)) throw new Error('Missing program-based faculty departments migration')
const departmentMigration = fs.readFileSync(departmentMigrationPath, 'utf8')
for (const token of ['from public.academic_courses', 'where is_active', 'on conflict (lower(name))']) {
  if (!departmentMigration.includes(token)) throw new Error(`Program-based departments migration is missing: ${token}`)
}
const assistantDirectoryMigrationPath = path.join(root, 'supabase/migrations/20261114100000_library_assistant_current_librarians.sql')
if (!fs.existsSync(assistantDirectoryMigrationPath)) throw new Error('Missing current librarian directory migration')
const assistantDirectoryMigration = fs.readFileSync(assistantDirectoryMigrationPath, 'utf8')
for (const token of ['assistant_current_librarians()', "profile.role = 'librarian'", 'from public, anon', 'to authenticated']) {
  if (!assistantDirectoryMigration.includes(token)) throw new Error(`Current librarian directory migration is missing: ${token}`)
}
const assistantRoute = fs.readFileSync(path.join(root, 'app/api/recommend/route.ts'), 'utf8')
for (const token of ["from('library_policy_settings')", "rpc('assistant_current_librarians')", "from('fines')", 'getImmediatePolicyAnswer']) {
  if (!assistantRoute.includes(token)) throw new Error(`Library assistant live guidance is missing: ${token}`)
}
const profileModal = fs.readFileSync(path.join(root, 'components/ProfileModal.tsx'), 'utf8')
for (const token of ["from('academic_departments')", 'departments.map']) {
  if (!profileModal.includes(token)) throw new Error(`Profile department choices are missing: ${token}`)
}

const requiredHybridObjects = [
  'physical_book_copies',
  'physical_loan_options',
  'physical_book_requests',
  'physical_book_waitlist',
  'request_physical_book',
  'admin_confirm_physical_checkout',
  'admin_close_physical_loan',
  'physical_request_cash_only',
  'enforce_physical_cash_only',
]

for (const objectName of requiredHybridObjects) {
  if (!schema.includes(objectName)) throw new Error(`Missing schema object: ${objectName}`)
}

const cashOnlyMigrationPath = path.join(root, 'supabase/migrations/20261107_cash_only_physical_payments.sql')
if (!fs.existsSync(cashOnlyMigrationPath)) throw new Error('Missing cash-only physical payments migration')
const cashOnlyMigration = fs.readFileSync(cashOnlyMigrationPath, 'utf8')
for (const token of [
  "p_payment_method is distinct from 'cash'",
  'Historical online-payment details are read-only',
  'physical_payment_proofs_upload_own',
  'physical_payment_proofs_read_own_or_admin',
  'physical_payment_proofs_delete_unlinked_own',
  'public.accept_physical_waitlist_offer',
]) {
  if (!cashOnlyMigration.includes(token)) throw new Error(`Cash-only migration is missing: ${token}`)
}
const cashTopUpConstraintMigrationPath = path.join(root, 'supabase/migrations/20261110123000_fix_cash_topup_transaction_check.sql')
if (!fs.existsSync(cashTopUpConstraintMigrationPath)) throw new Error('Missing cash point top-up transaction constraint repair migration')
const cashTopUpConstraintMigration = fs.readFileSync(cashTopUpConstraintMigrationPath, 'utf8')
for (const token of ['point_transactions_transaction_type_check', "'cash_topup'", "'contribution_reward'", "'admin_adjustment'"]) {
  if (!cashTopUpConstraintMigration.includes(token)) throw new Error(`Cash point top-up constraint migration is missing: ${token}`)
}

const sharedRateLimitMigrationPath = path.join(root, 'supabase/migrations/20261114110000_shared_api_rate_limits.sql')
if (!fs.existsSync(sharedRateLimitMigrationPath)) throw new Error('Missing shared API rate-limit migration')
const sharedRateLimitMigration = fs.readFileSync(sharedRateLimitMigrationPath, 'utf8')
for (const token of ['api_rate_limit_buckets', 'consume_api_rate_limit', 'to service_role', 'enable row level security']) {
  if (!sharedRateLimitMigration.includes(token)) throw new Error(`Shared API rate-limit migration is missing: ${token}`)
}

const requiredFiles = [
  'app/assistant/page.tsx',
  'app/api/assistant/sessions/route.ts',
  'components/BookAssistant.tsx',
  'app/dashboard/admin/physical/page.tsx',
  'app/dashboard/faculty/page.tsx',
  'components/MemberDashboard.tsx',
  'components/PhysicalBorrowModal.tsx',
  'components/StudyRoom.tsx',
  'app/api/reader/library/route.ts',
  'utils/libraryContracts.ts',
  'supabase/migrations/20261013_faculty_signup_departments.sql',
]

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing application file: ${file}`)
}

const studyRoom = fs.readFileSync(path.join(root, 'components/StudyRoom.tsx'), 'utf8')
for (const token of ['My digital library', 'Study notebook', 'studyItemsTruncated', 'onDraftChange', 'window.history.replaceState', 'window.confirm']) {
  if (!studyRoom.includes(token)) throw new Error(`Study Room is missing: ${token}`)
}
const readerLibraryApi = fs.readFileSync(path.join(root, 'app/api/reader/library/route.ts'), 'utf8')
for (const token of ["supabase.auth.getUser()", "borrow_requests", "book_access_grants", "study_notes", "highlights"]) {
  if (!readerLibraryApi.includes(token)) throw new Error(`Reader library endpoint is missing access/study data handling: ${token}`)
}

const libraryContracts = fs.readFileSync(path.join(root, 'utils/libraryContracts.ts'), 'utf8')
for (const token of ['normalizeAccessMode', "'free' | 'points'", "'loan'", "'restricted'"]) {
  if (!libraryContracts.includes(token)) throw new Error(`Missing canonical library contract: ${token}`)
}

const memberDashboard = fs.readFileSync(path.join(root, 'components/MemberDashboard.tsx'), 'utf8')
const adminDashboard = fs.readFileSync(path.join(root, 'app/dashboard/admin/page.tsx'), 'utf8')
const facultyDashboard = fs.readFileSync(path.join(root, 'app/dashboard/faculty/page.tsx'), 'utf8')
const sharedShellStyles = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8')
const physicalCirculation = fs.readFileSync(path.join(root, 'components/PhysicalCirculationAdminPage.tsx'), 'utf8')
const librarianReports = fs.readFileSync(path.join(root, 'components/LibrarianDeskReports.tsx'), 'utf8')
for (const token of ['librarian-sidebar', 'Daily records', 'Inventory', 'LibrarianDailyRecord']) {
  if (!physicalCirculation.includes(token)) throw new Error(`Librarian workspace is missing: ${token}`)
}
for (const token of ['Sales &amp; borrowing history', 'Cash · checkout fees', 'Other receipts', 'Refunds recorded', 'Books borrowed on this date']) {
  if (!librarianReports.includes(token)) throw new Error(`Librarian daily records are missing: ${token}`)
}
for (const [name, source] of [
  ['member dashboard', memberDashboard],
  ['admin dashboard', adminDashboard],
]) {
  for (const token of ['dashboard-shell', 'dashboard-layout', 'dashboard-sidebar', 'dashboard-workspace']) {
    if (!source.includes(token)) throw new Error(`Missing shared ${token} contract in ${name}`)
  }
}
for (const token of ['.dashboard-hero', '.dashboard-panel', '.dashboard-sidebar-collapsed', '@media (max-width: 900px)']) {
  if (!sharedShellStyles.includes(token)) throw new Error(`Missing shared dashboard style contract: ${token}`)
}
if (!facultyDashboard.includes("MemberDashboard memberType=\"faculty\"")) {
  throw new Error('Faculty dashboard is not using the shared member dashboard shell')
}
for (const token of ['dashboard-catalog-search', "document.getElementById('explore')?.scrollIntoView", 'View loans and charges']) {
  if (!memberDashboard.includes(token)) throw new Error(`Member dashboard is missing a direct discovery/activity action: ${token}`)
}
if (memberDashboard.includes('<label className="catalog-search-box">')) {
  throw new Error('Member dashboard has duplicate catalog search controls')
}
for (const token of ["navigateToSection('contributions')", "navigateToSection('requests')", "label: 'Digital access records', value: requests.length"]) {
  if (!adminDashboard.includes(token)) throw new Error(`Admin dashboard is missing the simplified overview action/metric: ${token}`)
}
if (adminDashboard.includes("['Pending digital requests', pendingRequests.length]")) {
  throw new Error('Admin dashboard repeats the digital access request count')
}
for (const token of ['.dashboard-catalog-search', '.admin-attention-card']) {
  if (!sharedShellStyles.includes(token)) throw new Error(`Missing dashboard interaction style: ${token}`)
}

for (const migrationFile of [
  'supabase/migrations/20261015_automate_digital_borrowing.sql',
  'supabase/migrations/20261017_automatic_standard_ebook_access.sql',
]) {
  const digitalBorrowingMigration = fs.readFileSync(path.join(root, migrationFile), 'utf8')
  if (!digitalBorrowingMigration.includes("where access_mode in ('loan', 'restricted')")) {
    throw new Error(`${migrationFile} does not normalize legacy loan/restricted access modes`)
  }
  if (!digitalBorrowingMigration.includes("if book_mode in ('loan', 'restricted') then")) {
    throw new Error(`${migrationFile} does not normalize legacy loan/restricted access modes in the function`)
  }
}

console.log(`System check passed: ${requiredSchemaObjects.length + requiredHybridObjects.length} schema objects, cash-only physical payments, continuous Study Room, ${requiredFiles.length} application files, shared dashboard shell, and digital access migration verified.`)
