import type { Clinic, ClinicalMetadata } from '../core/types'
import { blankRecord, recordStructureError, validateRecord } from './podologia/model'
import type { RecordDraft } from './podologia/model'
import type { PdfKind } from './podologia/pdf'
import { blankDentalRecord,validateDentalRecord } from './odontologia/model'
import type { SavedDentalRecord } from './odontologia/model'

// Only installed modules are executable. A catalog row or URL cannot install code.
export const podologyModule = {
  id: 'podologia', name: 'Podología', schemaVersion: 1,
  blank: blankRecord, validate: validateRecord,
  exportPdf: async (record: RecordDraft, clinic: Clinic, kind: PdfKind) => (await import('./podologia/pdf')).downloadPdf(record, clinic, kind),
  buildPdf: async (record: RecordDraft, clinic: Clinic, kind: PdfKind) => (await import('./podologia/pdf')).buildPdf(record, clinic, kind),
}
export const odontologyModule = {
  id:'odontologia' as const,name:'Odontología',schemaVersion:1,blank:blankDentalRecord,validate:validateDentalRecord,
  exportPdf:async(record:SavedDentalRecord,clinic:Clinic)=>(await import('./odontologia/pdf')).downloadDentalPdf(record,clinic),
  buildPdf:async(record:SavedDentalRecord,clinic:Clinic)=>(await import('./odontologia/pdf')).buildDentalPdf(record,clinic),
}
export function resolveSpecialty():typeof podologyModule
export function resolveSpecialty(id:'podologia',schemaVersion?:number):typeof podologyModule
export function resolveSpecialty(id:'odontologia',schemaVersion?:number):typeof odontologyModule
export function resolveSpecialty(id:string|undefined,schemaVersion?:number):typeof podologyModule|typeof odontologyModule
export function resolveSpecialty(id = 'podologia', schemaVersion = 1) {
  if(schemaVersion!==1)throw new Error('UNSUPPORTED_CLINICAL_SCHEMA')
  if(id==='podologia')return podologyModule
  if(id==='odontologia')return odontologyModule
  throw new Error('UNSUPPORTED_CLINICAL_SCHEMA')
}
export function recordModule(record: RecordDraft & ClinicalMetadata) {
  const module = resolveSpecialty(record.specialtyId, record.schemaVersion)
  if(module.id!=='podologia')throw new Error('UNSUPPORTED_CLINICAL_SCHEMA')
  if (recordStructureError(record)) throw new Error('INVALID_RECORD')
  return podologyModule
}
