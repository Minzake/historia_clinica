import { describe,expect,it } from 'vitest'
import { dateInputDisplay,formatDate,formatDateTime,parseDateInput } from '../src/core/format'

describe('system date format',()=>{
  it('uses zero-padded day, month and year, without changing date-only values across time zones',()=>{
    expect(formatDate('2026-01-02')).toBe('02/01/2026')
    expect(formatDate('0001-01-02')).toBe('02/01/0001')
    expect(formatDate('2026-01-02','America/Argentina/Buenos_Aires')).toBe('02/01/2026')
    expect(formatDate('2026-02-30')).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate('invalid')).toBe('—')
  })
  it('formats instants in the requested time zone with 24-hour times',()=>{
    const instant='2026-02-01T01:05:00Z'
    expect(formatDate(instant,'America/Argentina/Buenos_Aires')).toBe('31/01/2026')
    expect(formatDateTime(instant,'America/Argentina/Buenos_Aires')).toBe('31/01/2026 22:05')
    expect(formatDateTime(instant,'UTC')).toBe('01/02/2026 01:05')
    expect(formatDateTime('invalid')).toBe('—')
  })
  it('converts visible dates to ISO, rejects impossible dates, and validates local times',()=>{
    expect(dateInputDisplay('2024-02-29')).toBe('29/02/2024')
    expect(parseDateInput('29/02/2024')).toBe('2024-02-29')
    expect(parseDateInput('29/02/2025')).toBe('')
    expect(parseDateInput('31/04/2026')).toBe('')
    expect(parseDateInput('01/01/0000')).toBe('')
    expect(parseDateInput('01/02/2026 23:59',true)).toBe('2026-02-01T23:59')
    expect(parseDateInput('01/02/2026 24:00',true)).toBe('')
    expect(parseDateInput('01/02/2026 12:60',true)).toBe('')
    expect(dateInputDisplay('2026-02-01T09:05',true)).toBe('01/02/2026 09:05')
  })
})
