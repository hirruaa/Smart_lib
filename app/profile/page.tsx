'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/utils/supabase/client'
import { Skeleton } from '@/components/skeletons'

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<{ full_name?: string; email: string; role?: string } | null>(null)
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('')
  const [department, setDepartment] = useState('')
  const [course, setCourse] = useState('')
  const [studentYear, setStudentYear] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()

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
        .select('full_name, email, role, school, department, course, student_year')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) {
        setError(profileError.message)
      }

      if (profileData) {
        setProfile(profileData)
        setFullName(profileData.full_name ?? '')
        setSchool(profileData.school ?? '')
        setDepartment(profileData.department ?? '')
        setCourse(profileData.course ?? '')
        setStudentYear(profileData.student_year ?? '')
      }
      setLoading(false)
    }

    loadProfile()
  }, [router])

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)

    const supabase = getSupabase()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      router.replace('/login')
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        school: school.trim() || null,
        department: department.trim() || null,
        course: course.trim() || null,
        student_year: studentYear.trim() || null,
      })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('Profile saved successfully.')
    }
  }

  if (loading) {
    return (
      <div className="surface-page min-h-screen px-4 py-12 text-slate-900 antialiased dark:text-slate-100 animate-in fade-in duration-300" role="status" aria-label="Loading your profile">
        <div className="surface-card mx-auto max-w-3xl p-8 sm:p-10 space-y-6">
          <Skeleton variant="text" className="w-48 h-8" />
          <Skeleton variant="text" className="w-72 h-4" />
          <div className="grid gap-6 sm:grid-cols-2 pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton variant="text" className="w-20 h-3.5" />
                <Skeleton variant="rounded" className="h-11 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="surface-page min-h-screen px-4 py-12 text-slate-900 antialiased dark:text-slate-100">
      <div className="surface-card mx-auto max-w-3xl p-8 sm:p-10">
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
                className="workspace-input mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">School</span>
              <input value={school} maxLength={120} onChange={(event) => setSchool(event.target.value)} className="workspace-input mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none" placeholder="School or college" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Department</span>
              <input value={department} maxLength={120} onChange={(event) => setDepartment(event.target.value)} className="workspace-input mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none" placeholder="Department" />
            </label>
            {profile?.role === 'student' ? <>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Course / program</span>
                <input value={course} maxLength={120} onChange={(event) => setCourse(event.target.value)} className="workspace-input mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none" placeholder="Course or program" />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Year level</span>
                <input value={studentYear} maxLength={40} onChange={(event) => setStudentYear(event.target.value)} className="workspace-input mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none" placeholder="e.g. 2nd year" />
              </label>
            </> : null}
            <div className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Email</span>
              <p className="workspace-value mt-2 rounded-xl border px-4 py-3 text-sm">{profile?.email}</p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Role</span>
              <p className="workspace-value mt-2 rounded-xl border px-4 py-3 text-sm">{profile?.role}</p>
            </div>
            <div className="block">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Status</span>
              <p className="workspace-value mt-2 rounded-xl border px-4 py-3 text-sm">Logged in</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="submit" className="pine-action inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold">
              Save profile
            </button>
            <button
              type="button"
              onClick={() => router.replace('/dashboard')}
              className="secondary-action inline-flex items-center justify-center rounded-xl border px-6 py-3 text-sm font-semibold"
            >
              Back to Dashboard
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
