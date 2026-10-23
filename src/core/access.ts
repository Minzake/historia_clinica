import type { Membership } from './types'

export function specialtyAccess(membership: Membership, specialtyId = 'podologia') {
  // Undefined is the pre-migration DTO, used by the compatibility adapter only.
  // The new membership RPC always returns an explicit array, including [].
  if (membership.specialties === undefined) return membership.role === 'reception'||specialtyId!=='podologia' ? undefined : { specialtyId, name: 'Podología', canRead: true, canWrite: true, canExport: true, scope: 'all' as const }
  return membership.specialties.find(item => item.specialtyId === specialtyId)
}
export const canReadClinical = (membership: Membership) => membership.specialties === undefined ? membership.role !== 'reception' : membership.specialties.some(item => item.canRead)
export const canCreateClinical = (membership: Membership, specialtyId = 'podologia') => Boolean(specialtyAccess(membership, specialtyId)?.canWrite)
