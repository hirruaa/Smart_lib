import React from 'react'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  variant?: 'rectangular' | 'rounded' | 'circular' | 'text'
}

/**
 * Modern, theme-aware Skeleton primitive for Mary the Queen College.
 * Seamlessly blends with the library's warm paper & pine forest design system.
 */
export function Skeleton({
  className = '',
  variant = 'rounded',
  ...props
}: SkeletonProps) {
  const variantStyles = {
    rectangular: 'rounded-none',
    rounded: 'rounded-xl',
    circular: 'rounded-full',
    text: 'rounded-md h-4 my-1',
  }

  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden bg-slate-200/70 dark:bg-slate-700/50 before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent dark:before:via-white/10 ${variantStyles[variant]} ${className}`}
      {...props}
    />
  )
}

export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          variant="text"
          className={
            index === lines - 1 && lines > 1
              ? 'w-3/5 h-3.5'
              : index === 0
              ? 'w-full h-4'
              : 'w-4/5 h-3.5'
          }
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-2xl border border-slate-200/80 bg-white/60 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 ${className}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" className="w-24 h-3.5" />
          <Skeleton variant="text" className="w-3/4 h-5" />
        </div>
        <Skeleton variant="circular" className="h-10 w-10 shrink-0" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton variant="text" className="w-full h-3" />
        <Skeleton variant="text" className="w-2/3 h-3" />
      </div>
    </div>
  )
}

