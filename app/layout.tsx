import './globals.css'
import CookieConsent from '@/components/CookieConsent'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Mary the Queen College of Quezon City | Digital Library',
    template: '%s | Mary the Queen College',
  },
  description: 'The digital library of Mary the Queen College of Quezon City. Discover learning resources, manage your reading, and access academic support.',
  openGraph: {
    type: 'website',
    siteName: 'Mary the Queen College of Quezon City',
    title: 'Mary the Queen College of Quezon City | Digital Library',
    description: 'Discover learning resources and academic support from the Mary the Queen College digital library.',
  },
  twitter: {
    card: 'summary',
    title: 'Mary the Queen College of Quezon City | Digital Library',
    description: 'Discover learning resources and academic support from the Mary the Queen College digital library.',
  },
  icons: {
    icon: '/icon.png',
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
            __html: `(() => { try { document.documentElement.dataset.theme = 'school'; const mode = localStorage.getItem('smartlib-theme'); if (mode === 'dark' || (!mode && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark'); } catch (error) { document.documentElement.dataset.theme = 'school'; } })()`,
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
