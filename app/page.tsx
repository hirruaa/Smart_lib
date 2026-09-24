import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'
import BrandLogo from '@/components/BrandLogo'

function FeatureCard({
  icon,
  title,
  description,
  badge,
}: {
  icon: React.ReactNode
  title: string
  description: string
  badge?: string
}) {
  return (
    <div className="surface-card group relative flex flex-col justify-between p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg dark:hover:border-pine-500/40">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pine-50 text-forest-900 transition-colors group-hover:bg-forest-900 group-hover:text-paper-100 dark:bg-forest-800 dark:text-pine-200 dark:group-hover:bg-paper-100 dark:group-hover:text-forest-900">
            {icon}
          </div>
          {badge && (
            <span className="rounded-full bg-warmGold-400/20 px-2.5 py-0.5 text-xs font-semibold text-warmGold-500 dark:bg-warmGold-400/10 dark:text-warmGold-400">
              {badge}
            </span>
          )}
        </div>
        <h3 className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{description}</p>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <main className="surface-page flex min-h-screen flex-col text-slate-900 dark:text-slate-100">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-paper-300/80 bg-paper-100/90 backdrop-blur-md dark:border-forest-800 dark:bg-forest-900/90">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="transition hover:opacity-95">
            <BrandLogo iconSize="sm" />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="rounded-xl border border-paper-300 bg-paper-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-pine-500 hover:text-slate-900 dark:border-forest-700 dark:bg-forest-800 dark:text-paper-100 dark:hover:border-pine-400"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-forest-900 px-4 py-2 text-sm font-semibold text-paper-100 shadow transition hover:bg-forest-800 dark:bg-paper-100 dark:text-forest-900 dark:hover:bg-paper-200"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-pine-200 bg-pine-50/70 px-4 py-1.5 text-xs font-semibold tracking-wide text-forest-900 dark:border-forest-700 dark:bg-forest-800/80 dark:text-pine-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Next-Gen Academic Library & Study Workspace
          </div>

          <h1 className="mt-8 font-serif text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-6xl sm:leading-tight">
            Discover, read, and master academic knowledge.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg">
            Smart Lib combines digital catalog lending, secure in-browser e-book reading, page-accurate highlights & notes, and an intelligent research assistant.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-2xl bg-forest-900 px-7 py-3.5 text-base font-semibold text-paper-100 shadow-xl shadow-forest-950/20 transition hover:bg-forest-800 hover:shadow-2xl dark:bg-paper-100 dark:text-forest-950 dark:hover:bg-paper-200"
            >
              <span>Access Library</span>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
              </svg>
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-2xl border border-paper-300 bg-paper-50 px-7 py-3.5 text-base font-semibold text-slate-700 transition hover:border-pine-500 hover:bg-paper-100 dark:border-forest-700 dark:bg-forest-800 dark:text-paper-100 dark:hover:bg-forest-700"
            >
              Create student account
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="border-t border-paper-300/80 bg-paper-50/60 px-5 py-16 dark:border-forest-800/80 dark:bg-forest-950/30 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="font-serif text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              Engineered for seamless scholarly study
            </h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
              Everything students and educators need in one modern, distraction-free environment.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              }
              title="Temporary Digital Lending"
              description="Request temporary digital access for 7 to 90 days. Built-in loan limits, extensions, and clear due dates keep resources accessible to everyone."
              badge="Lending"
            />

            <FeatureCard
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
              }
              title="Interactive Reader & Notes"
              description="Read approved materials with page-anchored text highlights and personalized study notes that persist across sessions."
              badge="Workspace"
            />

            <FeatureCard
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
                </svg>
              }
              title="AI Library Assistant"
              description="Get fast answers on catalog inventory, author topics, borrowing policies, and personal loan statuses with our context-aware assistant."
              badge="AI Helper"
            />

            <FeatureCard
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                </svg>
              }
              title="Secure E-Book Storage"
              description="E-books are stored natively with row-level security and signed URLs, ensuring copyrighted or licensed materials remain protected."
              badge="Supabase S3"
            />

            <FeatureCard
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              }
              title="Actionable Analytics"
              description="Real-time lending analytics, inventory tracking, loan fulfillment rate, and reader demand metrics for library administrators."
              badge="Intelligence"
            />

            <FeatureCard
              icon={
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                </svg>
              }
              title="Role-Based Security"
              description="Complete separation between student workspaces and administrative controls, backed by Supabase RLS and server-side authorization."
              badge="Security"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-paper-300/80 bg-paper-100 py-10 dark:border-forest-800 dark:bg-forest-900">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-5 sm:flex-row sm:px-8">
          <BrandLogo iconSize="sm" showText={true} />
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500 dark:text-slate-400">
            <Link href="/privacy" className="transition hover:text-slate-900 dark:hover:text-slate-200">Privacy Policy</Link>
            <Link href="/terms" className="transition hover:text-slate-900 dark:hover:text-slate-200">Terms of Service</Link>
            <Link href="/cookies" className="transition hover:text-slate-900 dark:hover:text-slate-200">Cookie Policy</Link>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            &copy; {new Date().getFullYear()} Smart Lib. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  )
}
