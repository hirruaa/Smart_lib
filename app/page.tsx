import Link from 'next/link'

const featureCards = [
  'Catalog browsing & live availability',
  'Borrow requests with admin approval',
  'Interactive reading notes and highlights',
  'Student and admin dashboards',
]

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-transparent px-6 py-12 text-slate-900 dark:bg-transparent dark:text-slate-100">
      <div className="w-full max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white/80 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-cyan-900/10">
        <div className="grid gap-10 px-8 py-10 md:grid-cols-[1.2fr_0.8fr] md:px-12 md:py-16">
          <div>
            <div className="inline-flex items-center rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-300">
              Smart Lib
            </div>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
              Study smarter with a library built for focus.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300">
              Discover books, manage borrowing, review notes, and study deeply from one streamlined digital library.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/login" className="rounded-full bg-sky-500 px-6 py-3 font-semibold text-white transition hover:bg-sky-400">Sign in</Link>
              <Link href="/login" className="rounded-full border border-slate-300 bg-transparent px-6 py-3 font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-500 dark:border-slate-700 dark:text-slate-200">Create account</Link>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-100/80 p-6 dark:border-slate-700 dark:bg-slate-950/60">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">Highlights</p>
            <div className="mt-6 space-y-3">
              {featureCards.map((feature) => (
                <div key={feature} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/80">
                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/15 text-xs font-bold text-sky-600 dark:text-sky-300">✓</span>
                  <span className="text-sm text-slate-700 dark:text-slate-200">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
