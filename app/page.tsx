import Link from 'next/link'

function ArrowUpRight() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 15 15 5M7 5h8v8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function BookIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v16H7a2.5 2.5 0 0 0-2.5 2.5v-16Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M4.5 21.5A2.5 2.5 0 0 1 7 19h12.5M8 7h7M8 10h5" strokeLinecap="round" /></svg>
}

function SparkIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f7f5] px-5 py-6 text-[#17181a] dark:bg-slate-950 dark:text-slate-100 sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <nav className="flex items-center justify-between border-b border-slate-200/80 pb-5 dark:border-slate-800">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#17181a] text-white dark:bg-white dark:text-slate-950"><BookIcon /></span>Smart Lib</Link>
          <div className="flex items-center gap-5 text-sm text-slate-500 dark:text-slate-400"><Link href="/privacy" className="hidden transition hover:text-indigo-600 sm:block">Privacy</Link><Link href="/terms" className="hidden transition hover:text-indigo-600 sm:block">Terms</Link><Link href="/login" className="font-semibold text-[#17181a] transition hover:text-indigo-600 dark:text-slate-100">Sign in <span aria-hidden="true">&rarr;</span></Link></div>
        </nav>

        <section className="grid gap-4 pb-4 pt-6 md:grid-cols-12 md:grid-rows-[minmax(280px,1fr)_190px]">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900 md:col-span-8 md:p-12">
            <div className="relative z-10 max-w-2xl"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300"><span className="h-2 w-2 rounded-full bg-indigo-500" />Digital library for serious study</p><h1 className="mt-7 max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">Find the right resource. <span className="text-slate-400 dark:text-slate-500">Go deeper.</span></h1><p className="mt-6 max-w-lg text-base leading-7 text-slate-500 dark:text-slate-400">A focused academic library for discovering resources, managing access, and turning reading into meaningful research.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-[#17181a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 dark:bg-white dark:text-slate-950 dark:hover:bg-indigo-200">Create account <ArrowUpRight /></Link><Link href="/login" className="inline-flex items-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200">Explore library</Link></div></div>
            <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full border-[36px] border-indigo-50 dark:border-indigo-950/60" />
          </div>

          <div className="rounded-[1.75rem] border border-indigo-100 bg-indigo-50 p-7 dark:border-indigo-900/60 dark:bg-indigo-950/40 md:col-span-4 md:p-8"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-300"><SparkIcon /></div><h2 className="mt-12 text-2xl font-semibold tracking-tight">Your research, with direction.</h2><p className="mt-3 text-sm leading-6 text-indigo-900/65 dark:text-indigo-100/65">Ask the AI assistant to discover sources, refine a topic, or understand your borrowing activity.</p><Link href="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-300">Meet the assistant <ArrowUpRight /></Link></div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-[#eef0ee] p-7 dark:border-slate-800 dark:bg-slate-900 md:col-span-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Built for learning</p><p className="mt-8 text-3xl font-semibold tracking-tight">Read with intent.</p><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">Notes, highlights, and a clear reading history keep your work in one place.</p></div>
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_10px_30px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900 md:col-span-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Access model</p><span className="text-indigo-600 dark:text-indigo-300"><BookIcon /></span></div><p className="mt-8 text-3xl font-semibold tracking-tight">Borrow on your terms.</p><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Temporary digital access with clear expiry and borrowing history.</p></div>
          <div className="rounded-[1.75rem] border border-slate-200 bg-[#17181a] p-7 text-white dark:border-slate-700 md:col-span-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resource desk</p><div className="mt-8 flex items-end justify-between"><p className="max-w-[170px] text-2xl font-semibold leading-tight">One calm place for better questions.</p><span className="text-indigo-300"><ArrowUpRight /></span></div></div>
        </section>
        </div>
    </main>
  )
}
