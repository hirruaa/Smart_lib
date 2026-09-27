"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import BrandLogo from '@/components/BrandLogo'
import ThemeToggle from '@/components/ThemeToggle'

type IconName = 'book' | 'sparkles' | 'notes' | 'arrow' | 'check' | 'play'

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths = {
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M8 7h8M8 11h6" /></>,
    sparkles: <><path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3ZM19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></>,
    notes: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z" /><path d="M5 5v16.5M9 7h6M9 11h6M9 15h4" /></>,
    arrow: <><path d="M5 12h13M13 6l6 6-6 6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    play: <path d="m9 6 9 6-9 6V6Z" />,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function FeatureCard({ icon, eyebrow, title, description, tone }: { icon: IconName; eyebrow: string; title: string; description: string; tone: 'pink' | 'lavender' | 'mint' }) {
  return <article className={`landing-feature landing-feature-${tone}`}><div className="landing-icon"><Icon name={icon} /></div><p className="landing-eyebrow">{eyebrow}</p><h3>{title}</h3><p className="landing-muted">{description}</p><span className="landing-feature-link">Explore feature <Icon name="arrow" size={17} /></span></article>
}

export default function Home() {
  const [greeting, setGreeting] = useState('Good morning')

  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')
  }, [])

  return <main className="landing-page">
    <header className="landing-nav"><Link href="/" aria-label="Smart Lib home"><BrandLogo iconSize="sm" /></Link><nav className="landing-nav-links" aria-label="Main navigation"><a href="#features">Features</a><a href="#how-it-works">How it works</a><a href="#about">About</a></nav><div className="landing-nav-actions"><ThemeToggle /><Link href="/register" className="landing-text-button">Sign up</Link><Link href="/login" className="landing-button landing-button-small">Sign in <Icon name="arrow" size={16} /></Link></div></header>

    <section className="landing-hero" id="about"><div className="landing-hero-copy"><h1>Make room for your <span>best ideas.</span></h1><p>Smart Lib brings your academic library, notes, and research tools together in one calm, joyful workspace.</p><div className="landing-hero-actions"><Link href="/register" className="landing-button">Start learning free <Icon name="arrow" size={19} /></Link><a href="#how-it-works" className="landing-play-link"><span className="landing-play"><Icon name="play" size={14} /></span> See how it works</a></div><div className="landing-trust"><span className="landing-avatars"><i>J</i><i>M</i><i>A</i></span><span><strong>Loved by curious learners</strong><br />Built for focused study</span></div></div>
      <div className="landing-hero-art" aria-label="Study workspace preview"><div className="landing-orbit landing-orbit-one" /><div className="landing-orbit landing-orbit-two" /><div className="landing-float-card landing-float-card-top"><span className="landing-mini-icon pink"><Icon name="sparkles" size={17} /></span><span><b>Small steps</b><small>big progress</small></span></div><div className="landing-dashboard-card"><div className="landing-card-top"><span className="landing-card-label">Your library</span><span className="landing-card-dots">•••</span></div><div className="landing-card-heading"><h2>{greeting}</h2><span>✦</span></div><p className="landing-card-subtitle">Ready to continue your learning journey?</p><div className="landing-progress"><div><span>Weekly focus</span><strong>68%</strong></div><div className="landing-progress-track"><span /></div></div><div className="landing-book-row"><div className="landing-book-cover pink-cover"><Icon name="book" size={27} /></div><div><b>Designing Better Habits</b><small>Continue reading · 42 min left</small></div><span className="landing-arrow-circle"><Icon name="arrow" size={16} /></span></div><div className="landing-book-row"><div className="landing-book-cover lavender-cover"><Icon name="notes" size={27} /></div><div><b>Research Methods 101</b><small>4 new notes to review</small></div><span className="landing-arrow-circle"><Icon name="arrow" size={16} /></span></div></div><div className="landing-float-card landing-float-card-bottom"><span className="landing-check"><Icon name="check" size={15} /></span><span><b>Study streak</b><small>7 days in a row</small></span><strong>+12%</strong></div><span className="landing-sparkle landing-sparkle-one">✦</span><span className="landing-sparkle landing-sparkle-two">✧</span></div></section>

    <section className="landing-features" id="features"><div className="landing-section-heading"><div><p className="landing-eyebrow">Everything in one place</p><h2>Tools that make learning <span>feel lighter.</span></h2></div><p className="landing-muted">Thoughtfully designed for the way you learn, read, and grow.</p></div><div className="landing-feature-grid"><FeatureCard icon="book" eyebrow="01 · Your library" title="Find your next favorite read" description="Browse a thoughtfully organized collection and borrow what sparks your curiosity." tone="pink" /><FeatureCard icon="notes" eyebrow="02 · Your workspace" title="Turn reading into progress" description="Highlight, write, and keep every important idea close at hand." tone="lavender" /><FeatureCard icon="sparkles" eyebrow="03 · Your assistant" title="A little help, right on time" description="Get friendly, context-aware support whenever you need a nudge forward." tone="mint" /></div></section>

    <section className="landing-workflow" id="how-it-works"><div className="landing-workflow-copy"><p className="landing-eyebrow">A better rhythm for learning</p><h2>Less hunting.<br /><span>More discovering.</span></h2><p className="landing-muted">From the first page to the final insight, Smart Lib helps you stay organized and in the flow.</p><Link href="/register" className="landing-outline-button">Create your space <Icon name="arrow" size={18} /></Link></div><div className="landing-workflow-list"><div><span>01</span><p><b>Choose what interests you</b><small>Explore a library made for curious minds.</small></p></div><div><span>02</span><p><b>Make it yours</b><small>Save thoughts, highlights, and notes as you go.</small></p></div><div><span>03</span><p><b>Keep moving forward</b><small>Return to your ideas whenever inspiration strikes.</small></p></div></div></section>
    <footer className="landing-footer"><BrandLogo iconSize="sm" showText={true} /><p>Make room for your best ideas.</p><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><span>© {new Date().getFullYear()} Smart Lib</span></div></footer>
  </main>
}
