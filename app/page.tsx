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
    <main className="min-h-screen bg-[#f5f1e8] px-5 py-6 text-[#242a28] dark:bg-[#263f3a] dark:text-[#f5f1e8] sm:px-8 lg:px-12 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <nav className="flex items-center justify-between border-b border-slate-200/80 pb-5 dark:border-slate-800">
          <Link href="/" className="flex items-center gap-3 text-sm font-semibold tracking-tight"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#242a28] text-[#f5f1e8] dark:bg-[#f5f1e8] dark:text-[#242a28]"><BookIcon /></span>Smart Lib</Link>
          <div className="flex items-center gap-5 text-sm text-slate-500 dark:text-slate-400"><Link href="/privacy" className="hidden transition hover:text-indigo-600 sm:block">Privacy</Link><Link href="/terms" className="hidden transition hover:text-indigo-600 sm:block">Terms</Link><Link href="/login" className="font-semibold text-[#17181a] transition hover:text-indigo-600 dark:text-slate-100">Sign in <span aria-hidden="true">&rarr;</span></Link></div>
        </nav>

        <section className="grid gap-4 pb-4 pt-6 md:grid-cols-12 md:grid-rows-[minmax(280px,1fr)_190px]">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-[#e2ded4] bg-[#fcfbf7] p-8 shadow-[0_10px_30px_rgba(61,52,39,0.06)] dark:border-[#52645a] dark:bg-[#39453d] md:col-span-8 md:p-12">
            <div className="relative z-10 max-w-2xl"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#78938a] dark:text-[#b5c9b8]"><span className="h-2 w-2 rounded-full bg-[#78938a]" />Digital library for serious study</p><h1 className="mt-7 max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">Find the right resource. <span className="text-[#9b9b91] dark:text-[#b8b8aa]">Go deeper.</span></h1><p className="mt-6 max-w-lg text-base leading-7 text-[#747873] dark:text-[#d0cec2]">A focused academic library for discovering resources, managing access, and turning reading into meaningful research.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-[#242a28] px-5 py-3 text-sm font-semibold text-[#f5f1e8] transition hover:bg-[#263f3a] dark:bg-[#f5f1e8] dark:text-[#242a28] dark:hover:bg-[#dde5de]">Create account <ArrowUpRight /></Link><Link href="/login" className="inline-flex items-center rounded-xl border border-[#e2ded4] px-5 py-3 text-sm font-semibold text-[#4c554f] transition hover:border-[#78938a] hover:text-[#263f3a] dark:border-[#63736a] dark:text-[#f5f1e8]">Explore library</Link></div></div>
            <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full border-[36px] border-[#dde5de] dark:border-[#52645a]" />
          </div>

          <div className="rounded-[1.75rem] border border-[#d5e1d7] bg-[#dde5de] p-7 dark:border-[#63736a] dark:bg-[#40534a] md:col-span-4 md:p-8"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fcfbf7] text-[#78938a] shadow-sm dark:bg-[#263f3a] dark:text-[#b5c9b8]"><SparkIcon /></div><h2 className="mt-12 text-2xl font-semibold tracking-tight">Your research, with direction.</h2><p className="mt-3 text-sm leading-6 text-[#4f6258] dark:text-[#d0cec2]">Ask the AI assistant to discover sources, refine a topic, or understand your borrowing activity.</p><Link href="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#263f3a] dark:text-[#dde5de]">Meet the assistant <ArrowUpRight /></Link></div>

          <div className="rounded-[1.75rem] border border-[#e2ded4] bg-[#e9e4d7] p-7 dark:border-[#63736a] dark:bg-[#3b4940] md:col-span-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#747873] dark:text-[#d0cec2]">Built for learning</p><p className="mt-8 text-3xl font-semibold tracking-tight">Read with intent.</p><p className="mt-2 text-sm leading-6 text-[#5f655f] dark:text-[#d0cec2]">Notes, highlights, and a clear reading history keep your work in one place.</p></div>
          <div className="rounded-[1.75rem] border border-[#e2ded4] bg-[#fcfbf7] p-7 shadow-[0_10px_30px_rgba(61,52,39,0.06)] dark:border-[#63736a] dark:bg-[#39453d] md:col-span-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#747873] dark:text-[#d0cec2]">Access model</p><span className="text-[#78938a] dark:text-[#b5c9b8]"><BookIcon /></span></div><p className="mt-8 text-3xl font-semibold tracking-tight">Borrow on your terms.</p><p className="mt-2 text-sm leading-6 text-[#747873] dark:text-[#d0cec2]">Temporary digital access with clear expiry and borrowing history.</p></div>
          <div className="rounded-[1.75rem] border border-[#52645a] bg-[#263f3a] p-7 text-[#f5f1e8] dark:border-[#78938a] md:col-span-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b5c9b8]">Resource desk</p><div className="mt-8 flex items-end justify-between"><p className="max-w-[170px] text-2xl font-semibold leading-tight">One calm place for better questions.</p><span className="text-[#d0ad78]"><ArrowUpRight /></span></div></div>
        </section>
        </div>
    </main>
  )
}
