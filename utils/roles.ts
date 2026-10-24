export type StaffRole = 'admin' | 'librarian'

export function isAdminRole(role: unknown): role is 'admin' {
  return role === 'admin'
}

export function isStaffRole(role: unknown): role is StaffRole {
  return role === 'admin' || role === 'librarian'
}

export function dashboardPathForRole(value: unknown): string {
  const role = String(value ?? '').trim().toLowerCase()
  if (role === 'admin' || role === 'administrator') return '/dashboard/admin'
  if (role === 'librarian') return '/dashboard/admin/physical'
  if (role === 'faculty') return '/dashboard/faculty'
  if (role === 'student' || role === 'learner') return '/dashboard/student'
  return '/dashboard'
}
