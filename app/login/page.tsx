'use client'

import { FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'student' | 'admin'>('student')
  const [isSignUp, setIsSignUp] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    const supabase = createClient()
    const result = isSignUp
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { role },
          },
        })
      : await supabase.auth.signInWithPassword({
          email,
          password,
        })

    if (result.error) {
      setErrorMsg(result.error.message)
      return
    }

    if (isSignUp) {
      if (result.data?.user) {
        await supabase.from('profiles').upsert({
          id: result.data.user.id,
          email,
          role,
        })
      }

      setSuccessMsg('Sign-up successful. Please confirm your email before logging in if required.')
      return
    }

    let sessionResult = await supabase.auth.getSession()
    let waited = 0
    while ((!sessionResult.data?.session || !sessionResult.data.session.user) && waited < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      waited += 200
      sessionResult = await supabase.auth.getSession()
    }

    if (sessionResult.error || !sessionResult.data?.session?.user) {
      setErrorMsg('Sign-in succeeded, but we were unable to establish your session. Please try again.')
      return
    }

    setSuccessMsg('Sign-in successful. Redirecting...')
    await router.replace('/dashboard')
  }

  return (
    <div className="min-h-screen bg-transparent px-4 py-10 sm:px-6 lg:px-8 dark:bg-transparent">
      <div className="mx-auto w-full max-w-md rounded-[2rem] border border-slate-200 bg-white/95 p-8 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-slate-950/40 sm:p-10">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Smart Lib</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {isSignUp ? 'Create an account' : 'Sign in to your account'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Secure access to your personalized dashboard with role-based experience.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {errorMsg ? (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMsg}
            </div>
          ) : null}
          {successMsg ? (
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMsg}
            </div>
          ) : null}

          <form onSubmit={handleAuth} className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                placeholder="Enter your password"
              />
            </label>

            {isSignUp && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Role</span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value as 'student' | 'admin')}
                  className="mt-2 w-full cursor-pointer rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
                >
                  <option value="student">Student</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isPending ? 'Working...' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className="flex items-center justify-between gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p>{isSignUp ? 'Already have an account?' : "Don't have an account?"}</p>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setErrorMsg('')
                setSuccessMsg('')
              }}
              className="font-semibold text-sky-600 transition hover:text-sky-700"
            >
              {isSignUp ? 'Sign in' : 'Create an account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

