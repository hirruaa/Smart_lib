"use client"

import { useEffect, useRef, useState } from 'react'

const themes = [
  { id: 'ink', label: 'Ink Black', color: '#262626' },
  { id: 'sage', label: 'Sage Green', color: '#78938a' },
  { id: 'maroon', label: 'Maroon', color: '#7d3f4d' },
  { id: 'cocoa', label: 'Cocoa Brown', color: '#8b6a55' },
  { id: 'blush', label: 'Blush Pink', color: '#d98296' },
] as const

type ThemeId = (typeof themes)[number]['id']

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)
  const [theme, setTheme] = useState<ThemeId>('sage')
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const savedMode = localStorage.getItem('smartlib-theme')
    const savedPalette = localStorage.getItem('smartlib-palette') as ThemeId | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initialDark = savedMode ? savedMode === 'dark' : prefersDark
    const initialPalette = themes.some((item) => item.id === savedPalette) ? savedPalette as ThemeId : 'sage'
    setIsDark(initialDark)
    setTheme(initialPalette)
    document.documentElement.classList.toggle('dark', initialDark)
    document.documentElement.dataset.theme = initialPalette
  }, [])

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const toggleDark = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('smartlib-theme', next ? 'dark' : 'light')
  }

  const chooseTheme = (next: ThemeId) => {
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('smartlib-palette', next)
    setOpen(false)
  }

  return (
    <div className="theme-picker" ref={menuRef}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="theme-picker-trigger" aria-label="Choose color theme" aria-expanded={open}>
        <span className="theme-picker-swatch" style={{ backgroundColor: themes.find((item) => item.id === theme)?.color }} />
        <span className="theme-picker-label">Theme</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m5 7 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <div className="theme-picker-menu" role="menu">
        <p>Choose your color</p>
        {themes.map((item) => <button type="button" role="menuitem" key={item.id} onClick={() => chooseTheme(item.id)} className={`theme-picker-option ${theme === item.id ? 'is-selected' : ''}`}><span className="theme-picker-swatch" style={{ backgroundColor: item.color }} />{item.label}{theme === item.id && <span className="theme-picker-check">✓</span>}</button>)}
        <button type="button" onClick={toggleDark} className="theme-picker-mode"><span>{isDark ? '☀' : '☾'}</span>{isDark ? 'Use light mode' : 'Use dark mode'}</button>
      </div>}
    </div>
  )
}
