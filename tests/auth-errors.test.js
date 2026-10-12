'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { isMissingAuthSession } = require('../utils/supabase/auth-errors')

test('recognizes Supabase missing-session errors by error name', () => {
  assert.equal(isMissingAuthSession({ name: 'AuthSessionMissingError', message: 'No session' }), true)
})

test('recognizes the Supabase missing-session message', () => {
  assert.equal(isMissingAuthSession({ name: 'AuthError', message: 'Auth session missing!' }), true)
})

test('does not classify unexpected authentication errors as missing sessions', () => {
  assert.equal(isMissingAuthSession({ name: 'AuthRetryableFetchError', message: 'Network request failed' }), false)
})

test('safely rejects null and non-object inputs', () => {
  assert.equal(isMissingAuthSession(null), false)
  assert.equal(isMissingAuthSession('Auth session missing!'), false)
})
