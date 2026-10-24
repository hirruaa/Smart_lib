import React from 'react'

interface BrandLogoProps {
  className?: string
  iconSize?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  subtitle?: string
}

const sizes = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14', xl: 'h-[4.5rem] w-[4.5rem]' }

export default function BrandLogo({ className = '', iconSize = 'md', showText = true, subtitle }: BrandLogoProps) {
  return (
    <div className={`school-brand ${className}`}>
      <span className={`school-brand-seal ${sizes[iconSize]}`} aria-hidden="true">
        <img src="/mary-the-queen-college-crest.jpg" alt="" />
      </span>
      {showText && <span className="school-brand-copy">
        <span className="school-brand-name">Mary the Queen <span>College</span></span>
        <span className="school-brand-subtitle">{subtitle || 'of Quezon City'}</span>
      </span>}
    </div>
  )
}
