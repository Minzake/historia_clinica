import { describe,expect,it } from 'vitest'
import { dateInZone,localDateTime,plusDays,zonedInstant } from '../src/lib/booking'

describe('clinic time zone handling',()=>{
  it('does not use the browser time zone for Argentine appointments',()=>{
    expect(zonedInstant('2026-10-24T09:00')).toBe('2026-10-24T12:00:00.000Z')
    expect(localDateTime('2026-10-24T12:00:00Z')).toBe('2026-10-24T09:00')
    expect(dateInZone('2026-10-24T01:00:00Z')).toBe('2026-10-23')
    expect(plusDays('2026-12-31',1)).toBe('2027-01-01')
  })
  it('rejects incomplete or invalid dates and handles zones with daylight saving',()=>{
    expect(()=>zonedInstant('')).toThrow()
    expect(()=>zonedInstant('2026-02-31T09:00')).toThrow()
    expect(zonedInstant('2026-07-24T09:00','America/New_York')).toBe('2026-07-24T13:00:00.000Z')
    expect(()=>zonedInstant('2026-03-08T02:30','America/New_York')).toThrow()
  })
})
