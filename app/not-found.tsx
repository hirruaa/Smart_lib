import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="surface-page flex min-h-screen items-center justify-center px-6 py-16 text-slate-900 dark:text-slate-100">
      <section className="surface-card w-full max-w-xl p-8 text-center sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">404 · Page not found</p>
        <h1 className="mt-4 text-3xl font-bold">We couldn&apos;t find that page.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          The link may be outdated, or the page may have moved.
        </p>
        <Link href="/" className="mt-7 inline-flex rounded-xl bg-forest-700 px-5 py-3 font-semibold text-white hover:bg-forest-800">
          Return to Smart Lib
        </Link>
      </section>
    </main>
  )
}
