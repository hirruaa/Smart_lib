export const metadata = {
  title: 'Smart Lib Dashboard',
  description: 'Admin or Student dashboard area',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
