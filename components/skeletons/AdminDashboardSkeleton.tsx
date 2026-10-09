import React from 'react'
import { Skeleton } from './Skeleton'

export function AdminDashboardSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300" role="status" aria-label="Loading admin dashboard">
      {/* Header skeleton */}
      <header className="rounded-[2rem] border border-slate-200/80 bg-white/70 p-6 dark:border-slate-800 dark:bg-slate-900/60 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 max-w-xl">
            <Skeleton variant="text" className="w-20 h-3.5" />
            <Skeleton variant="text" className="w-80 h-8" />
            <Skeleton variant="text" className="w-96 h-4" />
          </div>
          <Skeleton variant="rounded" className="h-10 w-32 rounded-2xl" />
        </div>
      </header>

      {/* KPI Metrics grid skeleton */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[1.75rem] border border-slate-200/80 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
          >
            <Skeleton variant="text" className="w-28 h-3.5" />
            <Skeleton variant="text" className="mt-4 w-16 h-8" />
          </div>
        ))}
      </section>

      {/* Overview grid skeleton */}
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        {/* Pending actions & table */}
        <div className="rounded-[2rem] border border-slate-200/80 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton variant="text" className="w-40 h-6" />
              <Skeleton variant="text" className="w-64 h-3.5" />
            </div>
            <Skeleton variant="rounded" className="h-8 w-32 rounded-xl" />
          </div>

          {/* Action tiles */}
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/40"
              >
                <Skeleton variant="text" className="w-24 h-3" />
                <Skeleton variant="text" className="mt-2 w-10 h-7" />
                <Skeleton variant="text" className="mt-1 w-20 h-2.5" />
              </div>
            ))}
          </div>

          {/* Table placeholder */}
          <div className="mt-6 space-y-3">
            <div className="flex gap-4 border-b border-slate-200/70 pb-3 dark:border-slate-700/60">
              <Skeleton variant="text" className="w-1/4 h-3.5" />
              <Skeleton variant="text" className="w-1/3 h-3.5" />
              <Skeleton variant="text" className="w-1/6 h-3.5" />
              <Skeleton variant="text" className="w-1/6 h-3.5" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2.5">
                <Skeleton variant="text" className="w-1/4 h-4" />
                <Skeleton variant="text" className="w-1/3 h-4" />
                <Skeleton variant="text" className="w-1/6 h-4" />
                <Skeleton variant="rounded" className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Right column: Library health + Recent activity */}
        <div className="space-y-6">
          <div className="rounded-[2rem] border border-slate-200/80 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <Skeleton variant="text" className="w-36 h-6" />
            <div className="mt-5 space-y-5">
              <div>
                <div className="flex justify-between">
                  <Skeleton variant="text" className="w-28 h-3.5" />
                  <Skeleton variant="text" className="w-12 h-3.5" />
                </div>
                <Skeleton variant="rounded" className="mt-2 h-2 w-full rounded-full" />
              </div>
              <div>
                <div className="flex justify-between">
                  <Skeleton variant="text" className="w-24 h-3.5" />
                  <Skeleton variant="text" className="w-12 h-3.5" />
                </div>
                <Skeleton variant="rounded" className="mt-2 h-2 w-full rounded-full" />
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200/80 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <Skeleton variant="text" className="w-36 h-6" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800 last:border-0">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton variant="text" className="w-4/5 h-3.5" />
                    <Skeleton variant="text" className="w-1/3 h-3" />
                  </div>
                  <Skeleton variant="rounded" className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export function AdminPhysicalSkeleton() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8 animate-in fade-in duration-300" role="status" aria-label="Loading librarian tools">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
          <Skeleton variant="text" className="w-28 h-3.5" />
          <Skeleton variant="text" className="w-64 h-8" />
          <Skeleton variant="text" className="w-full max-w-lg h-4" />
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4 lg:col-span-2">
            <Skeleton variant="text" className="w-48 h-6" />
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton variant="rounded" className="h-10 w-full rounded-xl" />
              <Skeleton variant="rounded" className="h-10 w-full rounded-xl" />
              <Skeleton variant="rounded" className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton variant="rounded" className="h-11 w-40 rounded-xl" />
          </div>

          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <Skeleton variant="text" className="w-36 h-6" />
              <Skeleton variant="text" className="w-full h-12" />
              <Skeleton variant="text" className="w-full h-12" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

export function EbookPaymentsSkeleton() {
  return (
    <main className="surface-page min-h-screen px-4 py-6 text-slate-900 dark:text-slate-100 sm:px-8 animate-in fade-in duration-300" role="status" aria-label="Loading payment requests">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="surface-card p-6 space-y-3">
          <Skeleton variant="text" className="w-28 h-3.5" />
          <Skeleton variant="text" className="w-72 h-8" />
          <Skeleton variant="text" className="w-full max-w-xl h-4" />
        </header>

        <section className="surface-card p-6 space-y-4">
          <Skeleton variant="text" className="w-56 h-6" />
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="grid gap-5 rounded-2xl border border-paper-300 bg-paper-50 p-5 dark:border-forest-700 dark:bg-forest-900/50 md:grid-cols-[1fr_260px]">
                <div className="space-y-2">
                  <Skeleton variant="text" className="w-3/4 h-5" />
                  <Skeleton variant="text" className="w-1/2 h-3.5" />
                  <Skeleton variant="text" className="w-1/3 h-3" />
                </div>
                <Skeleton variant="rounded" className="h-32 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}

