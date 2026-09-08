const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const schema = fs.readFileSync(path.join(root, 'supabase', 'BASE_SCHEMA.sql'), 'utf8')
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
]

for (const objectName of requiredSchemaObjects) {
  if (!schema.includes(objectName)) throw new Error(`Missing schema object: ${objectName}`)
}

const requiredFiles = [
  'app/assistant/page.tsx',
  'app/api/assistant/sessions/route.ts',
  'components/BookAssistant.tsx',
]

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing application file: ${file}`)
}

console.log(`System check passed: ${requiredSchemaObjects.length} schema objects and ${requiredFiles.length} application files verified.`)
