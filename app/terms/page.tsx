import Link from 'next/link'

export const metadata = { title: 'Terms of Service | Smart Lib' }

export default function TermsPage() {
  return (
    <main className="surface-page min-h-screen px-6 py-16 text-slate-900 dark:text-slate-100">
      <article className="surface-card mx-auto max-w-3xl p-8 sm:p-12">
        <Link href="/" className="text-sm font-semibold text-sky-600 dark:text-sky-300">Back to Smart Lib</Link>
        <h1 className="mt-8 text-4xl font-bold">Terms of Service</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: September 8, 2026</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Using Smart Lib</h2><p className="mt-2">Smart Lib provides authenticated users with access to digital library resources, research discovery tools, study tools, and borrowing services. Use the service only for lawful academic and educational purposes.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Accounts</h2><p className="mt-2">Keep your account credentials private and provide accurate information. You are responsible for activity performed through your account and should report suspected unauthorized access to your library administrator.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Digital resources</h2><p className="mt-2">Access to e-books and other resources is temporary and subject to the lending rules displayed by the institution. Do not copy, redistribute, or bypass technical restrictions that protect library content or copyright.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">AI-assisted results</h2><p className="mt-2">AI search and research suggestions are provided as discovery assistance. Verify recommendations and follow your institution&apos;s academic integrity and citation requirements.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Changes and contact</h2><p className="mt-2">We may update these terms as the service changes. Continued use after an update means you accept the revised terms. Contact your Smart Lib administrator with questions.</p></section>
        </div>
      </article>
    </main>
  )
}
