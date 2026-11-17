'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import BrandLogo from '@/components/BrandLogo'
import { getSupabase } from '@/utils/supabase/client'

function getSafeDestination(value: string | null) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/dashboard'
}

export default function ConfirmAuthPage() {
  const [message, setMessage] = useState('Checking your invitation link...')
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true

    async function completeAuthentication() {
      try {
        const supabase = getSupabase()
        const query = new URLSearchParams(window.location.search)
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const destination = getSafeDestination(query.get('next'))
        const tokenHash = query.get('token_hash') || hash.get('token_hash')
        const tokenType = query.get('type') || hash.get('type')
        const code = query.get('code')

        if (tokenHash) {
          if (tokenType !== 'invite') {
            throw new Error('This link is not a valid account invitation. Please ask the library staff to send a new invitation.')
          }
          const { error: verificationError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'invite',
          })
          if (verificationError) throw verificationError
        } else if (code) {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError
          if (!session) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            if (exchangeError) throw exchangeError
          }
        } else {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError
          if (!session) {
            throw new Error('The invitation link is missing or has expired. Please ask the library staff to send a new invitation.')
          }
        }

        const { data, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!data.user) {
          throw new Error('We could not verify this invitation. Please ask the library staff to send a new one.')
        }

        if (active) {
          setMessage('Invitation verified. Opening your account setup...')
          window.location.replace(destination)
        }
      } catch (verificationError) {
        if (!active) return
        setError(true)
        setMessage(verificationError instanceof Error
          ? verificationError.message
          : 'We could not verify this invitation. Please ask the library staff to send a new one.')
      }
    }

    void completeAuthentication()
    return () => { active = false }
  }, [])

  return (
    <main className="surface-page flex min-h-screen items-center justify-center px-4 py-12 text-slate-900 dark:text-slate-100">
      <section className="surface-card w-full max-w-md p-8 text-center shadow-2xl sm:p-10">
        <div className="mb-6 flex justify-center"><BrandLogo iconSize="sm" showText={false} /></div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Mary the Queen College</p>
        <h1 className="mt-3 text-2xl font-bold">{error ? 'Invitation verification problem' : 'Verifying your invitation'}</h1>
        <p role={error ? 'alert' : 'status'} className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
        {error ? <Link href="/login" className="mt-7 inline-flex rounded-xl bg-forest-900 px-5 py-3 text-sm font-semibold text-paper-100 dark:bg-paper-100 dark:text-forest-900">Return to sign in</Link> : <div className="mx-auto mt-6 h-2 w-24 animate-pulse rounded-full bg-pine-200 dark:bg-forest-700" />}
      </section>
    </main>
  )
}
