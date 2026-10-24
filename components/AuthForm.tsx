'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { getSupabase } from '@/utils/supabase/client'
import BrandLogo from '@/components/BrandLogo'
import PasswordInput from '@/components/PasswordInput'

type AuthMode = 'login' | 'forgot'

function getAuthOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')
  return configuredOrigin || (typeof window !== 'undefined' ? window.location.origin : '')
}

export default function AuthForm() {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isForgot = mode === 'forgot'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setIsSubmitting(true)
    try {
      const supabase = getSupabase()
      if (isForgot) {
        const result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${getAuthOrigin()}/auth/callback?next=/reset-password`,
        })
        if (result.error) setErrorMsg(result.error.message)
        else setSuccessMsg('Password recovery link sent. Please check your inbox.')
      } else {
        const result = await supabase.auth.signInWithPassword({ email, password })
        if (result.error) {
          setErrorMsg(result.error.message)
          return
        }
        const requestedPath = new URLSearchParams(window.location.search).get('next')
        const parsedNext = requestedPath ? new URL(requestedPath, window.location.origin) : null
        const nextPath = parsedNext?.origin === window.location.origin
          ? `${parsedNext.pathname}${parsedNext.search}${parsedNext.hash}`
          : '/dashboard'
        router.replace(nextPath)
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'An unexpected authentication error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="surface-page flex min-h-screen flex-col items-center justify-center px-4 py-12 text-slate-900 antialiased dark:text-slate-100 sm:px-6">
    <section className="surface-card w-full max-w-md p-8 shadow-2xl sm:p-10">
      <div className="mb-7 flex items-center justify-between"><Link href="/" className="text-xs font-semibold text-pine-600 hover:underline dark:text-pine-200">← Back to college site</Link><BrandLogo iconSize="sm" showText={false}/></div>
      <div className="text-center"><h1 className="text-2xl font-bold tracking-tight">{isForgot ? 'Reset your password' : 'College library sign in'}</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{isForgot ? 'Enter your account email to receive a password reset link.' : 'Use the account issued to you by the college administrator.'}</p></div>
      {errorMsg ? <div role="alert" aria-live="assertive" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{errorMsg}</div> : null}
      {successMsg ? <div role="status" aria-live="polite" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">{successMsg}</div> : null}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block"><span className="text-xs font-semibold uppercase tracking-wider">Email address</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-pine-500 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100" placeholder="you@college.edu"/></label>
        {!isForgot ? <label className="block"><span className="text-xs font-semibold uppercase tracking-wider">Password</span><PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-pine-500 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100" placeholder="Your password"/></label> : null}
        <button type="submit" disabled={isSubmitting} className="pine-action w-full rounded-xl py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? 'Processing...' : isForgot ? 'Send reset link' : 'Sign in'}</button>
      </form>
      <div className="mt-5 text-center">{isForgot ? <button type="button" onClick={() => { setMode('login'); setErrorMsg(''); setSuccessMsg('') }} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">← Return to sign in</button> : <button type="button" onClick={() => { setMode('forgot'); setErrorMsg(''); setSuccessMsg('') }} className="text-xs font-semibold text-pine-700 hover:underline dark:text-pine-200">Forgot password?</button>}</div>
    </section>
  </main>
}
