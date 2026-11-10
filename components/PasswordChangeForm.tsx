'use client'

import { FormEvent, useState } from 'react'
import PasswordInput from '@/components/PasswordInput'
import { getSupabase } from '@/utils/supabase/client'

export default function PasswordChangeForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (password.length < 12 || password.length > 128) {
      setError('Use a password between 12 and 128 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to update your password.')

      const { error: refreshError } = await getSupabase().auth.refreshSession()
      if (refreshError) throw new Error('Password changed, but your session could not refresh. Sign out and sign in again.')
      setPassword('')
      setConfirmPassword('')
      onSuccess()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your password.')
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={(event) => void submit(event)} className="space-y-4">
    {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
    <label className="block text-sm font-medium">
      New password
      <PasswordInput required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" />
    </label>
    <label className="block text-sm font-medium">
      Confirm new password
      <PasswordInput required minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950" />
    </label>
    <p className="text-xs text-slate-500">Use at least 12 characters. Avoid reusing a password from another account.</p>
    <button type="submit" disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-sky-500 dark:text-slate-950">
      {saving ? 'Updating password…' : 'Update password'}
    </button>
  </form>
}
