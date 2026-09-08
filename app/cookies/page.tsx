import Link from 'next/link'

export const metadata = { title: 'Cookie Notice | Smart Lib' }

export default function CookiesPage() {
  return (
    <main className="surface-page min-h-screen px-6 py-16 text-slate-900 dark:text-slate-100">
      <article className="surface-card mx-auto max-w-3xl p-8 sm:p-12">
        <Link href="/" className="text-sm font-semibold text-sky-600 dark:text-sky-300">Back to Smart Lib</Link>
        <h1 className="mt-8 text-4xl font-bold">Cookie Notice</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: September 8, 2026</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">What we use</h2><p className="mt-2">Smart Lib uses cookies and browser storage to keep authentication sessions working, protect accounts, remember display preferences, and record your cookie-consent choice.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Necessary cookies</h2><p className="mt-2">These cookies are required for sign-in, session security, and core navigation. They cannot be disabled through the service because the application would not work correctly without them.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Optional cookies</h2><p className="mt-2">The current Smart Lib implementation does not use advertising or third-party analytics cookies. If that changes, this notice and the consent controls will be updated before those cookies are enabled.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Managing cookies</h2><p className="mt-2">You can delete cookies through your browser settings. Deleting necessary cookies may sign you out or prevent parts of Smart Lib from working.</p></section>
        </div>
      </article>
    </main>
  )
}
