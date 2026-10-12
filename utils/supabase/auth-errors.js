'use strict'

function isMissingAuthSession(error) {
  if (!error || typeof error !== 'object') return false

  return error.name === 'AuthSessionMissingError' || error.message === 'Auth session missing!'
}

module.exports = { isMissingAuthSession }
