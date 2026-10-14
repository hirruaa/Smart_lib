export type StaffRole = 'admin' | 'librarian'

export function isStaffRole(role: unknown): role is StaffRole {
  return role === 'admin' || role === 'librarian'
}
