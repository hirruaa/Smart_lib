'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import BrandLogo from '@/components/BrandLogo'
import { Skeleton } from '@/components/skeletons'

function normalizeRole(value: unknown): 'admin' | 'student' | 'faculty' | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'admin' || raw === 'administrator') return 'admin'
  if (raw === 'student' || raw === 'learner') return 'student'
  if (raw === 'faculty') return 'faculty'
  return null
}

export default function DashboardPage() {
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()
    let active = true

    async function checkAuth() {
      try {
        const { data: { user }, error: authLookupError } = await supabase.auth.getUser()
        if (authLookupError) throw authLookupError
        if (!user) {
          router.replace('/login')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        if (profileError) throw profileError

        const role = normalizeRole(profile?.role)
        if (!role) {
          setAuthError('Unable to determine your account role. Please contact the administrator or try signing in again.')
          return
        }

        const section = window.location.hash
        const dashboardPath = role === 'admin' ? '/dashboard/admin' : role === 'faculty' ? '/dashboard/faculty' : '/dashboard/student'
        router.replace(`${dashboardPath}${section}`)
      } catch (error) {
        if (active) {
          setAuthError(error instanceof Error
            ? `Unable to load your account. Please try again. (${error.message})`
            : 'Unable to load your account. Please try again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void checkAuth()
    return () => { active = false }
  }, [router])

  return (
    authError
      ? <main className="surface-page min-h-screen p-6"><section role="alert" className="surface-card mx-auto max-w-xl p-8 text-sm text-rose-700 dark:text-rose-300"><p>{authError}</p><button type="button" onClick={() => window.location.reload()} className="pine-action mt-5 rounded-xl px-4 py-2.5 font-semibold">Try again</button></section></main>
      : loading
        ? <main aria-label="Loading your workspace" className="surface-page flex min-h-screen items-center justify-center p-6 animate-in fade-in duration-300"><div className="surface-card w-full max-w-sm p-8 text-center space-y-4"><div className="mx-auto flex justify-center"><BrandLogo iconSize="sm" /></div><div className="space-y-2 pt-2"><Skeleton variant="text" className="w-1/2 mx-auto h-4" /><Skeleton variant="text" className="w-3/4 mx-auto h-3" /></div></div></main>
        : null
  )
}
