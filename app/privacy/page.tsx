import Link from 'next/link'

export const metadata = { title: 'Privacy Policy | Smart Lib' }

export default function PrivacyPage() {
  return (
    <main className="surface-page min-h-screen px-6 py-16 text-slate-900 dark:text-slate-100">
      <article className="surface-card mx-auto max-w-3xl p-8 sm:p-12">
        <Link href="/" className="text-sm font-semibold text-sky-600 dark:text-sky-300">Back to Smart Lib</Link>
        <h1 className="mt-8 text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: September 8, 2026</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Information we collect</h2><p className="mt-2">We collect account details such as your name and email, library activity such as searches and borrowing records, and study content that you choose to save, including notes and highlights.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">How we use information</h2><p className="mt-2">We use this information to authenticate users, provide library and research assistance, manage digital resource access, maintain security, send service notifications, and improve the library service.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Sharing and retention</h2><p className="mt-2">We do not sell personal information. Data may be processed by service providers that host authentication, database, and application infrastructure. We retain records for as long as needed to provide the service, meet institutional requirements, or resolve disputes.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Your choices</h2><p className="mt-2">You may request access to, correction of, or deletion of your account information, subject to library recordkeeping requirements. Contact your library administrator to make a request.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Contact</h2><p className="mt-2">For privacy questions, contact the Smart Lib administrator for your institution.</p></section>
        </div>
      </article>
    </main>
  )
}
