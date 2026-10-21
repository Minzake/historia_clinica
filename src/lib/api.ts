import { database } from './supabase'
import { ageAt, readClinic, validateRecord } from './model'
import type { Membership, PatientSummary, RecordDraft, Revision, SavedRecord, Clinic } from './model'
import { validateClinic } from './validation'
import type { ClinicalMetadata } from '../core/types'
import { recordModule } from '../modules/registry'

export async function getMemberships(): Promise<Membership[]> {
  const { data, error } = await database().rpc('list_my_memberships')
  if (error) throw error
  if (!Array.isArray(data) || data.some(item => !Array.isArray(item.specialties))) throw new Error('INVALID_MEMBERSHIPS')
  return data.map(item => ({ ...item, clinic: readClinic(item.clinic) })) as Membership[]
}

export async function listPatients(clinicId: string, search = '', page = 0, pageSize = 12) {
  const { data, error } = await database().rpc('list_clinical_patients', { p_clinic_id: clinicId, p_query: search.trim().slice(0, 100), p_page: page, p_page_size: pageSize })
  if (error) throw error
  return data as { patients: PatientSummary[]; count: number }
}

export async function getDashboard(clinicId: string) {
  const { data, error } = await database().rpc('get_clinic_dashboard', { p_clinic_id: clinicId })
  if (error) throw error
  return data as { patients: PatientSummary[]; count: number; evolutions: number }
}

export async function getRecord(id: string, clinicId:string): Promise<SavedRecord> {
  const { data, error } = await database().rpc('get_clinical_chart', { p_patient_id: id, p_specialty_id:'podologia',p_export:false,p_clinic_id:clinicId })
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  recordModule(data as SavedRecord)
  return data as SavedRecord
}

export async function saveRecord(clinicId: string, record: RecordDraft, id: string | null, version: number, metadata?: ClinicalMetadata): Promise<SavedRecord> {
  recordModule({ ...record, ...metadata })
  const errors = validateRecord(record)
  if (errors.length) throw new Error(errors.join(' '))
  const normalized = structuredClone(record)
  normalized.patient.fullName = normalized.patient.fullName.trim()
  normalized.patient.dni = normalized.patient.dni.replace(/[.\s-]/g, '')
  normalized.clinical.weight = normalized.clinical.weight.trim()
  normalized.clinical.height = normalized.clinical.height.trim()
  if (normalized.patient.birthDate) normalized.patient.age = ageAt(normalized.patient.birthDate, normalized.patient.date)
  const { data, error } = await database().rpc('save_patient_record', {
    p_clinic_id: clinicId, p_patient_id: id, p_expected_version: version,
    p_record: { ...normalized, specialtyId: metadata?.specialtyId || 'podologia', schemaVersion: metadata?.schemaVersion ?? 1, identityVersion: metadata?.identityVersion ?? version },
  })
  if (error) throw error
  return data as SavedRecord
}

export async function saveClinic(membership: Membership, clinic: Clinic): Promise<Membership> {
  const validation = validateClinic(clinic)
  if (validation) throw new Error(validation)
  const { data, error } = await database().rpc('save_clinic_settings', {
    p_clinic_id: membership.clinicId, p_expected_version: membership.version, p_settings: clinic,
  })
  if (error) throw error
  return { ...membership, clinic: readClinic(data.settings), version: data.version }
}

export async function listRevisions(patientId: string, clinicId:string) {
  const { data, error } = await database().rpc('list_chart_versions', { p_patient_id: patientId, p_specialty_id: 'podologia',p_clinic_id:clinicId })
  if (error) throw error
  return data as Omit<Revision, 'snapshot'>[]
}

export async function getRevision(patientId: string, id: number, clinicId:string) {
  const { data, error } = await database().rpc('get_chart_revision', { p_patient_id: patientId, p_version_id: id,p_clinic_id:clinicId })
  if (error) throw error
  recordModule(data as RecordDraft)
  return data as RecordDraft & ClinicalMetadata
}

export async function getExportRecord(patientId:string,clinicId:string,expectedVersion:number):Promise<SavedRecord> {
  const {data,error}=await database().rpc('get_clinical_chart',{p_patient_id:patientId,p_specialty_id:'podologia',p_export:true,p_clinic_id:clinicId})
  if(error)throw error
  if(data.version!==expectedVersion)throw new Error('CONFLICT')
  recordModule(data as SavedRecord)
  return data as SavedRecord
}
