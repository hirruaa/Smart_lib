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

function CheckIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 text-pine-600 dark:text-pine-200" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clipRule="evenodd" /></svg>
}

const FEATURED_COLLECTIONS = [
  {
    title: 'Computer Systems & Architecture',
    author: 'R. Bryant & D. O\'Hallaron',
    category: 'Computer Science',
    readers: '142 Active',
    badge: 'Core Curriculum',
  },
  {
    title: 'Artificial Intelligence: A Modern Approach',
    author: 'S. Russell & P. Norvig',
    category: 'Intelligence & Data',
    readers: '298 Active',
    badge: 'Popular',
  },
  {
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    category: 'Design & Human Cognition',
    readers: '88 Active',
    badge: 'Essential Read',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-paper-100 text-[#242a28] selection:bg-pine-200 dark:bg-forest-900 dark:text-paper-100">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-paper-300/80 bg-paper-100/80 backdrop-blur-md dark:border-forest-800 dark:bg-forest-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-12">
          <Link href="/" className="flex items-center gap-3 text-base font-semibold tracking-tight transition hover:opacity-85">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-900 text-paper-100 shadow-sm dark:bg-paper-100 dark:text-forest-900">
              <BookIcon />
            </span>
            <span className="text-lg font-bold tracking-tight">Smart Lib</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm font-medium text-[#747873] dark:text-[#d0cec2] md:flex">
            <a href="#features" className="transition hover:text-forest-900 dark:hover:text-paper-100">Features</a>
            <a href="#collections" className="transition hover:text-forest-900 dark:hover:text-paper-100">Catalog Preview</a>
            <a href="#workflow" className="transition hover:text-forest-900 dark:hover:text-paper-100">Study Flow</a>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 font-semibold text-[#242a28] transition hover:bg-paper-200 dark:text-paper-100 dark:hover:bg-forest-800"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-xl bg-forest-900 px-4 py-2 font-semibold text-paper-100 shadow-sm transition hover:bg-forest-800 dark:bg-paper-100 dark:text-forest-900 dark:hover:bg-paper-200"
            >
              Get Started <ArrowUpRight />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        {/* Hero Section */}
        <section className="grid gap-6 pb-6 pt-4 md:grid-cols-12">
          <div className="relative overflow-hidden rounded-[2rem] border border-paper-300 bg-paper-50 p-8 shadow-[0_12px_36px_rgba(61,52,39,0.06)] dark:border-forest-800 dark:bg-forest-800/40 md:col-span-8 md:p-14">
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-pine-500/30 bg-pine-100/60 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-pine-700 dark:border-pine-200/30 dark:bg-pine-700/40 dark:text-pine-200">
                <span className="h-2 w-2 rounded-full bg-pine-500" />
                Modern Academic Library Platform
              </div>

              <h1 className="mt-7 max-w-xl text-4xl font-bold leading-[1.08] tracking-[-0.04em] sm:text-6xl">
                Find the right resource. <span className="text-[#9b9b91] dark:text-[#b8b8aa]">Go deeper.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-[#747873] dark:text-[#d0cec2]">
                A focused digital library environment designed for discovering authoritative academic sources, managing borrow requests effortlessly, and annotating books directly in an integrated study suite.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-forest-900 px-6 py-3.5 text-sm font-semibold text-paper-100 shadow-md transition hover:-translate-y-0.5 hover:bg-forest-800 hover:shadow-lg dark:bg-paper-100 dark:text-forest-900 dark:hover:bg-paper-200"
                >
                  Create Student Account <ArrowUpRight />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-xl border border-paper-300 bg-paper-50 px-6 py-3.5 text-sm font-semibold text-[#4c554f] transition hover:border-pine-500 hover:text-forest-900 dark:border-forest-800 dark:bg-forest-800/60 dark:text-paper-100"
                >
                  Explore Collection
                </Link>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-paper-300/80 pt-6 text-xs text-[#747873] dark:border-forest-800 dark:text-[#d0cec2]">
                <span className="flex items-center gap-1.5"><CheckIcon /> Instant digital checkout</span>
                <span className="flex items-center gap-1.5"><CheckIcon /> Integrated notes & highlights</span>
                <span className="flex items-center gap-1.5"><CheckIcon /> AI-assisted source discovery</span>
              </div>
            </div>

            <div className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full border-[40px] border-pine-100/60 dark:border-forest-700/30" />
          </div>

          {/* AI Assistant Spotlight */}
          <div className="flex flex-col justify-between rounded-[2rem] border border-pine-200 bg-pine-100/80 p-8 dark:border-forest-700 dark:bg-forest-800/80 md:col-span-4">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-paper-50 text-pine-700 shadow-sm dark:bg-forest-900 dark:text-pine-200">
                <SparkIcon />
              </div>
              <h2 className="mt-8 text-2xl font-bold tracking-tight text-forest-900 dark:text-paper-100">
                Your research desk, guided by intelligence.
              </h2>
              <p className="mt-3 text-sm leading-6 text-pine-700/90 dark:text-[#d0cec2]">
                Search through literature by topic or concept, receive curated summaries, and monitor your borrowing history seamlessly.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-paper-300/60 bg-paper-50/70 p-4 dark:border-forest-700 dark:bg-forest-900/60">
              <p className="text-xs font-semibold text-pine-700 dark:text-pine-200">Sample Query:</p>
              <p className="mt-1 text-xs italic text-[#747873] dark:text-[#d0cec2]">&quot;Find references on distributed systems consensus protocols&quot;</p>
              <Link
                href="/login"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-forest-900 hover:underline dark:text-pine-200"
              >
                Try the assistant &rarr;
              </Link>
            </div>
          </div>
        </section>

        {/* Live Metrics Row */}
        <section className="grid grid-cols-2 gap-4 py-4 md:grid-cols-4">
          <div className="rounded-2xl border border-paper-300 bg-paper-50 p-5 dark:border-forest-800 dark:bg-forest-800/40">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#747873] dark:text-[#d0cec2]">Curated Catalog</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-forest-900 dark:text-paper-100">1,200+</p>
            <p className="mt-1 text-xs text-[#747873] dark:text-[#d0cec2]">Academic volumes & PDFs</p>
          </div>
          <div className="rounded-2xl border border-paper-300 bg-paper-50 p-5 dark:border-forest-800 dark:bg-forest-800/40">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#747873] dark:text-[#d0cec2]">Active Readers</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-forest-900 dark:text-paper-100">850+</p>
            <p className="mt-1 text-xs text-[#747873] dark:text-[#d0cec2]">Students & faculty members</p>
          </div>
          <div className="rounded-2xl border border-paper-300 bg-paper-50 p-5 dark:border-forest-800 dark:bg-forest-800/40">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#747873] dark:text-[#d0cec2]">Loan Fulfillment</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-forest-900 dark:text-paper-100">&lt; 15 min</p>
            <p className="mt-1 text-xs text-[#747873] dark:text-[#d0cec2]">Average approval time</p>
          </div>
          <div className="rounded-2xl border border-paper-300 bg-paper-50 p-5 dark:border-forest-800 dark:bg-forest-800/40">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#747873] dark:text-[#d0cec2]">Reading Retention</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-forest-900 dark:text-paper-100">100%</p>
            <p className="mt-1 text-xs text-[#747873] dark:text-[#d0cec2]">Sync of notes and highlights</p>
          </div>
        </section>

        {/* Feature Highlights Grid */}
        <section id="features" className="py-8">
          <div className="mb-8 max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Designed for Academics</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Everything you need for serious research.</h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-[1.75rem] border border-paper-300 bg-paper-200/60 p-8 dark:border-forest-800 dark:bg-forest-800/30">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-900 text-paper-100 dark:bg-paper-100 dark:text-forest-900">
                <BookIcon />
              </span>
              <h3 className="mt-6 text-xl font-bold">Flexible Digital Loans</h3>
              <p className="mt-2 text-sm leading-6 text-[#747873] dark:text-[#d0cec2]">
                Request resources for 7, 14, 30, or up to 90 days. Keep track of due dates with proactive countdown reminders and notifications.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-paper-300 bg-paper-50 p-8 shadow-[0_8px_24px_rgba(61,52,39,0.05)] dark:border-forest-800 dark:bg-forest-800/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-900 text-paper-100 dark:bg-paper-100 dark:text-forest-900">
                <SparkIcon />
              </span>
              <h3 className="mt-6 text-xl font-bold">In-Reader Annotations</h3>
              <p className="mt-2 text-sm leading-6 text-[#747873] dark:text-[#d0cec2]">
                Highlight passages on PDF pages, organize categorized study notes, and export or reference your findings whenever you write.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-forest-800 bg-forest-900 p-8 text-paper-100 dark:border-pine-500/30 dark:bg-forest-950">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-paper-100 text-forest-900">
                <ArrowUpRight />
              </span>
              <h3 className="mt-6 text-xl font-bold">Comprehensive Admin Control</h3>
              <p className="mt-2 text-sm leading-6 text-[#b5c9b8]">
                Librarians and faculty can upload PDF links, monitor active loans, review pending requests, and manage student borrowing limits.
              </p>
            </div>
          </div>
        </section>

        {/* Featured Catalog Preview */}
        <section id="collections" className="py-8">
          <div className="flex flex-col justify-between gap-4 border-b border-paper-300 pb-4 dark:border-forest-800 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine-600 dark:text-pine-200">Catalog Preview</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">Featured Resources</h2>
            </div>
            <Link href="/login" className="inline-flex items-center gap-1 text-sm font-semibold text-forest-900 hover:underline dark:text-pine-200">
              Sign in to view full catalog &rarr;
            </Link>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {FEATURED_COLLECTIONS.map((item) => (
              <div key={item.title} className="flex flex-col justify-between rounded-2xl border border-paper-300 bg-paper-50 p-6 transition hover:border-pine-500 hover:shadow-md dark:border-forest-800 dark:bg-forest-800/40">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-pine-600 dark:text-pine-200">{item.category}</span>
                    <span className="rounded-full bg-paper-200 px-2.5 py-0.5 text-[11px] font-semibold text-[#242a28] dark:bg-forest-700 dark:text-paper-100">{item.badge}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold text-forest-900 dark:text-paper-100">{item.title}</h3>
                  <p className="mt-1 text-sm text-[#747873] dark:text-[#d0cec2]">by {item.author}</p>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-paper-300/80 pt-4 text-xs font-medium text-[#747873] dark:border-forest-800 dark:text-[#d0cec2]">
                  <span>{item.readers}</span>
                  <Link href="/login" className="font-semibold text-forest-900 hover:underline dark:text-pine-200">Request Access &rarr;</Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Banner */}
        <section className="mt-10 rounded-[2rem] border border-paper-300 bg-gradient-to-br from-paper-50 to-paper-200 p-8 text-center shadow-sm dark:border-forest-800 dark:from-forest-800/60 dark:to-forest-900 sm:p-12">
          <h2 className="text-3xl font-bold tracking-tight text-forest-900 dark:text-paper-100">Ready to transform your reading and study routine?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#747873] dark:text-[#d0cec2]">
            Join Smart Lib today to gain instant access to textbook resources, keep all your study notes linked to pages, and accelerate your academic research.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-forest-900 px-6 py-3 text-sm font-semibold text-paper-100 shadow transition hover:bg-forest-800 dark:bg-paper-100 dark:text-forest-900 dark:hover:bg-paper-200"
            >
              Get started for free <ArrowUpRight />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center rounded-xl border border-paper-300 bg-paper-50 px-6 py-3 text-sm font-semibold text-[#4c554f] transition hover:border-pine-500 hover:text-forest-900 dark:border-forest-800 dark:bg-forest-800 dark:text-paper-100"
            >
              Log into existing account
            </Link>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-16 border-t border-paper-300 bg-paper-50/80 py-12 dark:border-forest-800 dark:bg-forest-950/60">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 font-bold tracking-tight">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-900 text-paper-100 dark:bg-paper-100 dark:text-forest-900">
                  <BookIcon />
                </span>
                <span>Smart Lib</span>
              </div>
              <p className="mt-3 text-xs leading-5 text-[#747873] dark:text-[#d0cec2]">
                A tranquil, focused digital library and research workspace for students, researchers, and educators.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#747873] dark:text-[#d0cec2]">Platform</p>
              <ul className="mt-3 space-y-2 text-sm text-[#4c554f] dark:text-[#d0cec2]">
                <li><Link href="/login" className="hover:underline">Catalog Discovery</Link></li>
                <li><Link href="/login" className="hover:underline">AI Assistant</Link></li>
                <li><Link href="/login" className="hover:underline">E-Reader Suite</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#747873] dark:text-[#d0cec2]">Account</p>
              <ul className="mt-3 space-y-2 text-sm text-[#4c554f] dark:text-[#d0cec2]">
                <li><Link href="/login" className="hover:underline">Sign In</Link></li>
                <li><Link href="/register" className="hover:underline">Create Account</Link></li>
                <li><Link href="/dashboard" className="hover:underline">Dashboard Access</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#747873] dark:text-[#d0cec2]">Legal</p>
              <ul className="mt-3 space-y-2 text-sm text-[#4c554f] dark:text-[#d0cec2]">
                <li><Link href="/privacy" className="hover:underline">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:underline">Terms of Service</Link></li>
                <li><Link href="/cookies" className="hover:underline">Cookie Preferences</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-paper-300/80 pt-6 text-xs text-[#747873] dark:border-forest-800 dark:text-[#d0cec2] sm:flex-row">
            <p>&copy; {new Date().getFullYear()} Smart Lib. All rights reserved.</p>
            <p>Built for serene learning and purposeful study.</p>
          </div>
        </div>
      </footer>
    </main>
  )
}

