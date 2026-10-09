import React from 'react'
import { Skeleton } from './Skeleton'

export function StudentDashboardSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300" role="status" aria-label="Loading student dashboard">
      {/* Hero skeleton */}
      <div className="rounded-[2rem] border border-paper-300 bg-paper-50 p-6 dark:border-forest-800 dark:bg-forest-900/60 lg:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 max-w-xl">
            <Skeleton variant="text" className="w-36 h-3.5 bg-pine-200/60 dark:bg-pine-900/40" />
            <Skeleton variant="text" className="w-72 h-8" />
            <Skeleton variant="text" className="w-96 h-4" />
          </div>
          <div className="flex items-center gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" className="h-11 w-11 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>

      {/* AI Assistant teaser skeleton */}
      <div className="rounded-[2rem] border border-slate-200/80 bg-white/70 p-6 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center gap-4">
          <Skeleton variant="circular" className="h-10 w-10 shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton variant="text" className="w-48 h-4" />
            <Skeleton variant="text" className="w-full max-w-md h-3" />
          </div>
        </div>
      </div>

      {/* Continue reading panel skeleton */}
      <div className="rounded-[2rem] border border-paper-300 bg-paper-50 p-6 dark:border-forest-800 dark:bg-forest-900/60 lg:p-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton variant="text" className="w-24 h-3.5" />
            <Skeleton variant="text" className="w-44 h-6" />
          </div>
          <Skeleton variant="text" className="w-28 h-4" />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-paper-300 bg-paper-100/70 p-4 dark:border-forest-700 dark:bg-forest-800/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <Skeleton variant="text" className="w-3/4 h-4" />
                  <Skeleton variant="text" className="w-1/2 h-3" />
                </div>
                <Skeleton variant="rounded" className="h-5 w-12 rounded-full" />
              </div>
              <Skeleton variant="rounded" className="mt-4 h-1.5 w-full rounded-full" />
              <Skeleton variant="rounded" className="mt-4 h-8 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>

      {/* Analytics stats strip skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60"
          >
            <Skeleton variant="text" className="w-28 h-3.5" />
            <div className="mt-3 flex items-baseline gap-2">
              <Skeleton variant="text" className="w-16 h-8" />
              <Skeleton variant="text" className="w-12 h-3" />
            </div>
            <Skeleton variant="text" className="mt-2 w-32 h-3" />
          </div>
        ))}
      </div>

      {/* Main content grid skeleton */}
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          {/* Catalog panel */}
          <div className="rounded-[2rem] border border-slate-200/80 bg-white/70 p-6 dark:border-slate-800 dark:bg-slate-900/60 lg:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <Skeleton variant="text" className="w-48 h-6" />
                <Skeleton variant="text" className="w-64 h-3.5" />
              </div>
              <Skeleton variant="rounded" className="h-10 w-full sm:w-64 rounded-xl" />
            </div>

            {/* Category pills skeleton */}
            <div className="mt-6 flex flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rounded" className="h-7 w-20 rounded-full" />
              ))}
            </div>

            {/* Book cards grid skeleton */}
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700/60 dark:bg-slate-800/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 flex-1">
                      <Skeleton variant="text" className="w-4/5 h-4" />
                      <Skeleton variant="text" className="w-1/2 h-3" />
                    </div>
                    <Skeleton variant="rounded" className="h-5 w-14 rounded-full" />
                  </div>
                  <Skeleton variant="text" className="mt-3 w-full h-3" />
                  <Skeleton variant="text" className="mt-1 w-2/3 h-3" />
                  <div className="mt-4 flex gap-2">
                    <Skeleton variant="rounded" className="h-8 flex-1 rounded-xl" />
                    <Skeleton variant="rounded" className="h-8 flex-1 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side bento skeleton */}
        <aside className="grid gap-6 xl:grid-cols-2">
          {/* Requests panel */}
          <div className="rounded-[2rem] border border-slate-200/80 bg-white/70 p-6 dark:border-slate-800 dark:bg-slate-900/60 xl:col-span-2">
            <div className="space-y-2">
              <Skeleton variant="text" className="w-36 h-6" />
              <Skeleton variant="text" className="w-56 h-3.5" />
            </div>
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[1.25rem] border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <Skeleton variant="text" className="w-3/5 h-4" />
                      <Skeleton variant="text" className="w-1/3 h-3" />
                    </div>
                    <Skeleton variant="rounded" className="h-6 w-16 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* History panel */}
          <div className="rounded-[2rem] border border-slate-200/80 bg-white/70 p-6 dark:border-slate-800 dark:bg-slate-900/60 xl:col-span-2">
            <div className="space-y-2">
              <Skeleton variant="text" className="w-36 h-6" />
              <Skeleton variant="text" className="w-60 h-3.5" />
            </div>
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[1.25rem] border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/30"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1">
                      <Skeleton variant="text" className="w-1/2 h-4" />
                      <Skeleton variant="text" className="w-1/4 h-3" />
                    </div>
                    <Skeleton variant="rounded" className="h-6 w-20 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

