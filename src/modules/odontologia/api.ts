import { database } from '../../lib/supabase'
import { patientIdentity } from '../../core/types'
import { validateDentalRecord } from './model'
import type { DentalRecord, SavedDentalRecord } from './model'

export function checkedDentalRecord(value:unknown):SavedDentalRecord {
  const record=value as SavedDentalRecord
  if(record?.specialtyId!=='odontologia'||record.schemaVersion!==1)throw new Error('UNSUPPORTED_CLINICAL_SCHEMA')
  const error=validateDentalRecord(record);if(error)throw new Error(error)
  return record
}
export async function getDentalRecord(clinicId:string,patientId:string,exporting=false) {
  const {data,error}=await database().rpc('get_clinical_chart',{p_patient_id:patientId,p_specialty_id:'odontologia',p_export:exporting,p_clinic_id:clinicId})
  if(error)throw error
  return checkedDentalRecord(data)
}
export async function saveDentalRecord(clinicId:string,record:DentalRecord,initial:SavedDentalRecord|null,patientId?:string,identityVersion=0) {
  const validation=validateDentalRecord(record);if(validation)throw new Error(validation)
  const identity=patientIdentity(record.patient)
  identity.fullName=identity.fullName.trim();identity.dni=identity.dni.replace(/[.\s-]/g,'')
  const initialData=Object.fromEntries((['date','reason','allergies','medication','medicalNotes','dentalNotes'] as const).map(key=>[key,record.patient[key]]))
  const {data,error}=await database().rpc('save_clinical_chart',{p_clinic_id:clinicId,p_patient_id:initial?.id||patientId||null,p_specialty_id:'odontologia',p_schema_version:1,p_expected_version:initial?.version||0,p_expected_identity_version:initial?.identityVersion??identityVersion,p_identity:identity,p_data:{initial:initialData,clinical:record.clinical,evolutions:record.evolutions}})
  if(error)throw error
  return checkedDentalRecord(data)
}
export async function getDentalRevision(clinicId:string,patientId:string,id:number) {
  const {data,error}=await database().rpc('get_chart_revision',{p_patient_id:patientId,p_version_id:id,p_clinic_id:clinicId})
  if(error)throw error
  return checkedDentalRecord(data)
}
export async function dentalVersions(clinicId:string,patientId:string) {
  const {data,error}=await database().rpc('list_chart_versions',{p_patient_id:patientId,p_specialty_id:'odontologia',p_clinic_id:clinicId})
  if(error)throw error
  return data as {id:number;version:number;recorded_at:string}[]
}
