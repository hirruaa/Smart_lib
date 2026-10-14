'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import { getSupabase } from '@/utils/supabase/client'
import BrandLogo from '@/components/BrandLogo'
import PasswordInput from '@/components/PasswordInput'

type AuthMode = 'login' | 'signup' | 'forgot'
type MemberType = 'student' | 'faculty'
type AcademicDepartment = { id: number; name: string }

function getAuthOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')
  if (configuredOrigin) return configuredOrigin
  return typeof window !== 'undefined' ? window.location.origin : ''
}

interface AuthFormProps {
  defaultMode: 'login' | 'signup'
}

export default function AuthForm({ defaultMode }: AuthFormProps) {
  const router = useRouter()
  const [mode, setMode] = useState<AuthMode>(defaultMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [memberType, setMemberType] = useState<MemberType>('student')
  const [department, setDepartment] = useState('')
  const [departments, setDepartments] = useState<AcademicDepartment[]>([])
  const [departmentError, setDepartmentError] = useState<string | null>(null)
  const [departmentsLoading, setDepartmentsLoading] = useState(false)
  const [course, setCourse] = useState('')
  const [studentYear, setStudentYear] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  useEffect(() => {
    if (mode !== 'signup') return
    let active = true
    setDepartmentsLoading(true)

    void (async () => {
      try {
        const { data, error } = await getSupabase()
          .from('academic_departments')
          .select('id, name')
          .order('name')
        if (!active) return
        if (error) {
          setDepartmentError('Department choices are unavailable. Please contact the library administrator.')
          return
        }
        setDepartments(data ?? [])
        setDepartmentError(null)
      } catch (error) {
        if (active) {
          setDepartmentError(error instanceof Error
            ? `Department choices are unavailable. ${error.message}`
            : 'Department choices are unavailable. Please contact the library administrator.')
        }
      } finally {
        if (active) setDepartmentsLoading(false)
      }
    })()

    return () => { active = false }
  }, [mode])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')
    setIsSubmitting(true)

    const supabase = getSupabase()

    try {
      if (mode === 'signup') {
        if (memberType === 'faculty' && !department) {
          setErrorMsg('Select your department to create a faculty account.')
          return
        }
        if (memberType === 'faculty' && (departmentError || departments.length === 0)) {
          setErrorMsg(departmentError ?? 'Faculty registration is not available until the administrator adds departments.')
          return
        }
        const origin = getAuthOrigin()
        const result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              member_type: memberType,
              first_name: firstName.trim() || undefined,
              middle_name: middleName.trim() || undefined,
              last_name: lastName.trim() || undefined,
              full_name: [firstName, middleName, lastName].map((value) => value.trim()).filter(Boolean).join(' ') || undefined,
              department: memberType === 'faculty' ? department || undefined : undefined,
              course: memberType === 'student' ? course.trim() || undefined : undefined,
              student_year: memberType === 'student' ? studentYear.trim() || undefined : undefined,
            },
            emailRedirectTo: `${origin}/auth/callback?next=/verify-email`,
          },
        })

        if (result.error) {
          setErrorMsg(result.error.message)
        } else {
          if (result.data.user && !result.data.session) {
            setAwaitingConfirmation(true)
            setSuccessMsg('We sent a confirmation link to your email. Open it to activate your account.')
          } else {
            setSuccessMsg('Account registered successfully! You can sign in now.')
          }
        }
      } else if (mode === 'forgot') {
        const origin = getAuthOrigin()
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
          const requestedPath = new URLSearchParams(window.location.search).get('next')
          const parsedNext = requestedPath ? new URL(requestedPath, window.location.origin) : null
          const nextPath = parsedNext?.origin === window.location.origin
            ? `${parsedNext.pathname}${parsedNext.search}${parsedNext.hash}`
            : '/dashboard'
          router.replace(nextPath)
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'An unexpected error occurred during authentication.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resendConfirmation = async () => {
    setErrorMsg('')
    setSuccessMsg('')
    setIsSubmitting(true)
    try {
      const result = await getSupabase().auth.resend({ type: 'signup', email })
      if (result.error) setErrorMsg(result.error.message)
      else setSuccessMsg('A new confirmation link was sent. Please check your inbox.')
    } catch (error: any) {
      setErrorMsg(error?.message || 'Unable to resend the confirmation email.')
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
          {isForgot ? <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">Enter your account email to receive a password reset link.</p> : null}
        </div>

        {errorMsg ? (
          <div role="alert" aria-live="assertive" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            {errorMsg}
          </div>
        ) : null}

        {successMsg ? (
          <div role="status" aria-live="polite" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {successMsg}
          </div>
        ) : null}

        {awaitingConfirmation ? <div className="mt-6 space-y-4">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">Check your inbox for the confirmation link sent to <strong>{email}</strong>. Open the link to activate your account.</p>
          <button type="button" disabled={isSubmitting} onClick={() => void resendConfirmation()} className="w-full rounded-xl bg-forest-900 py-3 text-sm font-semibold text-paper-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-paper-100 dark:text-forest-900">{isSubmitting ? 'Sending...' : 'Resend confirmation email'}</button>
          <Link href="/login" className="block text-center text-sm font-semibold text-pine-700 hover:underline dark:text-pine-200">Return to sign in</Link>
        </div> : <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === 'signup' && (
            <>
              <fieldset>
                <legend className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">I am joining as</legend>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {(['student', 'faculty'] as const).map((type) => (
                    <label key={type} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${memberType === type ? 'border-pine-600 bg-pine-50 text-pine-900 dark:border-pine-300 dark:bg-forest-800 dark:text-paper-100' : 'border-paper-300 text-slate-700 dark:border-forest-700 dark:text-slate-200'} ${type === 'faculty' && departments.length === 0 ? 'opacity-60' : ''}`}>
                      <input
                        type="radio"
                        name="memberType"
                        value={type}
                        checked={memberType === type}
                        onChange={() => {
                          setMemberType(type)
                          setDepartment('')
                          if (type === 'faculty') {
                            // Do not retain student-only values when changing roles.
                            setCourse('')
                            setStudentYear('')
                          }
                        }}
                        disabled={type === 'faculty' && (departmentsLoading || Boolean(departmentError) || departments.length === 0)}
                        className="accent-pine-700"
                      />
                      {type === 'student' ? 'Student' : 'Faculty member'}
                    </label>
                  ))}
                </div>
                {departmentsLoading ? <p role="status" className="mt-2 text-xs text-slate-500 dark:text-slate-400">Loading department choices...</p> : null}
                {departmentError ? <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-300">{departmentError}</p> : null}
                {!departmentsLoading && !departmentError && departments.length === 0 ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Faculty sign-up opens after the administrator adds department choices.</p> : null}
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">First name *</span><input required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100" placeholder="First name" /></label>
                <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">Middle name</span><input maxLength={80} value={middleName} onChange={(event) => setMiddleName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100" placeholder="Middle name" /></label>
                <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">Last name *</span><input required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-pine-500 focus:ring-2 focus:ring-pine-500/20 dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100" placeholder="Last name" /></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {memberType === 'faculty' ? <label className="block"><span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">Department *</span><select required value={department} onChange={(event) => setDepartment(event.target.value)} className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100"><option value="">Select a department</option>{departments.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label> : null}
                {memberType === 'student' ? <>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">Course / program</span>
                    <input maxLength={120} value={course} onChange={(event) => setCourse(event.target.value)} className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100" placeholder="Course or program" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">Year level</span>
                    <input maxLength={40} value={studentYear} onChange={(event) => setStudentYear(event.target.value)} className="mt-1.5 w-full rounded-xl border border-paper-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none dark:border-forest-700 dark:bg-forest-950 dark:text-slate-100" placeholder="e.g. 2nd year" />
                  </label>
                </> : null}
              </div>
            </>
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
              <PasswordInput
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
              : `Create ${memberType} account`}
          </button>
        </form>}

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
