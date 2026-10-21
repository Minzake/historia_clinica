import type { Clinic, ClinicalMetadata } from '../core/types'
import { blankRecord, recordStructureError, validateRecord } from './podologia/model'
import type { RecordDraft } from './podologia/model'
import type { PdfKind } from './podologia/pdf'

// Only installed modules are executable. A catalog row or URL cannot install code.
export const podologyModule = {
  id: 'podologia', name: 'Podología', schemaVersion: 1,
  blank: blankRecord, validate: validateRecord,
  exportPdf: async (record: RecordDraft, clinic: Clinic, kind: PdfKind) => (await import('./podologia/pdf')).downloadPdf(record, clinic, kind),
  buildPdf: async (record: RecordDraft, clinic: Clinic, kind: PdfKind) => (await import('./podologia/pdf')).buildPdf(record, clinic, kind),
}
export function resolveSpecialty(id = 'podologia', schemaVersion = 1) {
  if (id !== podologyModule.id || schemaVersion !== podologyModule.schemaVersion) throw new Error('UNSUPPORTED_CLINICAL_SCHEMA')
  return podologyModule
}
export function recordModule(record: RecordDraft & ClinicalMetadata) {
  const module = resolveSpecialty(record.specialtyId, record.schemaVersion)
  if (recordStructureError(record)) throw new Error('INVALID_RECORD')
  return module
}
