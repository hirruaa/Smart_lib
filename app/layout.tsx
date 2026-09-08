import './globals.css'
import CookieConsent from '@/components/CookieConsent'

export const metadata = {
  title: 'Smart Lib',
  description: 'Smart Lib dashboard and authentication',
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
