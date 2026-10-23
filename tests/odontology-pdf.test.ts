import { describe,expect,it } from 'vitest'
import { blankClinic } from '../src/core/clinic'
import { blankDentalRecord,blankOdontogram,paintMark } from '../src/modules/odontologia/model'
import type { SavedDentalRecord } from '../src/modules/odontologia/model'
import { buildDentalPdf } from '../src/modules/odontologia/pdf'

function record():SavedDentalRecord {
  const result:SavedDentalRecord={...blankDentalRecord(),id:crypto.randomUUID(),specialtyId:'odontologia',schemaVersion:1,version:2,updatedAt:new Date().toISOString(),canExport:true}
  result.patient.fullName='Paciente dental PDF'
  result.patient.historyNumber='HC-001'
  const control=blankOdontogram()
  control.marks=paintMark(paintMark(paintMark([],36,'caries',['center']),36,'resin',['mesial']),55,'amalgam',['distal'])
  control.authorName='Profesional de prueba'
  result.clinical.odontograms.push(control)
  return result
}
describe('dental PDF',()=>{
  it('rejects denied exports, unknown schemas and malformed records',async()=>{
    const value=record(),clinic=blankClinic()
    await expect(buildDentalPdf({...value,canExport:false},clinic)).rejects.toThrow('EXPORT_NOT_ALLOWED')
    await expect(buildDentalPdf({...value,specialtyId:'podologia'},clinic)).rejects.toThrow('UNSUPPORTED_CLINICAL_SCHEMA')
    await expect(buildDentalPdf({...value,schemaVersion:2},clinic)).rejects.toThrow('UNSUPPORTED_CLINICAL_SCHEMA')
    await expect(buildDentalPdf({...value,clinical:null} as unknown as SavedDentalRecord,clinic)).rejects.toThrow()
  })
  it('exports both dentitions, coloured surfaces, authors and complete multipage notes',async()=>{
    const value=record()
    value.evolutions=[{id:crypto.randomUUID(),date:value.patient.date,procedure:`${'Control\n'.repeat(220)}END_OF_DENTAL_EVOLUTION`}]
    const doc=await buildDentalPdf(value,blankClinic()),pdf=doc.output()
    expect(pdf).toContain('Paciente dental PDF')
    expect(pdf).toContain('Profesional de prueba')
    expect(pdf).toContain('END_OF_DENTAL_EVOLUTION')
    expect(pdf).toContain('(55)')
    expect(pdf).toContain('(36)')
    expect(pdf).toMatch(/0\.8 0\.2[56]\d* 0\.2[56]\d* rg/)
    expect(doc.getNumberOfPages()).toBeGreaterThan(4)
    const coordinates=[...pdf.matchAll(/([-\d.]+) ([-\d.]+) Td/g)]
    expect(coordinates.every(match=>Number(match[2])>0)).toBe(true)
  })
})
