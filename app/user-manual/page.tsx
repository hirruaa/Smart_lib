import Link from 'next/link'

export const metadata = { title: 'User Manual' }

export default function UserManualPage() {
  return (
    <main className="surface-page min-h-screen px-4 py-8 text-slate-900 dark:text-slate-100 sm:px-8">
      <article className="surface-card mx-auto max-w-3xl space-y-8 p-6 sm:p-10">
        <header>
          <Link href="/dashboard" className="text-sm font-semibold text-pine-700 hover:underline dark:text-pine-200">Back to dashboard</Link>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Member help</p>
          <h1 className="mt-2 text-3xl font-bold">User manual</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">A quick guide to finding books, choosing access, and managing your library activity.</p>
        </header>

        <section>
          <h2 className="text-lg font-semibold">Find a book</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Open Catalog and search by title, author, ISBN, discipline, or subject. Select a result to see its access options, availability, and fees before you continue.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Choose how to access it</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-paper-300 p-4 dark:border-forest-700">
              <h3 className="font-semibold">Digital books</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Choose an access duration and review its point cost. Free access opens without points. After unlocking, find the book in My Library.</p>
            </div>
            <div className="rounded-xl border border-paper-300 p-4 dark:border-forest-700">
              <h3 className="font-semibold">Print books</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Choose a loan period and review the fee before submitting a request. Pay cash at the library desk. A request does not reserve a copy; staff confirms the specific copy at checkout.</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Manage your activity</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Use My Library to open active digital books. Use Loans &amp; charges to review physical requests, loan dates, receipts, and charges. Your points balance and available top-up options are in Wallet.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Faculty course materials</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Faculty can submit teaching materials from Course materials in the sidebar. Submitted materials are reviewed before they are published.</p>
        </section>

        <p className="border-t border-paper-300 pt-5 text-sm text-slate-600 dark:border-forest-700 dark:text-slate-300">For current borrowing rules and fees, read the <Link href="/terms" className="font-semibold text-pine-700 underline dark:text-pine-200">Policy</Link>.</p>
      </article>
    </main>
  )
}
