import { database } from './supabase'
import { ageAt, readClinic } from './model'
import type { Membership, PatientSummary, RecordDraft, Revision, SavedRecord, Clinic } from './model'
import { validateClinic } from './validation'

export async function getMembership(userId: string): Promise<Membership | null> {
  const { data, error } = await database().from('clinic_members').select('clinic_id, role, clinics(settings, version)').eq('user_id', userId).eq('active',true).maybeSingle()
  if (error) throw error
  if (!data) return null
  const clinic = data.clinics as unknown as { settings: unknown; version: number }
  return { clinicId: data.clinic_id, role: data.role, clinic: readClinic(clinic.settings), version: clinic.version }
}

export async function listPatients(clinicId: string, search = '', page = 0, pageSize = 12) {
  let query = database().from('patients').select('id, full_name, history_number, dni, updated_at', { count: 'exact' }).eq('clinic_id', clinicId)
  // Strip PostgREST filter operators and LIKE wildcards before interpolating the OR filter.
  const term = search.trim().replace(/[^\p{L}\p{N}\s.-]/gu, '').slice(0, 100)
  if (search.trim() && !term) return { patients: [], count: 0 }
  if (term) {
    const folded = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
    const clauses = [`full_name_search.ilike.%${folded}%`, `history_number.ilike.%${term}%`]
    const digits = term.replace(/[.\s-]/g, '')
    if (/^\d+$/.test(digits)) clauses.push(`dni.ilike.%${digits}%`)
    query = query.or(clauses.join(','))
  }
  const { data, error, count } = await query.order('updated_at', { ascending: false }).order('id').range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw error
  return { patients: data as PatientSummary[], count: count || 0 }
}

export async function getDashboard(clinicId: string) {
  const recent = await listPatients(clinicId, '', 0, 5)
  const { count, error } = await database().from('evolutions').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).is('archived_at', null)
  if (error) throw error
  return { ...recent, evolutions: count || 0 }
}

export async function getRecord(id: string): Promise<SavedRecord> {
  const { data, error } = await database().rpc('get_patient_record', { p_patient_id: id })
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data as SavedRecord
}

export async function saveRecord(clinicId: string, record: RecordDraft, id: string | null, version: number): Promise<SavedRecord> {
  const normalized = structuredClone(record)
  normalized.patient.fullName = normalized.patient.fullName.trim()
  normalized.patient.dni = normalized.patient.dni.replace(/[.\s-]/g, '')
  normalized.clinical.weight = normalized.clinical.weight.trim()
  normalized.clinical.height = normalized.clinical.height.trim()
  if (normalized.patient.birthDate) normalized.patient.age = ageAt(normalized.patient.birthDate, normalized.patient.date)
  const { data, error } = await database().rpc('save_patient_record', {
    p_clinic_id: clinicId, p_patient_id: id, p_expected_version: version, p_record: normalized,
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

export async function listRevisions(patientId: string) {
  const { data, error } = await database().from('clinical_record_versions')
    .select('id, version, recorded_at').eq('patient_id', patientId).order('version', { ascending: false }).limit(30)
  if (error) throw error
  return data as Omit<Revision, 'snapshot'>[]
}

export async function getRevision(patientId: string, id: number) {
  const { data, error } = await database().from('clinical_record_versions').select('snapshot')
    .eq('patient_id', patientId).eq('id', id).single()
  if (error) throw error
  return data.snapshot as RecordDraft
}
