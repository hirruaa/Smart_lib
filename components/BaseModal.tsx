'use client'

import { ReactNode, useEffect, useRef } from 'react'

type BaseModalProps = {
  open: boolean
  title: string
  eyebrow?: string
  description?: string
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' }

export default function BaseModal({ open, title, eyebrow, description, onClose, children, size = 'md' }: BaseModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    triggerRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab') return
      const dialog = closeRef.current?.closest('[role="dialog"]')
      if (!dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('keydown', handleKeyDown); document.body.style.overflow = previousOverflow; triggerRef.current?.focus() }
  }, [onClose, open])

  if (!open) return null
  const titleId = `modal-title-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const descriptionId = description ? `${titleId}-description` : undefined
  return (
    <div className="base-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`base-modal ${sizeClasses[size]}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <header className="base-modal-header"><div>{eyebrow ? <p className="base-modal-eyebrow">{eyebrow}</p> : null}<h2 id={titleId}>{title}</h2>{description ? <p id={descriptionId} className="base-modal-description">{description}</p> : null}</div><button ref={closeRef} type="button" className="base-modal-close" onClick={onClose} aria-label={`Close ${title}`}>&times;</button></header>
        <div className="base-modal-content">{children}</div>
      </section>
    </div>
  )
}
