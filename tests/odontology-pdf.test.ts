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
  it.each(['permanent','temporary','mixed'] as const)('prints only the selected %s dentition, with matching marks and legend',async(view)=>{
    const value=record()
    value.clinical.odontograms[0].view=view
    const before=structuredClone(value),pdf=(await buildDentalPdf(value,blankClinic())).output()
    if(view!=='temporary'){
      expect(pdf).toContain('(18)');expect(pdf).toContain('(36)');expect(pdf).toContain('Caries')
    }else{
      expect(pdf).not.toContain('(18)');expect(pdf).not.toContain('(36)');expect(pdf).not.toContain('Caries');expect(pdf).not.toContain('Resina')
    }
    if(view!=='permanent'){
      expect(pdf).toContain('(55)');expect(pdf).toContain('(85)');expect(pdf).toContain('Amalgama')
    }else{
      expect(pdf).not.toContain('(55)');expect(pdf).not.toContain('(85)');expect(pdf).not.toContain('Amalgama')
    }
    expect(value).toEqual(before)
  })
  it('uses a display override without changing the saved control or the default historical export',async()=>{
    const value=record(),id=value.clinical.odontograms[0].id,before=structuredClone(value)
    const filtered=(await buildDentalPdf(value,blankClinic(),{[id]:'permanent'})).output()
    expect(filtered).not.toContain('(55)')
    expect(value).toEqual(before)
    expect((await buildDentalPdf(value,blankClinic())).output()).toContain('(55)')
  })
  it('includes only the legend entries actually recorded instead of the full condition catalogue',async()=>{
    const value=record(),before=structuredClone(value)
    const pdf=(await buildDentalPdf(value,blankClinic())).output()
    for(const label of ['Caries','Resina','Amalgama'])expect(pdf).toContain(label)
    for(const label of ['evaluado sin hallazgos','Corona adaptada','Corona desadaptada','Sellante','Con endodoncia','Necrosis pulpar','Clínicamente ausente'])expect(pdf).not.toContain(label)
    expect(value).toEqual(before)
  })
  it('places each control legend below its graphic, before the mark details, and only lists its own symbols',async()=>{
    const value=record(),next=blankOdontogram()
    next.marks=paintMark(paintMark(paintMark([],37,'crown_fit',['all']),36,'caries',['center']),35,'caries',['center'])
    value.clinical.odontograms.push(next)
    const doc=await buildDentalPdf(value,blankClinic())
    expect(doc.internal.pages[1].join('\n')).not.toContain('(Leyenda 1)')
    for(const [pageNumber,labels,excluded] of [[2,['Caries','Resina','Amalgama'],['Corona adaptada']],[3,['Caries','Corona adaptada'],['Resina','Amalgama']]] as const){
      const page=doc.internal.pages[pageNumber].join('\n')
      const legendStart=page.indexOf('(Leyenda 1)'),detailsStart=page.indexOf('(Pieza)')
      expect(legendStart).toBeGreaterThan(page.indexOf('(38)'))
      expect(detailsStart).toBeGreaterThan(legendStart)
      const legend=page.slice(legendStart,detailsStart)
      for(const label of labels)expect(legend).toContain(label)
      for(const label of excluded)expect(legend).not.toContain(label)
      expect(legend.match(/\(Caries\)/g)).toHaveLength(1)
    }
  })
  it('omits the legend when the chart has no marks, including controls containing only observations',async()=>{
    const value=record()
    value.clinical.odontograms=[]
    expect((await buildDentalPdf(value,blankClinic())).output()).not.toContain('Leyenda 1')
    const control=blankOdontogram();control.notes='Control sin marcas'
    value.clinical.odontograms.push(control)
    const pdf=(await buildDentalPdf(value,blankClinic())).output()
    expect(pdf).not.toContain('(Leyenda 1)')
    expect(pdf).toContain('Control sin marcas')
  })
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
