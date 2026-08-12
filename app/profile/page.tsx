'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<{ full_name?: string; email: string; role?: string } | null>(null)
  const [fullName, setFullName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const loadProfile = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (error || !user) {
        router.replace('/login')
        return
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, email, role')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) {
        setError(profileError.message)
      }

      if (profileData) {
        setProfile(profileData)
        setFullName(profileData.full_name ?? '')
      }
      setLoading(false)
    }

    loadProfile()
  }, [router])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)

    const supabase = createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      router.replace('/login')
      return
    }

    const { error: updateError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName || null,
      email: profile?.email,
      role: profile?.role ?? 'student',
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('Profile saved successfully.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent px-4 py-12 text-slate-900 antialiased dark:text-slate-100">
        <div className="mx-auto max-w-xl rounded-[2rem] border border-slate-200 bg-white/90 p-10 text-center shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Loading profile</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Please wait...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-transparent px-4 py-12 text-slate-900 antialiased dark:text-slate-100">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white/90 p-10 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">Your Profile</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Update your name and review your account role.</p>

        {error ? (
          <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
            {message}
          </div>
        ) : null}

        <form onSubmit={handleSave} className="mt-8 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Name</span>
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <div className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Email</span>
              <p className="mt-2 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{profile?.email}</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Role</span>
              <p className="mt-2 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{profile?.role}</p>
            </div>
            <div className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Status</span>
              <p className="mt-2 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Logged in</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="submit" className="inline-flex items-center justify-center rounded-3xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">
              Save profile
            </button>
            <button
              type="button"
              onClick={() => router.replace('/dashboard')}
              className="inline-flex items-center justify-center rounded-3xl border border-slate-200 bg-transparent px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600"
            >
              Back to Dashboard
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
