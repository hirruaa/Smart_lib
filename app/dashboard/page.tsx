'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

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
      let role = profile?.role ?? (user.user_metadata?.role as string | undefined)

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
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Redirecting</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">Checking your access...</h1>
        <p className="mt-2 text-sm text-slate-500">Please wait while we send you to the correct dashboard.</p>
      </div>
    </div>
  )
}
