import Link from 'next/link'

export const metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  return (
    <main className="surface-page min-h-screen px-6 py-16 text-slate-900 dark:text-slate-100">
      <article className="surface-card mx-auto max-w-3xl p-8 sm:p-12">
        <Link href="/" className="text-sm font-semibold text-sky-600 dark:text-sky-300">Back to college library</Link>
        <h1 className="mt-8 text-4xl font-bold">Terms of Service</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: September 8, 2026</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Using Mary the Queen College</h2><p className="mt-2">Mary the Queen College provides authenticated users with access to digital library resources, research discovery tools, study tools, and borrowing services. Use the service only for lawful academic and educational purposes.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Accounts</h2><p className="mt-2">Keep your account credentials private and provide accurate information. You are responsible for activity performed through your account and should report suspected unauthorized access to your library administrator.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Digital resources</h2><p className="mt-2">Access to e-books and other resources is temporary and subject to the lending rules displayed by the institution. Do not copy, redistribute, or bypass technical restrictions that protect library content or copyright.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">General-circulation physical books</h2><p className="mt-2">The current Mary the Queen College general-circulation policy provides a 14-calendar-day loan. A two-calendar-day grace period applies. If a book is returned after the grace period, a late fine of ₱5 per chargeable day is assessed retroactively from the day after the due date. Sundays and public holidays recorded by the library are not chargeable days. The fine is capped at ₱500 per item. A book that remains overdue for 30 consecutive days is classified as lost; late-fine accrual then stops. Any replacement charge is handled by the institution outside Mary the Queen College.</p><p className="mt-2">An overdue or lost physical item prevents new physical checkout requests and availability-queue entries. Unpaid physical fines totaling ₱100 or more suspend borrowing privileges. New digital checkouts are also restricted while a physical item is overdue or lost, or while any physical fine is unpaid. Digital access expires at the displayed end date and does not accrue overdue fines. Settle physical fines with the library cashier; contact library staff about lost-item records.</p><p className="mt-2">This policy applies to general-circulation physical books only. Reserve/course-reserve materials, audiovisual items, and equipment are not covered by this initial Mary the Queen College policy.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">AI-assisted results</h2><p className="mt-2">AI search and research suggestions are provided as discovery assistance. Verify recommendations and follow your institution&apos;s academic integrity and citation requirements.</p></section>
          <section><h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Changes and contact</h2><p className="mt-2">We may update these terms as the service changes. Continued use after an update means you accept the revised terms. Contact your Mary the Queen College administrator with questions.</p></section>
        </div>
      </article>
    </main>
  )
}
