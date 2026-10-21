import type { Clinic, ClinicalMetadata } from '../core/types'
import type { RecordDraft } from '../modules/podologia/model'
import type { PdfKind } from '../modules/podologia/pdf'
import { recordModule } from '../modules/registry'
export type { PdfKind } from '../modules/podologia/pdf'

export const buildPdf = async (record: RecordDraft & ClinicalMetadata, clinic: Clinic, kind: PdfKind = 'complete') => {
  if (record.canExport === false) throw new Error('EXPORT_NOT_ALLOWED')
  return recordModule(record).buildPdf(record, record.exportContext || clinic, kind)
}
export const downloadPdf = async (record: RecordDraft & ClinicalMetadata, clinic: Clinic, kind: PdfKind = 'complete') => {
  if (record.canExport === false) throw new Error('EXPORT_NOT_ALLOWED')
  return recordModule(record).exportPdf(record, record.exportContext || clinic, kind)
}
