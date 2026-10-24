export type StaffRole = 'admin' | 'librarian'

export function isAdminRole(role: unknown): role is 'admin' {
  return role === 'admin'
}

export function isStaffRole(role: unknown): role is StaffRole {
  return role === 'admin' || role === 'librarian'
}
