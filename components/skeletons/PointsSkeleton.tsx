import React from 'react'
import { Skeleton } from './Skeleton'

export function PointsSkeleton() {
  return (
    <main className="surface-page min-h-screen px-4 py-6 sm:px-8 animate-in fade-in duration-300" role="status" aria-label="Loading points wallet">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="surface-card flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="space-y-3 max-w-xl">
            <Skeleton variant="text" className="w-32 h-3.5" />
            <Skeleton variant="text" className="w-24 h-3 bg-pine-200/60 dark:bg-pine-900/40" />
            <Skeleton variant="text" className="w-64 h-8" />
            <Skeleton variant="text" className="w-80 h-4" />
          </div>
          <div className="rounded-2xl bg-forest-900/80 p-5 w-44 space-y-2">
            <Skeleton variant="text" className="w-24 h-3 bg-white/30" />
            <Skeleton variant="text" className="w-16 h-8 bg-white/40" />
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="surface-card p-5 space-y-2">
              <Skeleton variant="text" className="w-24 h-3" />
              <Skeleton variant="text" className="w-16 h-7" />
            </div>
          ))}
        </section>

        <section className="surface-card p-6 space-y-4">
          <div className="flex gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" className="h-8 w-24 rounded-lg" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div className="space-y-1.5 flex-1">
                  <Skeleton variant="text" className="w-1/2 h-4" />
                  <Skeleton variant="text" className="w-1/4 h-3" />
                </div>
                <Skeleton variant="rounded" className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

