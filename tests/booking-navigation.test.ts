import { describe,expect,it } from 'vitest'
import { bookingDestination,bookingReturn,bookingSelection } from '../src/lib/booking-navigation'

describe('returning to booking after authentication',()=>{
  it('preserves only the agenda, date and selected instant',()=>{
    const target=bookingDestination('podologia-centro','2026-10-28','2026-10-28T09:30:00-03:00')
    expect(bookingReturn(`?${new URLSearchParams({volver:target})}`)).toBe(target)
    expect(bookingSelection(target.split('?')[1])).toEqual({date:'2026-10-28',slot:'2026-10-28T09:30:00-03:00'})
    expect(bookingReturn(`?${new URLSearchParams({volver:target+'&dni=12345678&redirect=https://other.invalid'})}`)).toBe(target)
  })
  it('rejects external addresses, disguised paths and unrelated routes',()=>{
    for(const target of ['https://evil.invalid/reservar','//evil.invalid/reservar','/historias','/reservar/../historias','/reservar\\..\\historias','/reservar/%2e%2e/historias','javascript:alert(1)']) {
      expect(bookingReturn(`?${new URLSearchParams({volver:target})}`)).toBe('')
    }
  })
  it('drops malformed dates and times without restoring a false selection',()=>{
    expect(bookingSelection('?fecha=2026-02-30&hora=2026-03-02T09:00:00Z')).toEqual({date:'',slot:''})
    expect(bookingSelection('?fecha=2026-10-28&hora=09:00')).toEqual({date:'2026-10-28',slot:''})
    expect(bookingReturn('?volver=%2Freservar')).toBe('/reservar')
  })
})
