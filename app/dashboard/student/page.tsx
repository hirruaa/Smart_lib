'use client'

export const dynamic = 'force-dynamic'

import MemberDashboard from '@/components/MemberDashboard'

export default function StudentDashboardPage() {
  return <MemberDashboard memberType="student" />
}
