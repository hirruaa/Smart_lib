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
        .select('full_name, email, role')
        .eq('id', user.id)
        .maybeSingle()

      setEmail(data?.email ?? user.email ?? '')
      setRole(data?.role ?? 'student')
      setFullName(data?.full_name ?? '')
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
      .update({ full_name: fullName || null })
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
