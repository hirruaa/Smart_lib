import './globals.css'
import CookieConsent from '@/components/CookieConsent'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Smart Lib | Academic Digital Library & Study Workspace',
    template: '%s | Smart Lib',
  },
  description: 'Smart Lib - Role-based academic digital library, e-book lending, study notes, and research assistant.',
  openGraph: {
    type: 'website',
    siteName: 'Smart Lib',
    title: 'Smart Lib | Academic Digital Library & Study Workspace',
    description: 'Explore library resources, read, and keep your study work together in Smart Lib.',
  },
  twitter: {
    card: 'summary',
    title: 'Smart Lib | Academic Digital Library & Study Workspace',
    description: 'Explore library resources, read, and keep your study work together in Smart Lib.',
  },
  icons: {
    icon: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const palette = localStorage.getItem('smartlib-palette'); const mode = localStorage.getItem('smartlib-theme'); if (palette) document.documentElement.dataset.theme = palette; if (mode === 'dark' || (!mode && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark'); } catch (error) {} })()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-paper-100 text-slate-900 antialiased transition-colors duration-300 dark:bg-forest-900 dark:text-paper-100">
        {children}
        <CookieConsent />
      </body>
    </html>
  )
}
