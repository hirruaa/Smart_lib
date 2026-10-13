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
  'reviews',
  'wishlists',
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
  'supabase/migrations/20261013_faculty_signup_departments.sql',
]

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing application file: ${file}`)
}

console.log(`System check passed: ${requiredSchemaObjects.length + requiredHybridObjects.length} schema objects and ${requiredFiles.length} application files verified.`)
