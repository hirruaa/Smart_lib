'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabase } from '@/utils/supabase/client'
import BrandLogo from '@/components/BrandLogo'
import PasswordChangeForm from '@/components/PasswordChangeForm'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [successMsg, setSuccessMsg] = useState('')
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [required, setRequired] = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    setRequired(new URLSearchParams(window.location.search).get('required') === '1')
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session)
    })
  }, [])

  const handlePasswordChanged = () => {
    setSuccessMsg('Your password has been updated. Redirecting to your library…')
    setTimeout(() => router.replace('/dashboard'), 1200)
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
            {required ? 'Change your initial password' : 'Set New Password'}
          </h1>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {required
              ? 'Set a private password before continuing to your library account.'
              : 'Please enter your new password below.'}
          </p>
        </div>

        {successMsg && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {successMsg}
          </div>
        )}

        {hasSession === false
          ? <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">This password link is invalid or has expired. Sign in with your initial password or request a new recovery link.</p>
          : hasSession ? <div className="mt-6"><PasswordChangeForm onSuccess={handlePasswordChanged} /></div> : null}
      </div>
    </div>
  )
}
