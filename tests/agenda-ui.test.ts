import { describe, expect, it } from 'vitest'
import { appointmentOverlap, eligiblePractitioners, initialAppointmentService, initialAppointmentTime, isGeneratedBookingSlug, suggestedAppointmentTimes, suggestBookingSlug } from '../src/lib/agenda-ui'
import type { Appointment, Practitioner, Service } from '../src/lib/booking'

const timezone = 'America/Argentina/Buenos_Aires'
const appointment = (patch: Partial<Appointment> = {}) => ({ id:'turno', provider_id:'profesional', starts_at:'2026-10-26T12:00:00Z', ends_at:'2026-10-26T12:45:00Z', status:'confirmed', kind:'consultation', ...patch } as Appointment)
const now = Date.parse('2026-10-25T12:00:00Z')

describe('readable public links', () => {
  it('replaces internal identifiers, preserves custom names and normalizes accents and punctuation', () => {
    expect(isGeneratedBookingSlug('consultorio-30000000000040008000000000000001')).toBe(true)
    expect(isGeneratedBookingSlug('podologia-centro')).toBe(false)
    expect(suggestBookingSlug('Centro', 'Podología', 'María Pérez')).toBe('podologia-maria-perez')
    expect(suggestBookingSlug('Centro', 'Consulta de podología', 'María Pérez')).toBe('podologia-maria-perez')
    expect(suggestBookingSlug('', 'Rx', '')).toBe('turnos-rx')
    expect(suggestBookingSlug('Centro Norte', '', '')).toBe('turnos-centro-norte')
    expect(suggestBookingSlug('', '', '!!!')).toBe('turnos')
  })
  it('avoids other agenda names and leaves room for a numeric suffix', () => {
    expect(suggestBookingSlug('', 'Podología', 'Ana', ['podologia-ana','podologia-ana-2'])).toBe('podologia-ana-3')
    expect(suggestBookingSlug('a'.repeat(100), '', '').length).toBeLessThanOrEqual(60)
  })
})

describe('staff appointment availability', () => {
  it('chooses a service for the selected or signed-in professional instead of defaulting to an incompatible specialty',()=>{
    const services=[{id:'pod',active:true,specialty_id:'podologia'},{id:'dental',active:true,specialty_id:'odontologia'}] as Service[]
    const practitioners=[{user_id:'p',specialty_ids:['podologia']},{user_id:'d',specialty_ids:['odontologia']}] as Practitioner[]
    expect(initialAppointmentService(services,practitioners,'pod','d')).toBe('dental')
    expect(initialAppointmentService(services,practitioners,'pod','','d',true)).toBe('dental')
    expect(initialAppointmentService(services,practitioners,'pod')).toBe('pod')
    expect(initialAppointmentService(services,practitioners,'pod','','unknown',true)).toBe('')
  })
  it('removes overlaps for the selected professional, including blocks, and allows adjacent turns', () => {
    const items = [appointment(), appointment({id:'bloqueo',kind:'block',starts_at:'2026-10-26T14:00:00Z',ends_at:'2026-10-26T15:00:00Z'})]
    const times = suggestedAppointmentTimes('2026-10-26', timezone, 45, 'profesional', items, undefined, now)
    expect(times).not.toContain('09:00')
    expect(times).not.toContain('09:30')
    expect(times).toContain('09:45')
    expect(times).not.toContain('10:30')
    expect(times).not.toContain('11:45')
    expect(times).toContain('12:00')
    expect(appointmentOverlap(items, 'otra', '2026-10-26T12:00:00Z', 30)).toBeUndefined()
  })
  it('ignores cancelled turns and the appointment being edited, but keeps completed occupancy', () => {
    expect(appointmentOverlap([appointment({status:'cancelled'})], 'profesional', '2026-10-26T12:00:00Z', 30)).toBeUndefined()
    expect(appointmentOverlap([appointment()], 'profesional', '2026-10-26T12:00:00Z', 30, 'turno')).toBeUndefined()
    expect(appointmentOverlap([appointment({status:'completed'})], 'profesional', '2026-10-26T12:00:00Z', 30)?.id).toBe('turno')
  })
  it('uses opening hours and selected duration without crossing the closing time or lunch break', () => {
    const hours = [{weekday:1,opens:'09:00:00',closes:'10:00:00'},{weekday:1,opens:'14:00',closes:'15:00'}]
    expect(suggestedAppointmentTimes('2026-10-26', timezone, 45, 'profesional', [], hours, now)).toEqual(['09:00','09:15','14:00','14:15'])
    expect(suggestedAppointmentTimes('2026-10-27', timezone, 30, 'profesional', [], hours, now)).toEqual([])
    expect(suggestedAppointmentTimes('2026-10-26', timezone, 0, 'profesional', [], hours, now)).toEqual([])
  })
  it('avoids past suggestions and rounds today up using the clinic time zone', () => {
    const clock = Date.parse('2026-10-26T12:07:00Z')
    expect(initialAppointmentTime('2026-10-26', timezone, clock)).toBe('09:15')
    expect(initialAppointmentTime('2026-10-27', timezone, clock)).toBe('09:00')
    const times = suggestedAppointmentTimes('2026-10-26', timezone, 30, 'profesional', [], undefined, clock)
    expect(times[0]).toBe('09:15')
  })
  it('offers only professionals qualified for the service and enforces the own agenda scope', () => {
    const practitioners: Practitioner[] = [{user_id:'a',email:'a@example.com',role:'professional',specialty_ids:['podologia']},{user_id:'b',email:'b@example.com',role:'professional',specialty_ids:['otra']}]
    const service = {specialty_id:'podologia'} as Service
    expect(eligiblePractitioners(practitioners, service).map(p => p.user_id)).toEqual(['a'])
    expect(eligiblePractitioners(practitioners, service, 'b', true)).toEqual([])
  })
  it('skips nonexistent local times rather than crashing at a daylight-saving change', () => {
    const times = suggestedAppointmentTimes('2026-03-08', 'America/New_York', 30, 'profesional', [], [{weekday:0,opens:'01:00',closes:'04:00'}], Date.parse('2026-03-01T00:00:00Z'))
    expect(times).toContain('01:00')
    expect(times).not.toContain('02:00')
    expect(times).toContain('03:00')
  })
})
