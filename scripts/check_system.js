const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const schemaDirectory = path.join(root, 'supabase')
const schemaFiles = fs.readdirSync(schemaDirectory).filter((file) => file.endsWith('.sql'))
if (schemaFiles.length !== 1 || schemaFiles[0] !== 'COMPLETE_SCHEMA.sql') {
  throw new Error(`Expected only supabase/COMPLETE_SCHEMA.sql, found: ${schemaFiles.join(', ') || 'no SQL files'}`)
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
]

for (const objectName of requiredSchemaObjects) {
  if (!schema.includes(objectName)) throw new Error(`Missing schema object: ${objectName}`)
}

const requiredHybridObjects = [
  'physical_book_copies',
  'physical_loan_options',
  'physical_book_requests',
  'physical_book_waitlist',
  'request_physical_book',
  'admin_confirm_physical_checkout',
  'admin_close_physical_loan',
  'physical_payment_proofs',
]

for (const objectName of requiredHybridObjects) {
  if (!schema.includes(objectName)) throw new Error(`Missing schema object: ${objectName}`)
}

const requiredFiles = [
  'app/assistant/page.tsx',
  'app/api/assistant/sessions/route.ts',
  'components/BookAssistant.tsx',
  'app/dashboard/admin/physical/page.tsx',
  'app/dashboard/faculty/page.tsx',
  'components/MemberDashboard.tsx',
  'components/PhysicalBorrowModal.tsx',
  'utils/libraryContracts.ts',
  'supabase/migrations/20261013_faculty_signup_departments.sql',
]

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing application file: ${file}`)
}

const libraryContracts = fs.readFileSync(path.join(root, 'utils/libraryContracts.ts'), 'utf8')
for (const token of ['normalizeAccessMode', "'free' | 'points' | 'premium'", "'loan'", "'restricted'"]) {
  if (!libraryContracts.includes(token)) throw new Error(`Missing canonical library contract: ${token}`)
}

const memberDashboard = fs.readFileSync(path.join(root, 'components/MemberDashboard.tsx'), 'utf8')
const adminDashboard = fs.readFileSync(path.join(root, 'app/dashboard/admin/page.tsx'), 'utf8')
const facultyDashboard = fs.readFileSync(path.join(root, 'app/dashboard/faculty/page.tsx'), 'utf8')
const sharedShellStyles = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8')
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

console.log(`System check passed: ${requiredSchemaObjects.length + requiredHybridObjects.length} schema objects, ${requiredFiles.length} application files, shared dashboard shell, and digital access migration verified.`)
