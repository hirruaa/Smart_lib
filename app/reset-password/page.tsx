'use client'

import { FormEvent, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import BrandLogo from '@/components/BrandLogo'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session)
    })
  }, [])

  const handleReset = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    const supabase = createClient()

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      })

      if (error) {
        setErrorMsg(error.message)
      } else {
        setSuccessMsg('Your password has been reset successfully! Redirecting to dashboard...')
        setTimeout(() => {
          router.replace('/dashboard')
        }, 2000)
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="surface-page flex min-h-screen flex-col items-center justify-center px-4 py-12 text-slate-900 antialiased dark:text-slate-100 sm:px-6">
      <div className="surface-card w-full max-w-md p-8 sm:p-10 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-pine-600 transition hover:underline dark:text-pine-200"
          >
            &larr; Back to Login
          </Link>
          <BrandLogo iconSize="sm" showText={false} />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Set New Password
          </h1>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Please enter your new password below.
          </p>
        </div>

        {errorMsg && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleReset} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              New Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100"
              placeholder="••••••••"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Confirm New Password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100"
              placeholder="••••••••"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-forest-900 py-3 text-sm font-semibold text-paper-100 shadow transition hover:bg-forest-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-paper-100 dark:text-forest-900 dark:hover:bg-paper-200"
          >
            {isSubmitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
