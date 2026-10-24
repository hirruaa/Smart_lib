'use client'

import { FormEvent, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase } from '@/utils/supabase/client'
import BaseModal from './BaseModal'

type ProfileModalProps = {
  open: boolean
  onClose: () => void
}
type ActivityEvent = { id: number; occurred_at: string; event_type: string; summary: string; actor_role: string; receipt_number: string | null }

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
  const [courses, setCourses] = useState<string[]>([])
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    let activityChannel: RealtimeChannel | null = null
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
      const { data: courseChoices } = await supabase.from('academic_courses').select('name').eq('is_active', true).order('name')
      const loadActivity = async () => {
        const { data: activityRows, error: ledgerError } = await supabase.from('member_activity_ledger')
          .select('id,occurred_at,event_type,summary,actor_role,receipt_number')
          .eq('member_id', user.id).order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(50)
        if (!active) return
        setActivity((activityRows ?? []) as ActivityEvent[])
        setActivityError(ledgerError ? `Activity history is unavailable: ${ledgerError.message}` : null)
      }
      if (!active) return
      setCourses((courseChoices ?? []).map((item) => item.name))
      setMessage(null)
      setError(null)
      await loadActivity()
      activityChannel = supabase.channel(`member-ledger-${user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'member_activity_ledger', filter: `member_id=eq.${user.id}` }, () => void loadActivity())
        .subscribe()
    }

    void loadProfile()
    return () => { active = false; if (activityChannel) void getSupabase().removeChannel(activityChannel) }
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
        school: role === 'student' ? 'Mary the Queen College of Quezon City' : school.trim() || null,
        department: role === 'faculty' ? department.trim() || null : null,
        course: role === 'student' ? course.trim() || null : course.trim() || null,
        student_year: role === 'student' ? studentYear.trim() || null : studentYear.trim() || null,
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
          {role === 'student' ? <label><span>College / school</span><select required value="Mary the Queen College of Quezon City" disabled><option>Mary the Queen College of Quezon City</option></select></label> : <label><span>School</span><input maxLength={120} value={school} onChange={(event) => setSchool(event.target.value)} placeholder="School or college" /></label>}
          {role === 'faculty' ? <label><span>Faculty</span><select required value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">Select faculty</option><option value="IT Department">IT Department</option><option value="Courses Department">Courses Department</option></select></label> : null}
          {role === 'student' ? <>
            <label><span>Course</span><select required value={course} onChange={(event) => setCourse(event.target.value)}><option value="">Select course</option>{courses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>Year level</span><select required value={studentYear} onChange={(event) => setStudentYear(event.target.value)}><option value="">Select year</option>{['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'].map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
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
        <section className="profile-activity-ledger" aria-labelledby="profile-activity-title">
          <div><h3 id="profile-activity-title">Account activity</h3><p>Read-only history of library requests, decisions, charges, payments, and points.</p></div>
          {activityError ? <p role="alert" className="profile-modal-error">{activityError}</p> : activity.length === 0 ? <p className="profile-activity-empty">No recorded account activity yet.</p> : <ol>{activity.map((event) => <li key={event.id}><time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time><p>{event.summary}</p><span>{event.actor_role === 'historical' ? 'Existing record' : event.actor_role === 'system' ? 'System' : `${event.actor_role} action`}</span>{event.receipt_number ? <code>{event.receipt_number}</code> : null}</li>)}</ol>}
        </section>
    </BaseModal>
  )
}
