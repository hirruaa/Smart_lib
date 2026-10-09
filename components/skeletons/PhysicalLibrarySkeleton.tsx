import React from 'react'
import { Skeleton } from './Skeleton'

export function PhysicalLibrarySkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300" role="status" aria-label="Loading physical library catalog">
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <article
            key={i}
            className="rounded-3xl border border-paper-300 bg-white p-5 shadow-sm dark:border-forest-700 dark:bg-forest-900/60"
          >
            <div className="flex gap-4">
              <Skeleton variant="rounded" className="h-36 w-24 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <Skeleton variant="text" className="w-4/5 h-5" />
                    <Skeleton variant="text" className="w-1/2 h-3.5" />
                  </div>
                  <Skeleton variant="rounded" className="h-6 w-28 rounded-full" />
                </div>
                <Skeleton variant="text" className="w-24 h-3" />
                <Skeleton variant="text" className="w-full h-3" />
                <Skeleton variant="text" className="w-3/4 h-3" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-forest-800 flex gap-3">
              <Skeleton variant="rounded" className="h-10 flex-1 rounded-xl" />
              <Skeleton variant="rounded" className="h-10 w-28 rounded-xl" />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

