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
  const [role, setRole] = useState<'student' | 'admin'>('student')
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
        options: {
          data: { role },
        },
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
    <div className="min-h-screen bg-transparent px-4 py-12 text-slate-900 antialiased dark:text-slate-100">
      <div className="mx-auto max-w-md rounded-[2rem] border border-slate-200 bg-white/95 p-8 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-slate-950/40 sm:p-10">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Smart Lib</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {isLogin ? 'Sign in to your account' : 'Create your Smart Lib account'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {isLogin
              ? 'Secure access to your personalized dashboard with role-based experience.'
              : 'Register for a student or admin account and manage library borrowing from your dashboard.'}
          </p>
        </div>

        {errorMsg ? (
          <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
            {errorMsg}
          </div>
        ) : null}

        {successMsg ? (
          <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
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
              className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
              className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              placeholder="Enter your password"
            />
          </label>

          {!isLogin && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as 'student' | 'admin')}
                className="mt-2 w-full cursor-pointer rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="student">Student</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            {isSubmitting ? 'Working...' : isLogin ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-3 text-sm text-slate-600 dark:text-slate-300 sm:flex-row sm:justify-between">
          <p>{isLogin ? "Don't have an account?" : 'Already have an account?'}</p>
          <Link
            href={isLogin ? '/register' : '/login'}
            className="font-semibold text-sky-600 transition hover:text-sky-700"
          >
            {isLogin ? 'Create account' : 'Sign in'}
          </Link>
        </div>
      </div>
    </div>
  )
}
