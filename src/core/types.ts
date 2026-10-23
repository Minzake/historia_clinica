export type Clinic = { name: string; professional: string; address: string; phone: string; email: string; license: string }
export type PatientIdentity = {
  fullName: string; historyNumber: string; dni: string; birthDate: string; address: string
  phone: string; mobile: string; insurance: string; occupation: string; emergencyContact: string; emergencyPhone: string
}
export const blankIdentity = ():PatientIdentity => ({fullName:'',dni:'',historyNumber:'',birthDate:'',address:'',phone:'',mobile:'',insurance:'',occupation:'',emergencyContact:'',emergencyPhone:''})
export type MemberRole = 'owner' | 'professional' | 'reception'
export type SpecialtyAccess = { specialtyId: string; name: string; canRead: boolean; canWrite: boolean; canExport: boolean; scope: 'all' | 'assigned' }
export type Membership = { clinicId: string; role: MemberRole; clinic: Clinic; version: number; specialties?: SpecialtyAccess[] }
export type PatientSummary = { id: string; full_name: string; history_number: string; dni: string; updated_at: string; chart_links?:{specialtyId:string;name:string;action:'open'|'create'}[] }
export type ClinicalMetadata = { specialtyId?: string; schemaVersion?: number; chartId?: string; identityVersion?: number; canWrite?: boolean; canExport?: boolean; exportContext?: Clinic }
export type ClinicalEnvelope<T = unknown> = { specialtyId: string; schemaVersion: number; identity: PatientIdentity; data: T }

export const identityKeys = ['fullName', 'historyNumber', 'dni', 'birthDate', 'address', 'phone', 'mobile', 'insurance', 'occupation', 'emergencyContact', 'emergencyPhone'] as const
export function patientIdentity(value: PatientIdentity): PatientIdentity {
  return Object.fromEntries(identityKeys.map(key => [key, value[key]])) as PatientIdentity
}
