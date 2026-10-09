'use client'

import { FormEvent, useEffect, useState } from 'react'
import { getSupabase } from '@/utils/supabase/client'
import BaseModal from './BaseModal'

type ProfileModalProps = {
  open: boolean
  onClose: () => void
}

export default function ProfileModal({ open, onClose }: ProfileModalProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [fullName, setFullName] = useState('')
  const [school, setSchool] = useState('')
  const [department, setDepartment] = useState('')
  const [course, setCourse] = useState('')
  const [studentYear, setStudentYear] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return

    const loadProfile = async () => {
      const supabase = getSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, role, school, department, course, student_year')
        .eq('id', user.id)
        .maybeSingle()

      setEmail(data?.email ?? user.email ?? '')
      setRole(data?.role ?? 'student')
      setFullName(data?.full_name ?? '')
      setSchool(data?.school ?? '')
      setDepartment(data?.department ?? '')
      setCourse(data?.course ?? '')
      setStudentYear(data?.student_year ?? '')
      setMessage(null)
      setError(null)
    }

    loadProfile()
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
        school: school.trim() || null,
        department: department.trim() || null,
        course: course.trim() || null,
        student_year: studentYear.trim() || null,
      })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
    } else {
      setMessage('Profile saved.')
    }
    setSaving(false)
  }

  return (
    <BaseModal open={open} onClose={onClose} title="Your profile" eyebrow="Account" size="sm">
        {error ? <p className="profile-modal-error">{error}</p> : null}
        {message ? <p className="profile-modal-success">{message}</p> : null}

        <form onSubmit={handleSave} className="profile-modal-form">
          <label><span>Name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" /></label>
          <label><span>School</span><input maxLength={120} value={school} onChange={(event) => setSchool(event.target.value)} placeholder="School or college" /></label>
          <label><span>Department</span><input maxLength={120} value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Department" /></label>
          {role === 'student' ? <>
            <label><span>Course / program</span><input maxLength={120} value={course} onChange={(event) => setCourse(event.target.value)} placeholder="Course or program" /></label>
            <label><span>Year level</span><input maxLength={40} value={studentYear} onChange={(event) => setStudentYear(event.target.value)} placeholder="e.g. 2nd year" /></label>
          </> : null}
          <div className="profile-modal-grid">
            <div><span>Email</span><p>{email}</p></div>
            <div><span>Role</span><p className="capitalize">{role}</p></div>
          </div>
          <div className="profile-modal-actions">
            <button type="button" className="profile-modal-secondary" onClick={onClose}>Close</button>
            <button type="submit" className="profile-modal-primary" disabled={saving}>Save changes</button>
          </div>
        </form>
    </BaseModal>
  )
}
