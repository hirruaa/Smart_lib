import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'

function BookIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v16H7a2.5 2.5 0 0 0-2.5 2.5v-16Z" strokeLinecap="round" strokeLinejoin="round" /><path d="M4.5 21.5A2.5 2.5 0 0 1 7 19h12.5M8 7h7M8 10h5" strokeLinecap="round" /></svg>
}

export default function Home() {
  return (
    <main className="surface-page flex min-h-screen flex-col px-5 py-5 text-slate-900 dark:text-slate-100 sm:px-8">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3 text-base font-semibold tracking-tight">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest-900 text-paper-100 dark:bg-paper-100 dark:text-forest-900">
            <BookIcon />
          </span>
          <span>Smart Lib</span>
        </Link>
        <ThemeToggle />
      </header>

      <section className="flex flex-1 items-center justify-center py-16">
        <div className="surface-card w-full max-w-md p-8 text-center sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-900 text-paper-100 dark:bg-paper-100 dark:text-forest-900">
            <BookIcon />
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Smart Lib</h1>
          <div className="mt-8 grid gap-3">
            <Link href="/login" className="rounded-xl bg-forest-900 px-5 py-3 text-sm font-semibold text-paper-100 transition hover:bg-forest-800 dark:bg-paper-100 dark:text-forest-900 dark:hover:bg-paper-200">
              Sign in
            </Link>
            <Link href="/register" className="rounded-xl border border-paper-300 bg-paper-50 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-pine-500 dark:border-forest-700 dark:bg-forest-800 dark:text-paper-100">
              Create account
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-center gap-4 border-t border-paper-300/80 pt-5 text-xs text-slate-500 dark:border-forest-800 dark:text-slate-400">
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/terms" className="hover:underline">Terms</Link>
        <Link href="/cookies" className="hover:underline">Cookies</Link>
      </footer>
    </main>
  )
}
