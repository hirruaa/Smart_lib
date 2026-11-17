'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import BrandLogo from '@/components/BrandLogo'
import { getSupabase } from '@/utils/supabase/client'

function getSafeDestination(value: string | null) {
  if (!value?.startsWith('/') || value.startsWith('//')) return '/dashboard'
  const destination = new URL(value, window.location.origin)
  return destination.origin === window.location.origin
    ? `${destination.pathname}${destination.search}${destination.hash}`
    : '/dashboard'
}

export default function AuthCallbackPage() {
  const [message, setMessage] = useState('Verifying your link...')
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true

    async function completeAuthentication() {
      try {
        const supabase = getSupabase()
        const query = new URLSearchParams(window.location.search)
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const authError = query.get('error_description') || query.get('error')
        if (authError) throw new Error(authError)

        const destination = getSafeDestination(query.get('next'))
        const tokenHash = query.get('token_hash') || hash.get('token_hash')
        const tokenType = query.get('type') || hash.get('type')
        const code = query.get('code')

        if (tokenHash) {
          if (tokenType !== 'invite' && tokenType !== 'signup') {
            throw new Error('This verification link is not a valid invitation. Please ask the library staff to send a new one.')
          }
          const { error: verificationError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: tokenType,
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
            throw new Error('The verification link is missing or has expired. Please ask the library staff to send a new invitation.')
          }
        }

        const { data, error: userError } = await supabase.auth.getUser()
        if (userError) throw userError
        if (!data.user) throw new Error('We could not verify this link. Please ask the library staff to send a new invitation.')

        if (active) {
          setMessage('Verification complete. Opening your account...')
          window.location.replace(destination)
        }
      } catch (verificationError) {
        if (!active) return
        setError(true)
        setMessage(verificationError instanceof Error
          ? verificationError.message
          : 'We could not verify this link. Please ask the library staff to send a new invitation.')
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
        <h1 className="mt-3 text-2xl font-bold">{error ? 'Verification problem' : 'Verifying your link'}</h1>
        <p role={error ? 'alert' : 'status'} className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
        {error
          ? <Link href="/login" className="mt-7 inline-flex rounded-xl bg-forest-900 px-5 py-3 text-sm font-semibold text-paper-100 dark:bg-paper-100 dark:text-forest-900">Return to sign in</Link>
          : <div className="mx-auto mt-6 h-2 w-24 animate-pulse rounded-full bg-pine-200 dark:bg-forest-700" />}
      </section>
    </main>
  )
}
