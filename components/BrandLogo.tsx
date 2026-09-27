import React from 'react'

interface BrandLogoProps {
  className?: string
  iconSize?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  subtitle?: string
}

export default function BrandLogo({
  className = '',
  iconSize = 'md',
  showText = true,
  subtitle,
}: BrandLogoProps) {
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-xl',
  }

  const iconDim = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-8 w-8',
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        className={`brand-logo-mark flex ${sizeClasses[iconSize]} items-center justify-center rounded-2xl shadow-md transition-transform duration-200 hover:scale-105`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={iconDim[iconSize]}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M4 6h16M8 10h8M8 14h5" strokeLinecap="round" />
          <path
            d="M6 22a2 2 0 0 1-2-2v-1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      {showText && (
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="brand-logo-name font-serif text-lg font-bold tracking-tight sm:text-xl">
              Smart<span className="brand-logo-accent">Lib</span>
            </span>
          </div>
          {subtitle ? (
            <span className="brand-logo-subtitle text-[11px] font-medium">
              {subtitle}
            </span>
          ) : (
            <span className="brand-logo-subtitle text-[11px] font-medium tracking-wide">
              Academic Digital Library
            </span>
          )}
        </div>
      )}
    </div>
  )
}
