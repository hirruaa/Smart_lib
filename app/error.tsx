'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application route error:', error)
  }, [error])

  return (
    <main className="surface-page flex min-h-screen items-center justify-center px-6 py-16 text-slate-900 dark:text-slate-100">
      <section className="surface-card w-full max-w-xl p-8 text-center sm:p-12" role="alert">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Something went wrong</p>
        <h1 className="mt-4 text-3xl font-bold">This page couldn&apos;t be loaded.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Please try again. If the problem continues, contact your library administrator.
        </p>
        {error.digest && <p className="mt-3 text-xs text-slate-500">Reference: {error.digest}</p>}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => reset()} className="rounded-xl bg-forest-700 px-5 py-3 font-semibold text-white hover:bg-forest-800">
            Try again
          </button>
          <Link href="/" className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:border-forest-700 dark:border-slate-600 dark:text-slate-200">
            Go to home
          </Link>
        </div>
      </section>
    </main>
  )
}
