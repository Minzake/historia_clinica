import { database } from '../lib/supabase'
import type { PatientIdentity } from './types'

export type AdministrativePatient = { id: string; version: number; full_name: string; dni: string; history_number: string; details: Omit<PatientIdentity,'fullName'|'dni'|'historyNumber'>; chart_links?:{specialtyId:string;name:string;action:'open'|'create'}[]; assignment_charts?:{id:string;name:string}[] }
export const blankIdentity = (): PatientIdentity => ({ fullName:'',dni:'',historyNumber:'',birthDate:'',address:'',phone:'',mobile:'',insurance:'',occupation:'',emergencyContact:'',emergencyPhone:'' })
export const identityFromPatient = (patient: AdministrativePatient): PatientIdentity => ({ ...blankIdentity(), ...patient.details, fullName:patient.full_name,dni:patient.dni,historyNumber:patient.history_number })
export async function getPatientIdentity(clinicId: string, patientId: string) {
  const { data,error }=await database().rpc('get_patient_identity',{p_clinic_id:clinicId,p_patient_id:patientId})
  if(error)throw error
  return data as AdministrativePatient
}
export async function listPatientIdentities(clinicId:string,query='',page=0) {
  const {data,error}=await database().rpc('list_patient_identities',{p_clinic_id:clinicId,p_query:query,p_page:page})
  if(error)throw error
  return data as {patients:AdministrativePatient[];count:number}
}
export async function savePatientIdentity(clinicId:string,initial:AdministrativePatient|null,identity:PatientIdentity) {
  const {data,error}=await database().rpc('save_patient_identity',{p_clinic_id:clinicId,p_patient_id:initial?.id||null,p_expected_version:initial?.version||0,p_identity:identity})
  if(error)throw error
  return data as string
}
