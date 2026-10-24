"use client"

import { useEffect, useState } from 'react'

function AppearanceIcon({ dark }: { dark: boolean }) {
  return dark
    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.5 15.3A8.5 8.5 0 0 1 8.7 3.5 8.5 8.5 0 1 0 20.5 15.3Z" /></svg>
    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
}

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const savedMode = localStorage.getItem('smartlib-theme')
    const initialDark = savedMode ? savedMode === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDark(initialDark)
    document.documentElement.classList.toggle('dark', initialDark)
    document.documentElement.dataset.theme = 'school'
  }, [])

  const toggleDark = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    document.documentElement.dataset.theme = 'school'
    localStorage.setItem('smartlib-theme', next ? 'dark' : 'light')
    localStorage.setItem('smartlib-palette', 'school')
  }

  return <button type="button" onClick={toggleDark} className="school-mode-toggle" aria-label={isDark ? 'Use light appearance' : 'Use dark appearance'} title={isDark ? 'Use light appearance' : 'Use dark appearance'}>
    <span aria-hidden="true" className="school-mode-icon"><AppearanceIcon dark={isDark} /></span>
    <span className="school-mode-label">{isDark ? 'Light' : 'Dark'}</span>
  </button>
}
