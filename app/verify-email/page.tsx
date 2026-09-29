'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import BrandLogo from '@/components/BrandLogo'
import { getSupabase } from '@/utils/supabase/client'

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Checking your verification link...')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const queryStatus = params.get('status')
    const queryMessage = params.get('message')
    if (queryStatus === 'error') {
      setStatus('error')
      setMessage(queryMessage || 'This verification link is invalid or has expired.')
      return
    }

    getSupabase().auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        setStatus('error')
        setMessage('Your email could not be verified. Please request a new confirmation email and try again.')
        return
      }
      setStatus('success')
      setMessage('Your email address has been verified. Your Smart Lib account is ready.')
    }).catch(() => {
      setStatus('error')
      setMessage('We could not complete verification. Please request a new confirmation email and try again.')
    })
  }, [])

  return (
    <main className="surface-page flex min-h-screen items-center justify-center px-4 py-12 text-slate-900 dark:text-slate-100">
      <section className="surface-card w-full max-w-md p-8 text-center shadow-2xl sm:p-10">
        <div className="mb-6 flex justify-center"><BrandLogo iconSize="sm" showText={false} /></div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Smart Lib</p>
        <h1 className="mt-3 text-2xl font-bold">{status === 'loading' ? 'Verifying your email' : status === 'success' ? 'Email verified' : 'Verification problem'}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
        {status === 'loading' ? <div className="mx-auto mt-6 h-2 w-24 animate-pulse rounded-full bg-pine-200 dark:bg-forest-700" /> : <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center"><Link href={status === 'success' ? '/dashboard' : '/login'} className="rounded-xl bg-forest-900 px-5 py-3 text-sm font-semibold text-paper-100 dark:bg-paper-100 dark:text-forest-900">{status === 'success' ? 'Continue to Smart Lib' : 'Return to sign in'}</Link>{status === 'error' ? <Link href="/register" className="rounded-xl border border-paper-300 px-5 py-3 text-sm font-semibold text-pine-700 dark:border-forest-700 dark:text-pine-200">Create account again</Link> : null}</div>}
      </section>
    </main>
  )
}
