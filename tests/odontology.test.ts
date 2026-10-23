import { describe,expect,it } from 'vitest'
import { blankDentalRecord,blankOdontogram,continueOdontogram,odontogramContent,paintMark,removeFaces,teeth,validateDentalRecord,validateOdontogram } from '../src/modules/odontologia/model'

describe('odontogram surfaces and validation',()=>{
  it('continues the latest state as an independent update, preserving marks and omitting old author metadata',()=>{
    const previous={...blankOdontogram(),date:'2026-01-02',view:'permanent' as const,notes:'Seguimiento',authorId:crypto.randomUUID(),authorName:'Anterior',recordedAt:'2026-01-02T12:00:00Z'}
    previous.marks=paintMark(paintMark([],36,'caries',['center']),55,'amalgam',['distal'])
    const before=structuredClone(previous),next=continueOdontogram(previous)
    expect(next.id).not.toBe(previous.id)
    expect(next.view).toBe('permanent');expect(next.notes).toBe(previous.notes)
    expect(next.marks).toEqual(previous.marks);expect(next.marks).not.toBe(previous.marks)
    expect(next).not.toHaveProperty('authorId');expect(next).not.toHaveProperty('authorName');expect(next).not.toHaveProperty('recordedAt')
    const baseline=odontogramContent(next)
    expect(odontogramContent({...next,view:'temporary'})).toBe(baseline)
    next.marks=paintMark(next.marks,36,'resin',['center'])
    expect(odontogramContent(next)).not.toBe(baseline)
    expect(next.marks.find(mark=>mark.tooth===55)?.condition).toBe('amalgam')
    expect(previous).toEqual(before)
    expect(continueOdontogram().marks).toEqual([])
  })
  it('keeps independent colours, splits whole-tooth surface marks and never mutates a saved control',()=>{
    const control=blankOdontogram();control.marks=paintMark([],36,'caries',['all'])
    const original=structuredClone(control)
    const repainted=paintMark(control.marks,36,'resin',['mesial'])
    expect(repainted.find(m=>m.condition==='caries')?.faces).not.toContain('mesial')
    const three=paintMark(repainted,36,'amalgam',['distal'])
    expect(new Set(three.map(m=>m.condition)).size).toBe(3)
    expect(removeFaces(three,36,['center']).find(m=>m.condition==='resin')?.faces).toEqual(['mesial'])
    expect(control).toEqual(original)
    expect(validateOdontogram({...control,marks:three})).toBe('')
  })
  it('supports 32 permanent and 20 primary teeth, rejects malformed faces and incompatible healthy marks',()=>{
    expect(teeth).toHaveLength(52);expect(new Set(teeth).size).toBe(52)
    expect(paintMark([],55,'caries',['center'])[0].tooth).toBe(55)
    expect(()=>paintMark([],99,'caries',['center'])).toThrow()
    expect(()=>paintMark(paintMark([],36,'healthy',['all']),36,'caries',['center'])).toThrow()
    const control=blankOdontogram();control.marks=paintMark([],36,'resin',['center'])
    expect(validateOdontogram({...control,marks:[...control.marks,{...control.marks[0],id:crypto.randomUUID()}]})).toContain('superpuestas')
    expect(validateOdontogram({...control,marks:[{...control.marks[0],faces:['all','center']}]})).toContain('caras')
    expect(validateOdontogram({...control,legendVersion:2})).toContain('leyenda')
  })
  it('validates identity, dates, plans and encounters across all panels',()=>{
    const record=blankDentalRecord();record.patient.fullName='Paciente dental'
    expect(validateDentalRecord(record)).toBe('')
    record.patient.dni='x';expect(validateDentalRecord(record)).toContain('DNI');record.patient.dni=''
    record.clinical.treatmentPlan.push({id:crypto.randomUUID(),tooth:36,description:'Control',status:'completed',date:record.patient.date,completedDate:''})
    expect(validateDentalRecord(record)).toContain('realización')
    record.clinical.treatmentPlan[0].completedDate=record.patient.date
    expect(validateDentalRecord(record)).toBe('')
    record.evolutions.push({id:crypto.randomUUID(),date:record.patient.date,procedure:''})
    expect(validateDentalRecord(record)).toContain('procedimiento')
  })
})
