import type { Membership } from './types'
import { specialtyAccess } from './access'

export const installedSpecialties = [{id:'podologia',name:'Podología'},{id:'odontologia',name:'Odontología'}] as const
export function writableSpecialties(membership: Membership) { return installedSpecialties.filter(s => specialtyAccess(membership,s.id)?.canWrite) }
export function chartUrl(patientId: string, specialtyId = 'podologia', create = false) {
  if(create) return `/historias/nueva?paciente=${encodeURIComponent(patientId)}&especialidad=${specialtyId}`
  return `/historias/${patientId}${specialtyId==='podologia'?'':`?especialidad=${specialtyId}`}`
}
export const newChartUrl = (specialtyId = 'podologia') => `/historias/nueva${specialtyId==='podologia'?'':`?especialidad=${specialtyId}`}`
