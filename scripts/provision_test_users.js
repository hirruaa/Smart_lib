#!/usr/bin/env node
/* Provision test users (admin and student) using Supabase service key.
   Loads env from .env.local via dotenv. */
const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')
const path = require('path')

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE service key in env (.env.local).')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const users = [
  { email: process.env.SMOKE_ADMIN_EMAIL || 'admin@test.com', password: process.env.SMOKE_ADMIN_PASSWORD || 'admin123', role: 'admin' },
  { email: process.env.SMOKE_STUDENT_EMAIL || 'student@test.com', password: process.env.SMOKE_PASSWORD || 'student123', role: 'student' },
]

async function listAllUsers() {
  const users = []
  let page = 1
  while (true) {
    const res = await supabase.auth.admin.listUsers({ per_page: 100, page })
    if (res.error) throw res.error
    const batch = res.data?.users || []
    users.push(...batch)
    if (batch.length < 100) break
    page++
  }
  return users
}

async function ensureUser(email, password, role) {
  console.log('Ensuring user', email)
  // Try to find existing user by listing
  let found = null
  try {
    const all = await listAllUsers()
    found = all.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  } catch (err) {
    console.warn('Failed to list users (continuing):', err.message || err)
  }

  if (!found) {
    console.log('Creating user', email)
    const res = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    })
    if (res.error) {
      // if user exists, try to fallback
      if (res.error.message && res.error.message.includes('already exists')) {
        console.warn('User already exists according to createUser response, will try to find it.')
      } else {
        throw res.error
      }
    }
    found = res.data?.user
  }

  if (!found) {
    throw new Error('Unable to ensure user ' + email)
  }

  // Ensure the user's password is set (update via admin API)
  try {
    const upd = await supabase.auth.admin.updateUserById(found.id, { password, email_confirm: true })
    if (upd.error) {
      console.warn('Failed to update password for', email, upd.error.message)
    } else {
      console.log('Password ensured for', email)
    }
  } catch (err) {
    console.warn('updateUserById not available or failed for', email, (err && err.message) || err)
  }

  // Upsert profile row
  const profile = {
    id: found.id,
    email: found.email,
    role,
  }
  const { error: upsertErr } = await supabase.from('profiles').upsert(profile)
  if (upsertErr) {
    console.warn('Profile upsert error for', email, upsertErr.message)
  } else {
    console.log('Upserted profile for', email)
  }
}

;(async () => {
  try {
    for (const u of users) {
      await ensureUser(u.email, u.password, u.role)
    }
    console.log('Provisioning complete')
    process.exit(0)
  } catch (err) {
    console.error('Provisioning failed:', err.message || err)
    process.exit(2)
  }
})()
