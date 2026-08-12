'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

function normalizeRole(value: unknown): 'admin' | 'student' | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'admin' || raw === 'administrator') return 'admin'
  if (raw === 'student' || raw === 'learner') return 'student'
  return null
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function checkAuth() {
      let {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (!user) {
        const sessionResult = await supabase.auth.getSession()
        if (sessionResult.error || !sessionResult.data.session?.user) {
          router.replace('/login')
          return
        }
        user = sessionResult.data.session.user
      }

      if (error) {
        router.replace('/login')
        return
      }

      const profileByIdRes = await supabase
        .from('profiles')
        .select('role, email, full_name')
        .eq('id', user.id)
        .maybeSingle()
      const profileById = (profileByIdRes as any).data as { role?: string; email?: string; full_name?: string } | null

      const profileByEmail =
        !profileById && user.email
          ? ((await supabase
              .from('profiles')
              .select('role, email, full_name')
              .eq('email', user.email)
              .maybeSingle()) as any).data as { role?: string; email?: string; full_name?: string } | null
          : null

      const profile = profileById ?? profileByEmail
      const normalizedRole = normalizeRole(profile?.role ?? user.user_metadata?.role)
      let role = normalizedRole

      if (!role && user.email) {
        if (user.email === 'admin@test.com') {
          role = 'admin'
        } else if (user.email === 'student@test.com') {
          role = 'student'
        }
      }

      if (!role) {
        setAuthError('Unable to determine your role. Please contact the administrator or use the app signup flow.')
        return
      }

      if (profile && normalizeRole(profile.role) !== role) {
        await supabase.from('profiles').upsert({
          id: user.id,
          role,
          email: user.email,
          full_name: user.user_metadata?.full_name ?? profile.full_name ?? '',
        })
      }

      if (!profile) {
        await supabase.from('profiles').upsert({
          id: user.id,
          role,
          email: user.email,
          full_name: user.user_metadata?.full_name ?? '',
        })
      }

      if (role === 'admin') {
        router.replace('/dashboard/admin')
      } else {
        router.replace('/dashboard/student')
      }
    }

    checkAuth().finally(() => setLoading(false))
  }, [router])

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white/80 p-10 text-center shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Redirecting</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-slate-100">Checking your access...</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">Please wait while we send you to the correct dashboard.</p>
        {authError ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
            {authError}
          </div>
        ) : null}
      </div>
    </div>
  )
}
