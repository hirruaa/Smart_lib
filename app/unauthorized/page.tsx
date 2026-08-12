import Link from 'next/link'

export const metadata = {
  title: 'Unauthorized - Smart Lib',
  description: 'Access denied page for Smart Lib',
}

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-transparent px-4 py-12 text-slate-900 antialiased dark:text-slate-100">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white/90 p-10 text-center shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-slate-950/40">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-600 dark:text-rose-300">Access denied</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">You do not have permission to view this page.</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          If you believe this is a mistake, sign in with a different account or contact your administrator.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/login" className="rounded-3xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400">
            Sign in
          </Link>
          <Link href="/" className="rounded-3xl border border-slate-200 bg-transparent px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-600">
            Back home
          </Link>
        </div>
      </div>
    </div>
  )
}
