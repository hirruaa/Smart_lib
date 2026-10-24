export const metadata = {
  title: 'College Library Dashboard',
  description: 'Secure workspace for students, faculty, librarians, and administrators.',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
