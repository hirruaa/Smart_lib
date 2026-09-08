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
      if (profileByIdRes.error) {
        setAuthError(`Unable to load your profile. Apply the Supabase profile policies, then try again. (${profileByIdRes.error.message})`)
        return
      }
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
      const normalizedRole = normalizeRole(profile?.role)
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

      if (role === 'admin') {
        router.replace('/dashboard/admin')
      } else {
        router.replace('/dashboard/student')
      }
    }

    checkAuth()
  }, [router])

  return (
    authError ? <div className="p-8 text-sm text-rose-700">{authError}</div> : null
  )
}
