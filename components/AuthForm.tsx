'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type AuthMode = 'login' | 'signup'

interface AuthFormProps {
  defaultMode: AuthMode
}

export default function AuthForm({ defaultMode }: AuthFormProps) {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>(defaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setIsSubmitting(true)

    const supabase = createClient()

    if (mode === 'signup') {
      const result = await supabase.auth.signUp({
        email,
        password,
      })

      if (result.error) {
        setErrorMsg(result.error.message)
      } else {
        setSuccessMsg('Account created. Please verify your email if required, then sign in.')
      }
    } else {
      const result = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (result.error) {
        setErrorMsg(result.error.message)
      } else {
        router.replace('/dashboard')
      }
    }

    setIsSubmitting(false)
  }

  const isLogin = mode === 'login'

  return (
    <div className="auth-page min-h-screen px-4 py-12 text-slate-900 antialiased dark:text-slate-100">
      <div className="auth-card mx-auto max-w-md p-8 sm:p-10">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-pine-600 transition hover:underline dark:text-pine-200"
          >
            &larr; Back to Home
          </Link>
        </div>

        {/* Tab switcher */}
        <div className="mb-6 flex rounded-2xl border border-paper-300 bg-paper-100 p-1 dark:border-forest-700 dark:bg-forest-900">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setErrorMsg('')
              setSuccessMsg('')
            }}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              isLogin
                ? 'bg-forest-900 text-paper-100 shadow dark:bg-paper-100 dark:text-forest-900'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup')
              setErrorMsg('')
              setSuccessMsg('')
            }}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              !isLogin
                ? 'bg-forest-900 text-paper-100 shadow dark:bg-paper-100 dark:text-forest-900'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            Create account
          </button>
        </div>

        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pine-600 dark:text-pine-200">Smart Lib</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {isLogin ? 'Welcome back' : 'Start your library account'}
          </h1>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {isLogin
              ? 'Sign in to access your digital books, study notes, and research desk.'
              : 'Create a student account to discover, borrow, and study library resources.'}
          </p>
        </div>

        {errorMsg ? (
          <div className="form-error mt-6 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        ) : null}

        {successMsg ? (
          <div className="form-success mt-6 px-4 py-3 text-sm">
            {successMsg}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="workspace-input mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="workspace-input mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none"
              placeholder="Enter your password"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="pine-action w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-3 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:justify-between">
          <p>{isLogin ? "Don't have an account?" : 'Already have an account?'}</p>
          <Link
            href={isLogin ? '/register' : '/login'}
            className="font-semibold text-celadon"
          >
            {isLogin ? 'Create account' : 'Sign in'}
          </Link>
        </div>
      </div>
    </div>
  )
}
