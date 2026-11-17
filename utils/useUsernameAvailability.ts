import { useEffect, useState } from 'react'
import { useDebounce } from '@/utils/useDebounce'

export type UsernameAvailability = 'idle' | 'checking' | 'available' | 'taken' | 'error'

type UsernameAvailabilityResult = {
  status: UsernameAvailability
  errorMessage: string | null
  retry: () => void
}

const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,29}$/

export function useUsernameAvailability(username: string): UsernameAvailabilityResult {
  const normalizedUsername = username.trim().toLowerCase()
  const debouncedUsername = useDebounce(normalizedUsername, 350)
  const [status, setStatus] = useState<UsernameAvailability>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retrySequence, setRetrySequence] = useState(0)

  useEffect(() => {
    if (!usernamePattern.test(debouncedUsername)) {
      setStatus('idle')
      setErrorMessage(null)
      return
    }

    const controller = new AbortController()
    setStatus('checking')
    setErrorMessage(null)

    const checkAvailability = async () => {
      try {
        const response = await fetch(
          `/api/admin/students/username-availability?username=${encodeURIComponent(debouncedUsername)}`,
          { signal: controller.signal },
        )
        const result = await response.json().catch(() => null) as { available?: unknown; error?: unknown } | null
        if (!response.ok || typeof result?.available !== 'boolean') {
          const message = typeof result?.error === 'string'
            ? result.error.slice(0, 200)
            : 'Unable to check username availability.'
          throw new Error(message)
        }
        setStatus(result.available ? 'available' : 'taken')
      } catch (cause) {
        if (controller.signal.aborted) return
        setStatus('error')
        setErrorMessage(cause instanceof Error ? cause.message : 'Unable to check username availability.')
      }
    }

    void checkAvailability()
    return () => controller.abort()
  }, [debouncedUsername, retrySequence])

  const retry = () => setRetrySequence((sequence) => sequence + 1)
  if (!usernamePattern.test(normalizedUsername)) return { status: 'idle', errorMessage: null, retry }
  if (normalizedUsername !== debouncedUsername) return { status: 'checking', errorMessage: null, retry }
  return { status, errorMessage, retry }
}
