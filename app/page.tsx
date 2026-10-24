import Link from 'next/link'
import BrandLogo from '@/components/BrandLogo'
import ThemeToggle from '@/components/ThemeToggle'
import { createClient } from '@/utils/supabase/server'
import { dashboardPathForRole } from '@/utils/roles'
import { redirect } from 'next/navigation'

type IconName = 'book' | 'notes' | 'arrow' | 'check'

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths = {
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M8 7h8M8 11h6"/></>,
    notes: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    arrow: <><path d="M5 12h13M13 6l6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function FeatureCard({ icon, eyebrow, title, description }: { icon: IconName; eyebrow: string; title: string; description: string }) {
  return <article className="landing-feature"><div className="landing-icon"><Icon name={icon}/></div><p className="landing-eyebrow">{eyebrow}</p><h3>{title}</h3><p className="landing-muted">{description}</p></article>
}

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    redirect(dashboardPathForRole(profile?.role))
  }

  return <main className="landing-page school-landing">
    <header className="landing-nav">
      <Link href="/" aria-label="Mary the Queen College home"><BrandLogo iconSize="sm"/></Link>
      <div className="landing-nav-actions"><ThemeToggle/><Link href="/login" className="landing-button landing-button-small">Sign in <Icon name="arrow" size={16}/></Link></div>
    </header>

    <section className="landing-combined" id="about">
      <div className="landing-hero landing-hero-compact">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Start with the library</p>
          <h1>Your next discovery <span>starts here.</span></h1>
          <p>Sign in to access your account and continue learning with the college library.</p>
          <div className="landing-hero-actions"><Link href="/login" className="landing-button">Sign in to continue <Icon name="arrow" size={19}/></Link></div>
        </div>
      </div>
      <div className="landing-feature-grid" id="services"><FeatureCard icon="book" eyebrow="01 · DISCOVER" title="Find useful resources" description="Explore the collection and locate materials for your courses, interests, and research."/><FeatureCard icon="notes" eyebrow="02 · READ & STUDY" title="Keep your study work close" description="Read online, track your progress, and organize notes as you work through a book."/><FeatureCard icon="check" eyebrow="03 · GET SUPPORT" title="Stay connected to the library" description="Manage borrowing activity and get help from the library tools when you need it."/></div>
    </section>
    <footer className="landing-footer"><BrandLogo iconSize="sm"/><p>Learn. Serve. Lead.</p><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/cookies">Cookies</Link><span>© {new Date().getFullYear()} Mary the Queen College</span></div></footer>
  </main>
}
