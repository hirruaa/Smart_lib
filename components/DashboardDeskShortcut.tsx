'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const deskPath = '/dashboard/admin/physical'

export default function DashboardDeskShortcut() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname.startsWith('/dashboard/admin')) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isEditing = target instanceof HTMLElement
        && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      const isShortcut = !isEditing && (
        (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey)
        || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')
      )
      if (!isShortcut) return
      event.preventDefault()
      if (pathname === deskPath) {
        window.dispatchEvent(new CustomEvent('dashboard:focus-student-id'))
        return
      }
      router.push(`${deskPath}?focusStudentId=1`)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pathname, router])

  return null
}
