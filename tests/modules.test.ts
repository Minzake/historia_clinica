import { describe,expect,it } from 'vitest'
import { blankClinic,blankRecord } from '../src/lib/model'
import { resolveSpecialty } from '../src/modules/registry'
import { splitPodologyRecord,joinPodologyRecord } from '../src/modules/podologia/adapter'
import { buildPdf } from '../src/lib/pdf'
import { canCreateClinical,canReadClinical } from '../src/core/access'
import type { Membership } from '../src/core/types'

describe('specialty module boundary',()=>{
  it('installs only podology and refuses unimplemented specialties and schema versions',()=>{
    expect(resolveSpecialty().id).toBe('podologia')
    expect(()=>resolveSpecialty('otra')).toThrow('UNSUPPORTED_CLINICAL_SCHEMA')
    expect(()=>resolveSpecialty('podologia',2)).toThrow('UNSUPPORTED_CLINICAL_SCHEMA')
  })
  it('round-trips legacy records without putting health data into patient identity',()=>{
    const record=blankRecord();record.patient.fullName='Ana';record.patient.medication='Privado';record.patient.photoConsent='no';record.patient.antecedents[0].answer='yes'
    const envelope=splitPodologyRecord(record)
    expect(envelope.identity).not.toHaveProperty('medication')
    expect(envelope.identity).not.toHaveProperty('photoConsent')
    expect(envelope.identity).not.toHaveProperty('date')
    expect(envelope.data.initial.medication).toBe('Privado')
    expect(joinPodologyRecord(envelope)).toEqual(record)
    envelope.data.initial.medication='Otro'
    expect(record.patient.medication).toBe('Privado')
  })
  it('does not interpret unknown schemas or export data explicitly denied by the server',async()=>{
    const record=blankRecord()
    await expect(buildPdf({...record,specialtyId:'otra'},blankClinic())).rejects.toThrow('UNSUPPORTED_CLINICAL_SCHEMA')
    await expect(buildPdf({...record,schemaVersion:2},blankClinic())).rejects.toThrow('UNSUPPORTED_CLINICAL_SCHEMA')
    await expect(buildPdf({...record,canExport:false},blankClinic())).rejects.toThrow('EXPORT_NOT_ALLOWED')
  })
  it('separates administrator role from explicit clinical capabilities',()=>{
    const member:Membership={clinicId:'clinic',role:'owner',clinic:blankClinic(),version:1,specialties:[]}
    expect(canReadClinical(member)).toBe(false);expect(canCreateClinical(member)).toBe(false)
    expect(canReadClinical({...member,specialties:[{specialtyId:'podologia',name:'Podología',canRead:true,canWrite:false,canExport:false,scope:'assigned'}]})).toBe(true)
  })
})
