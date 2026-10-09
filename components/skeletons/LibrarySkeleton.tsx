import React from 'react'
import { Skeleton } from './Skeleton'

export function LibrarySkeleton() {
  return (
    <main className="surface-page min-h-screen px-4 py-6 sm:px-8 animate-in fade-in duration-300" role="status" aria-label="Loading your library">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header skeleton */}
        <header className="surface-card flex flex-wrap items-end justify-between gap-4 p-6">
          <div className="space-y-3 max-w-xl">
            <Skeleton variant="text" className="w-32 h-3.5" />
            <Skeleton variant="text" className="w-24 h-3 bg-pine-200/60 dark:bg-pine-900/40" />
            <Skeleton variant="text" className="w-64 h-8" />
            <Skeleton variant="text" className="w-80 h-4" />
          </div>
          <Skeleton variant="rounded" className="h-11 w-36 rounded-xl" />
        </header>

        {/* 3 Metric Cards */}
        <section className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="surface-card p-5 space-y-3">
              <Skeleton variant="text" className="w-28 h-3" />
              <Skeleton variant="text" className="w-16 h-8" />
            </div>
          ))}
        </section>

        {/* Book items skeleton */}
        <section className="space-y-4">
          <div className="surface-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton variant="text" className="w-40 h-6" />
              <Skeleton variant="text" className="w-20 h-4" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                  <div className="space-y-2">
                    <Skeleton variant="text" className="w-3/4 h-5" />
                    <Skeleton variant="text" className="w-1/2 h-3.5" />
                  </div>
                  <Skeleton variant="rounded" className="mt-4 h-2 w-full rounded-full" />
                  <div className="mt-4 flex gap-2">
                    <Skeleton variant="rounded" className="h-9 flex-1 rounded-xl" />
                    <Skeleton variant="rounded" className="h-9 w-24 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

