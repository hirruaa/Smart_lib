import { useEffect, useState } from 'react'
import { useDebounce } from '@/utils/useDebounce'

export type UsernameAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'error'

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,29}$/

export function useUsernameAvailability(username: string): UsernameAvailability {
  const normalizedUsername = username.trim().toLowerCase()
  const debouncedUsername = useDebounce(normalizedUsername, 350)
  const [status, setStatus] = useState<UsernameAvailability>('idle')

  useEffect(() => {
    if (!usernamePattern.test(debouncedUsername)) {
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    setStatus('checking')

    const checkAvailability = async () => {
      try {
        const response = await fetch(
          `/api/admin/students/username-availability?username=${encodeURIComponent(debouncedUsername)}`,
          { signal: controller.signal },
        )
        const result = await response.json().catch(() => null) as { available?: unknown } | null
        if (!response.ok || typeof result?.available !== 'boolean') {
          throw new Error('Unable to check username availability.')
        }
        setStatus(result.available ? 'available' : 'taken')
      } catch {
        if (!controller.signal.aborted) setStatus('error')
      }
    }

    void checkAvailability()
    return () => controller.abort()
  }, [debouncedUsername])

  if (!usernamePattern.test(normalizedUsername)) return 'idle'
  return normalizedUsername === debouncedUsername ? status : 'checking'
}
