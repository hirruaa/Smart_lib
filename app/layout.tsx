import './globals.css'
import CookieConsent from '@/components/CookieConsent'

export const metadata = {
  title: {
    default: 'Smart Lib | Academic Digital Library & Study Workspace',
    template: '%s | Smart Lib',
  },
  description: 'Smart Lib - Role-based academic digital library, e-book lending, study notes, and research assistant.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-paper-100 text-slate-900 antialiased transition-colors duration-300 dark:bg-forest-900 dark:text-paper-100">
        {children}
        <CookieConsent />
      </body>
    </html>
  )
}
