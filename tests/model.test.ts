import { describe, expect, it } from 'vitest'
import { ageAt, blankEvolution, blankRecord, bmi, readClinic, today, validDate, validateRecord } from '../src/lib/model'

describe('clinical data', () => {
  it('creates independent initial records without assuming negative answers', () => {
    const a = blankRecord()
    const b = blankRecord()
    a.patient.antecedents[0].answer = 'yes'
    expect(b.patient.antecedents[0].answer).toBe('unset')
    expect(a.evolutions).toEqual([])
    expect(a.patient.vaccines).toHaveLength(3)
    expect(blankEvolution().id).not.toBe(blankEvolution().id)
  })
  it('calculates BMI with decimal commas and rejects non-finite input', () => {
    expect(bmi('70,5', '170')).toBe('24.4')
    expect(bmi('Infinity', '170')).toBe('')
    expect(bmi('70', '0')).toBe('')
    expect(bmi('0x46', '170')).toBe('')
    expect(bmi('', '')).toBe('')
  })
  it('validates actual calendar dates and birthday boundaries', () => {
    expect(validDate('2026-02-31')).toBe(false)
    expect(validDate('2024-02-29')).toBe(true)
    expect(ageAt('2000-10-22', '2026-10-21')).toBe('25')
    expect(ageAt('2000-10-21', '2026-10-21')).toBe('26')
    expect(ageAt('2027-01-01', '2026-10-21')).toBe('')
  })
  it('requires identity and valid dates and prevents saving blank evolutions', () => {
    const record = blankRecord()
    expect(validateRecord(record)).toContain('Completá el apellido y nombre del paciente.')
    record.patient.fullName = 'Paciente de prueba'
    expect(validateRecord(record)).toEqual([])
    record.evolutions.push(blankEvolution())
    expect(validateRecord(record)).toContain('Completá el procedimiento de cada evolución o quitá las filas vacías.')
    record.evolutions[0].procedure = 'Control podológico'
    record.evolutions[0].date = '2999-01-01'
    record.clinical.weight = '-3'
    expect(validateRecord(record)).toHaveLength(2)
    record.evolutions[0].date = today()
    record.clinical.weight = '70,5'
    expect(validateRecord(record)).toEqual([])
  })
  it('never trusts configuration values loaded from a browser', () => {
    expect(readClinic({ name: 3, professional: 'Profesional', email: null }).name).toBe('')
    expect(readClinic(null).name).toBe('')
    expect(readClinic({ professional: 'Profesional' }).professional).toBe('Profesional')
  })
})
