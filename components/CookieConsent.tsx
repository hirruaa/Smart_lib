'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const consentCookie = 'smart-lib-cookie-consent'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(!document.cookie.split('; ').some((cookie) => cookie.startsWith(`${consentCookie}=`)))
  }, [])

  const choose = (value: 'accepted' | 'necessary') => {
    document.cookie = `${consentCookie}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`
    setVisible(false)
  }

  if (!visible) return null

  return (
    <aside className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" role="dialog" aria-label="Cookie consent">
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">Your privacy matters</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Smart Lib uses necessary cookies for sign-in, security, and preferences. Read our <Link href="/privacy" className="text-sky-600 underline dark:text-sky-300">Privacy Policy</Link> and <Link href="/cookies" className="text-sky-600 underline dark:text-sky-300">Cookie Notice</Link> for details.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => choose('accepted')} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400">Accept</button>
        <button type="button" onClick={() => choose('necessary')} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-sky-400 dark:border-slate-600 dark:text-slate-200">Necessary only</button>
      </div>
    </aside>
  )
}
