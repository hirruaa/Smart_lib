import { useEffect, useState } from 'react'

/**
 * Custom hook to debounce a fast-changing value (e.g. search input).
 * Prevents expensive re-calculations and layout reflows on every keystroke.
 */
export function useDebounce<T>(value: T, delayMs: number = 250): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delayMs])

  return debouncedValue
}

