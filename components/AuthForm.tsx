'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'
import { getSupabase } from '@/utils/supabase/client'
import BrandLogo from '@/components/BrandLogo'

type AuthMode = 'login' | 'signup' | 'forgot'

interface AuthFormProps {
  defaultMode: 'login' | 'signup'
}

export default function AuthForm({ defaultMode }: AuthFormProps) {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>(defaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setIsSubmitting(true)

    const supabase = getSupabase()

    try {
      if (mode === 'signup') {
        const result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim() || undefined,
            },
          },
        })

        if (result.error) {
          setErrorMsg(result.error.message)
        } else {
          setSuccessMsg('Account registered successfully! If email confirmation is enabled, check your inbox to verify your account, or sign in now.')
        }
      } else if (mode === 'forgot') {
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        const result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/reset-password`,
        })

        if (result.error) {
          setErrorMsg(result.error.message)
        } else {
          setSuccessMsg('Password recovery link sent! Please check your email inbox.')
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
    } catch (err: any) {
      setErrorMsg(err?.message || 'An unexpected error occurred during authentication.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isLogin = mode === 'login'
  const isForgot = mode === 'forgot'

  return (
    <div className="surface-page flex min-h-screen flex-col items-center justify-center px-4 py-12 text-slate-900 antialiased dark:text-slate-100 sm:px-6">
      <div className="surface-card w-full max-w-md p-8 sm:p-10 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-pine-600 transition hover:underline dark:text-pine-200"
          >
            &larr; Back to Home
          </Link>
          <BrandLogo iconSize="sm" showText={false} />
        </div>

        {/* Mode switcher tabs */}
        {!isForgot && (
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
        )}

        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {isForgot
              ? 'Reset your password'
              : isLogin
              ? 'Welcome back'
              : 'Join Smart Lib'}
          </h1>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {isForgot
              ? 'Enter your account email to receive a password reset link.'
              : isLogin
              ? 'Sign in to access your digital loans, study notes, and research desk.'
              : 'Create a student account to discover, borrow, and read library resources.'}
          </p>
        </div>

        {errorMsg ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            {errorMsg}
          </div>
        ) : null}

        {successMsg ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {successMsg}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === 'signup' && (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Full Name
              </span>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100"
                placeholder="Ada Lovelace"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Email Address
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100"
              placeholder="you@university.edu"
            />
          </label>

          {!isForgot && (
            <label className="block">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Password
                </span>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot')
                      setErrorMsg('')
                      setSuccessMsg('')
                    }}
                    className="text-xs font-medium text-pine-600 transition hover:underline dark:text-pine-300"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100"
                placeholder="••••••••"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-forest-900 py-3 text-sm font-semibold text-paper-100 shadow transition hover:bg-forest-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-paper-100 dark:text-forest-900 dark:hover:bg-paper-200"
          >
            {isSubmitting
              ? 'Processing...'
              : isForgot
              ? 'Send Reset Link'
              : isLogin
              ? 'Sign in'
              : 'Create student account'}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300 sm:flex-row">
          {isForgot ? (
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setErrorMsg('')
                setSuccessMsg('')
              }}
              className="font-semibold text-pine-600 hover:underline dark:text-pine-300"
            >
              &larr; Return to Sign in
            </button>
          ) : (
            <>
              <span>{isLogin ? "Don't have an account?" : 'Already registered?'}</span>
              <button
                type="button"
                onClick={() => {
                  setMode(isLogin ? 'signup' : 'login')
                  setErrorMsg('')
                  setSuccessMsg('')
                }}
                className="font-semibold text-pine-600 hover:underline dark:text-pine-300"
              >
                {isLogin ? 'Create account' : 'Sign in'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
