'use client'

import type { CSSProperties, ReactNode } from 'react'

type ReaderContentProtectionProps = {
  viewerLabel: string
  children: ReactNode
}

export default function ReaderContentProtection({ viewerLabel, children }: ReaderContentProtectionProps) {
  return (
    <div
      className="reader-protected-content"
      onContextMenu={(event) => event.preventDefault()}
      style={{ '--reader-watermark': JSON.stringify(viewerLabel) } as CSSProperties}
    >
      {children}
    </div>
  )
}
