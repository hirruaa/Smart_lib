'use client'

import { FormEvent, useEffect, useState } from 'react'
import BaseModal from '@/components/BaseModal'
import PasswordInput from '@/components/PasswordInput'
import { getSupabase } from '@/utils/supabase/client'
import { useUsernameAvailability } from '@/utils/useUsernameAvailability'

type Choice = { id: number; name: string }
type EnrollmentRole = 'student' | 'faculty'

const initialForm = {
  role: 'student' as EnrollmentRole,
  email: '',
  username: '',
  password: '',
  fullName: '',
  institutionalId: '',
  department: '',
  course: '',
  studentYear: '',
}

export default function StaffMemberEnrollmentModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (email: string, username: string) => void
}) {
  const [form, setForm] = useState(initialForm)
  const [departments, setDepartments] = useState<Choice[]>([])
  const [courses, setCourses] = useState<Choice[]>([])
  const [loadingChoices, setLoadingChoices] = useState(false)
  const [saving, setSaving] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [usernameSuggestions, setUsernameSuggestions] = useState<string[]>([])
  const [confirmationSent, setConfirmationSent] = useState<{ email: string; username: string; initialPassword: string } | null>(null)
  const { status: usernameAvailability, errorMessage: usernameAvailabilityError, retry: retryUsernameCheck } = useUsernameAvailability(form.username)

  useEffect(() => {
    if (!open) return
    let active = true
    const loadChoices = async () => {
      setLoadingChoices(true)
      setError('')
      const supabase = getSupabase()
      const [departmentResult, courseResult] = await Promise.all([
        supabase.from('academic_departments').select('id,name').eq('is_active', true).order('name'),
        supabase.from('academic_courses').select('id,name').eq('is_active', true).order('name'),
      ])
      if (!active) return
      const failure = departmentResult.error ?? courseResult.error
      if (failure) setError(`Unable to load current academic choices: ${failure.message}`)
      else {
        setDepartments((departmentResult.data ?? []) as Choice[])
        setCourses((courseResult.data ?? []) as Choice[])
      }
      setLoadingChoices(false)
    }
    void loadChoices()
    return () => { active = false }
  }, [open])

  const close = () => {
    if (saving) return
    setForm(initialForm)
    setVerified(false)
    setError('')
    setUsernameSuggestions([])
    setConfirmationSent(null)
    onClose()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!verified) {
      setError('Check the member’s physical school ID in person before sending an invitation.')
      return
    }
    setSaving(true)
    setError('')
    setUsernameSuggestions([])
    try {
      const response = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, identityVerified: verified }),
      })
      const data = await response.json()
      if (!response.ok) {
        setUsernameSuggestions(Array.isArray(data.suggestions)
          ? data.suggestions.filter((suggestion: unknown): suggestion is string => typeof suggestion === 'string')
          : [])
        throw new Error(data.error || 'Unable to send the account invitation.')
      }
      const confirmed = { email: String(data.email), username: String(data.username), initialPassword: form.password }
      setConfirmationSent(confirmed)
      setForm((current) => ({ ...current, password: '' }))
      onCreated(confirmed.email, confirmed.username)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send the confirmation email.')
    } finally {
      setSaving(false)
    }
  }

  return <BaseModal
    open={open}
    title={confirmationSent ? 'Confirmation email sent' : 'Create member account'}
    eyebrow="Staff-assisted enrollment"
    description={confirmationSent
      ? 'The member can sign in now. Opening the confirmation link verifies the email and takes them to password setup.'
      : 'Verify the member’s school ID in person and set a temporary password for the member.'}
    onClose={close}
    size="lg"
    layer="foreground"
  >
    {confirmationSent ? <div className="space-y-4">
      <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
        Confirmation email sent to <strong>{confirmationSent.email}</strong>. The member can sign in before or after confirming. Username: <strong>{confirmationSent.username}</strong>.
      </p>
      <p className="text-sm text-slate-600 dark:text-slate-300">Opening the email link verifies the address and lets the member choose a private password. Email confirmation is not required to sign in.</p>
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <p className="font-semibold">Initial password</p>
        <code className="mt-2 block select-all break-all rounded-lg bg-white p-3 font-mono text-base dark:bg-slate-950">{confirmationSent.initialPassword}</code>
        <p className="mt-2 text-xs">Keep this separate from the confirmation email. The member may sign in with it and will be asked to choose a private password.</p>
      </div>
      <button type="button" onClick={close} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-700">Done</button>
    </div> : <form onSubmit={(event) => void submit(event)} className="space-y-4">
      {error ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Member type
          <select required value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as EnrollmentRole, department: '', course: '', studentYear: '' }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
            <option value="student">Student</option>
            <option value="faculty">Faculty</option>
          </select>
        </label>
        <label className="text-sm font-medium">Full name
          <input required maxLength={120} value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
        </label>
        <label className="text-sm font-medium">Email
          <input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
        </label>
        <label className="text-sm font-medium">Username
          <input required minLength={3} maxLength={30} pattern="[a-z0-9][a-z0-9._-]{2,29}" autoComplete="off" value={form.username} onChange={(event) => { setUsernameSuggestions([]); setError((current) => /username/i.test(current) ? '' : current); setForm((current) => ({ ...current, username: event.target.value.toLowerCase() })) }} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
          <span aria-live="polite" className={`mt-1 block text-xs font-medium ${usernameAvailability === 'available' ? 'text-emerald-700 dark:text-emerald-300' : usernameAvailability === 'taken' || usernameAvailability === 'error' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500'}`}>
            {usernameAvailability === 'checking' ? 'Checking availability…' : usernameAvailability === 'available' ? '✓ Username available' : usernameAvailability === 'taken' ? '✕ Username already taken' : usernameAvailability === 'error' ? usernameAvailabilityError : null}
          </span>
          {usernameAvailability === 'error' ? <button type="button" onClick={retryUsernameCheck} className="mt-1 text-xs font-semibold text-pine-700 underline dark:text-pine-200">Check again</button> : null}
          {usernameSuggestions.length > 0 ? <span className="mt-2 block text-xs text-slate-600 dark:text-slate-300">Available options: {usernameSuggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setForm((current) => ({ ...current, username: suggestion })); setUsernameSuggestions([]); setError('') }} className="ml-1 rounded-md border border-slate-300 px-2 py-1 font-semibold text-pine-700 hover:bg-slate-100 dark:border-slate-600 dark:text-pine-200 dark:hover:bg-slate-800">{suggestion}</button>)}</span> : null}
        </label>
        <label className="text-sm font-medium">Initial password
          <PasswordInput required minLength={8} maxLength={124} autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
          <span className="mt-1 block text-xs text-slate-500">Use 8–124 characters. The member will be asked to change it at first sign-in.</span>
        </label>
        <label className="text-sm font-medium">Institutional ID
          <input required inputMode="numeric" pattern="[0-9]{5,8}" maxLength={8} value={form.institutionalId} onChange={(event) => setForm((current) => ({ ...current, institutionalId: event.target.value.replace(/\D/g, '').slice(0, 8) }))} placeholder="5–8 digits" className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
          <span className="mt-1 block text-xs text-slate-500">Enter 5–8 digits only.</span>
        </label>
        {form.role === 'faculty' ? <label className="text-sm font-medium">Faculty / department
          <select required value={form.department} onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))} disabled={loadingChoices} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
            <option value="">{loadingChoices ? 'Loading choices…' : 'Select faculty'}</option>
            {departments.map((choice) => <option key={choice.id} value={choice.name}>{choice.name}</option>)}
          </select>
        </label> : <>
          <label className="text-sm font-medium">Course / program
            <select required value={form.course} onChange={(event) => setForm((current) => ({ ...current, course: event.target.value }))} disabled={loadingChoices} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
              <option value="">{loadingChoices ? 'Loading choices…' : 'Select program'}</option>
              {courses.map((choice) => <option key={choice.id} value={choice.name}>{choice.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Year level
            <select required value={form.studentYear} onChange={(event) => setForm((current) => ({ ...current, studentYear: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
              <option value="">Select year</option>
              {['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].map((year) => <option key={year}>{year}</option>)}
            </select>
          </label>
        </>}
      </div>
      <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <input required type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="mt-0.5" />
        <span>I checked the member’s physical school ID in person and matched it to the person. The system records this attestation, not an ID photo.</span>
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} onClick={close} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700">Cancel</button>
        <button type="submit" disabled={saving || loadingChoices || usernameAvailability !== 'available'} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-700">{saving ? 'Sending confirmation…' : 'Verify & send confirmation'}</button>
      </div>
    </form>}
  </BaseModal>
}
