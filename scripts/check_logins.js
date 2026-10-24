const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const envFile = path.resolve(__dirname, '..', '.env.local')
if (!fs.existsSync(envFile)) {
  console.error('.env.local not found')
  process.exit(1)
}

const env = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const match = /^([^=]+)=(.*)$/.exec(line)
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
  return acc
}, {})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!supabaseUrl || !anonKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
  process.exit(1)
}

const host = new URL(supabaseUrl).hostname
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error('Refusing to test logins against a remote Supabase project. Use a local Supabase instance.')
  process.exit(1)
}

const credentials = [
  { role: 'admin', email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD },
  { role: 'student', email: process.env.TEST_STUDENT_EMAIL, password: process.env.TEST_STUDENT_PASSWORD },
].filter((account) => account.email && account.password)

if (!credentials.length) {
  console.error('Set TEST_ADMIN_EMAIL/PASSWORD and/or TEST_STUDENT_EMAIL/PASSWORD for disposable local test accounts.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, anonKey)

;(async () => {
  for (const account of credentials) {
    try {
      const result = await supabase.auth.signInWithPassword({ email: account.email, password: account.password })
      console.log(`${account.role}: ${result.error ? `ERROR: ${result.error.message}` : 'OK'}`)
      if (!result.error) await supabase.auth.signOut()
    } catch (error) {
      console.error(`${account.role}: ${error?.message ?? error}`)
    }
  }
})()
