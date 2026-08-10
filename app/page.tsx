import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-50 to-white">
      <div className="max-w-3xl p-12 text-center">
        <h1 className="text-4xl font-bold text-slate-900">Smart Lib</h1>
        <p className="mt-4 text-slate-600">A smarter library for students — search, read, highlight, and study.</p>

        <div className="mt-8 flex items-center justify-center gap-4">
          <Link href="/login" className="rounded-lg bg-sky-600 px-5 py-3 text-white">Sign in</Link>
          <Link href="/login" className="rounded-lg border px-5 py-3">Get started</Link>
        </div>

        <div className="mt-10 text-left">
          <h2 className="text-lg font-semibold">Features</h2>
          <ul className="mt-3 space-y-2 text-slate-700">
            <li>Browse catalog and request books</li>
            <li>Interactive E-Study Room: PDF reader with highlights & notes</li>
            <li>Reviews, wishlists, and personalized recommendations</li>
          </ul>
        </div>
      </div>
    </main>
  )
}
