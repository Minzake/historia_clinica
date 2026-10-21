import { describe, expect, it } from 'vitest'
import { blankClinic, blankEvolution, blankRecord } from '../src/lib/model'
import { buildPdf } from '../src/lib/pdf'

describe('PDF planillas', () => {
  it('exports the initial sheet independently without a duplicate DNI label', async () => {
    const record = blankRecord()
    record.patient.fullName = 'Paciente PDF'
    const doc = await buildPdf(record, blankClinic(), 'initial')
    const output = doc.output()
    expect(output).toContain('Paciente PDF')
    expect((output.match(/DNI:/g) || []).length).toBe(1)
    expect(output).not.toContain('Ficha de evoluci')
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })
  it('provides an empty continuous writing table instead of isolated procedure boxes', async () => {
    const record = blankRecord()
    record.evolutions = [{ ...blankEvolution(), procedure: 'DO_NOT_PRINT_THIS' }]
    const doc = await buildPdf(record, blankClinic(), 'blank-evolution')
    expect(doc.getNumberOfPages()).toBe(1)
    expect(doc.output()).toContain('Procedimiento')
    expect(doc.output()).toContain('Firma del paciente')
    expect(doc.output()).not.toContain('DO_NOT_PRINT_THIS')
    expect(doc.output()).not.toContain('HISTORIA CL')
  })
  it('keeps the complete text of long evolutions across numbered pages', async () => {
    const record = blankRecord()
    record.evolutions = [{ ...blankEvolution(), procedure: `${'Procedimiento extenso de control podologico. '.repeat(440)} END_OF_EVOLUTION` }]
    const doc = await buildPdf(record, blankClinic(), 'evolutions')
    expect(doc.getNumberOfPages()).toBeGreaterThan(3)
    expect(doc.output()).toContain('END_OF_EVOLUTION')
    expect(doc.output()).toContain('Contin')
    expect(doc.output()).toContain(`Hoja: ${doc.getNumberOfPages()}`)
  })
  it('does not silently truncate long initial observations', async () => {
    const record = blankRecord()
    record.patient.antecedents[0].notes = `${'Observacion extendida. '.repeat(80)} END_OF_NOTES`
    const doc = await buildPdf(record, blankClinic(), 'complete')
    expect(doc.output()).toContain('END_OF_NOTES')
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })
  it('paginates oversized multiline observations even when there are no procedures', async () => {
    const record = blankRecord()
    record.clinical.usual = `${'Control\n'.repeat(60)}END_OF_MULTILINE_OBSERVATIONS`
    const doc = await buildPdf(record, blankClinic(), 'evolutions')
    expect(doc.getNumberOfPages()).toBeGreaterThan(2)
    expect(doc.output()).toContain('END_OF_MULTILINE_OBSERVATIONS')
    // PDF text coordinates use points measured from the bottom; negative text Y means clipping.
    const textCoordinates = [...doc.output().matchAll(/([-\d.]+) ([-\d.]+) Td/g)]
    expect(textCoordinates.every((match) => Number(match[2]) > 0)).toBe(true)
  })
})
