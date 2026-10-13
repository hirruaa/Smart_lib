export type CanonicalAccessMode = 'free' | 'points' | 'premium'
export type StoredAccessMode = CanonicalAccessMode | 'loan' | 'restricted' | string | null | undefined

/**
 * Converts historical database values into the access modes the application
 * supports today. The database migration performs the same normalization for
 * stored rows; this protects screens while older rows are still being read.
 */
export function normalizeAccessMode(value: StoredAccessMode, accessPoints: number | null | undefined): CanonicalAccessMode {
  const mode = String(value ?? '').trim().toLowerCase()
  if (mode === 'premium') return 'premium'
  if (mode === 'points') return 'points'
  if (mode === 'free') return 'free'
  return Number(accessPoints ?? 0) > 0 ? 'points' : 'free'
}

export function getDigitalAccessCost(pointsPerWeek: number, durationDays: number) {
  return Math.ceil(Math.max(0, pointsPerWeek) * Math.max(0, durationDays) / 7)
}

export function isAutomaticDigitalAccess(mode: CanonicalAccessMode) {
  return mode === 'free' || mode === 'points'
}
