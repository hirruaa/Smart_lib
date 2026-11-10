'use client'

import { FormEvent, useEffect, useState } from 'react'
import { getSupabase } from '@/utils/supabase/client'
import BaseModal from './BaseModal'
import PasswordChangeForm from './PasswordChangeForm'

type ProfileModalProps = {
  open: boolean
  onClose: () => void
}
export default function ProfileModal({ open, onClose }: ProfileModalProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [course, setCourse] = useState('')
  const [studentYear, setStudentYear] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [courses, setCourses] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    let active = true
    const loadProfile = async () => {
      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, role, department, course, student_year')
        .eq('id', user.id)
        .maybeSingle()

      setEmail(data?.email ?? user.email ?? '')
      setRole(data?.role ?? 'student')
      setFullName(data?.full_name ?? '')
      setDepartment(data?.department ?? '')
      setCourse(data?.course ?? '')
      setStudentYear(data?.student_year ?? '')
      const [departmentChoices, courseChoices] = await Promise.all([
        data?.role === 'faculty'
          ? supabase.from('academic_departments').select('name').eq('is_active', true).order('name')
          : Promise.resolve({ data: [], error: null }),
        data?.role === 'student'
          ? supabase.from('academic_courses').select('name').eq('is_active', true).order('name')
          : Promise.resolve({ data: [], error: null }),
      ])
      if (!active) return
      setDepartments((departmentChoices.data ?? []).map((item) => item.name))
      setCourses((courseChoices.data ?? []).map((item) => item.name))
      setMessage(null)
      const choicesError = departmentChoices.error ?? courseChoices.error
      setError(choicesError ? `Academic choices are unavailable: ${choicesError.message}` : null)
    }

    void loadProfile()
    return () => { active = false }
  }, [open])

  if (!open) return null

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)

    const supabase = getSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Your session has expired. Please sign in again.')
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim() || null,
        department: role === 'faculty' ? department.trim() || null : null,
        course: role === 'student' ? course.trim() || null : null,
        student_year: role === 'student' ? studentYear.trim() || null : null,
      })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('Profile saved.')
    }
    setSaving(false)
  }

  const displayName = fullName.trim() || 'Library member'
  const initials = fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'SL'

  return (
    <BaseModal open={open} onClose={onClose} title="Your profile" eyebrow="Account" size="lg" className="base-modal--profile">
      <section className="profile-identity" aria-label="Profile identity">
        <div className="profile-avatar" aria-hidden="true">{initials}</div>
        <div className="profile-identity-copy">
          <span className="profile-role">{role || 'Member'}</span>
          <h3>{displayName}</h3>
          <p>{email}</p>
        </div>
      </section>

      {error ? <p role="alert" className="profile-modal-error">{error}</p> : null}
      {message ? <p role="status" className="profile-modal-success">{message}</p> : null}

      <form onSubmit={handleSave} className="profile-modal-form">
        <div className="profile-section-heading">
          <div><h3>Personal details</h3><p>Update your name and the academic details for your account.</p></div>
        </div>
        <div className="profile-field-grid">
          <label className="profile-field-wide"><span>Name</span><input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" /></label>
          {role === 'faculty' ? <label><span>Department</span><select required value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Select department</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
          {role === 'student' ? <>
            <label className="profile-field-wide"><span>Course</span><select required value={course} onChange={(event) => setCourse(event.target.value)}><option value="">Select course</option>{courses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>Year level</span><select required value={studentYear} onChange={(event) => setStudentYear(event.target.value)}><option value="">Select year</option>{['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
          </> : null}
        </div>
        <div className="profile-account-meta" aria-label="Account information">
          <div><span>Email address</span><p>{email || 'Not available'}</p></div>
        </div>
        <div className="profile-modal-actions">
          <button type="button" className="profile-modal-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="profile-modal-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>

      <section className="profile-security-section" aria-labelledby="profile-password-title">
        <div className="profile-section-heading">
          <div><h3 id="profile-password-title">Password &amp; security</h3><p>Choose a strong password and update it whenever needed.</p></div>
        </div>
        <PasswordChangeForm onSuccess={() => { setError(null); setMessage('Password updated successfully.') }} />
      </section>
    </BaseModal>
  )
}
