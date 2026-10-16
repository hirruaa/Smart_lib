export type CanonicalAccessMode = 'free' | 'points' | 'premium'
export type StoredAccessMode = CanonicalAccessMode | 'loan' | 'restricted' | string | null | undefined

export const DIGITAL_ACCESS_DURATION_OPTIONS = [1, 3, 7, 14, 30] as const
export const PHYSICAL_LOAN_DURATION_OPTIONS = [14] as const
export type DigitalAccessCosts = Partial<Record<`${typeof DIGITAL_ACCESS_DURATION_OPTIONS[number]}`, number>>

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

export function getDigitalAccessCost(accessCostsOrPointsPerWeek: DigitalAccessCosts | number | null | undefined, durationDays: number, fallbackPointsPerWeek = 0) {
  if (typeof accessCostsOrPointsPerWeek === 'object' && accessCostsOrPointsPerWeek !== null) {
    const configured = accessCostsOrPointsPerWeek[String(durationDays) as keyof DigitalAccessCosts]
    if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 0) return configured
  }
  const pointsPerWeek = typeof accessCostsOrPointsPerWeek === 'number' ? accessCostsOrPointsPerWeek : fallbackPointsPerWeek
  return Math.ceil(Math.max(0, pointsPerWeek) * Math.max(0, durationDays) / 7)
}

export function isAutomaticDigitalAccess(mode: CanonicalAccessMode) {
  return mode === 'free' || mode === 'points'
}
