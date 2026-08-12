'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    const doLogout = async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.replace('/login')
    }

    doLogout()
  }, [router])

  return (
    <div className="min-h-screen bg-transparent px-4 py-12 text-slate-900 antialiased dark:text-slate-100">
      <div className="mx-auto max-w-xl rounded-[2rem] border border-slate-200 bg-white/90 p-10 text-center shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Signing out</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Goodbye!</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">We are logging you out and redirecting you back to the login screen.</p>
      </div>
    </div>
  )
}
