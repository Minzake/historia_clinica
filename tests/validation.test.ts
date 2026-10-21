import { describe, expect, it } from 'vitest'
import { blankClinic } from '../src/lib/model'
import type { BookingSettings, StaffAppointmentInput } from '../src/lib/booking'
import { dniError, normalizeDni, phoneError, validateBookingSettings, validateClientProfile, validateClinic, validateStaffAppointment, validEmail } from '../src/lib/validation'

const settings: BookingSettings = { clinic_id: 'clinic', slug: 'consultorio', enabled: true, provider_id: 'provider', provider_name: 'Profesional', timezone: 'America/Argentina/Buenos_Aires', advance_days: 30, lead_minutes: 120, cancel_hours: 12, version: 1 }
const appointment: StaffAppointmentInput = { provider_id: 'provider', starts_at: '2030-01-01T12:00:00Z', duration_minutes: 30, kind: 'consultation', status: 'confirmed', name: 'Paciente', dni: '12345678', email: '', phone: '', notes: '' }

describe('form validation shared by submit handlers and API helpers', () => {
  it('accepts optional contact fields and rejects unusable phone numbers consistently', () => {
    for (const phone of ['', '   ', '123456', '+54 (11) 5555-1234', '011.5555.1234']) expect(phoneError(phone)).toBe('')
    for (const phone of ['abc123456', '12345', '+() -', '12+34+56', '1'.repeat(21)]) {
      expect(phoneError(phone)).not.toBe('')
      expect(validateClientProfile('Paciente', '12345678', phone)).not.toBe('')
      expect(validateClinic({ ...blankClinic(), name: 'Consultorio', phone })).not.toBe('')
      expect(validateStaffAppointment({ ...appointment, phone })).not.toBe('')
    }
    expect(dniError('')).toBe('')
    expect(dniError('', true)).not.toBe('')
    expect(dniError('12.345.678', true)).toBe('')
    expect(dniError('1234x678')).not.toBe('')
  })
  it('normalizes DNI and validates patient identity and contact lengths', () => {
    expect(normalizeDni('12.345.678')).toBe('12345678')
    expect(validateClientProfile('Paciente', '12.345.678', '')).toBe('')
    expect(validateClientProfile(' ', '12345678', '')).not.toBe('')
    expect(validateClientProfile('Paciente', '12345', '')).not.toBe('')
    expect(validateClientProfile('Paciente', '12345678901', '')).not.toBe('')
    expect(validateClientProfile('Paciente', '12345678', '1'.repeat(41))).not.toBe('')
  })
  it('accepts optional email but rejects invalid syntax, whitespace and oversized values', () => {
    expect(validEmail('nombre@example.com')).toBe(true)
    for (const email of ['invalid', 'a@@b.com', 'a b@example.com', 'x'.repeat(250) + '@a.com']) expect(validEmail(email)).toBe(false)
    expect(validateClinic({ ...blankClinic(), name: 'Consultorio' })).toBe('')
    expect(validateClinic({ ...blankClinic(), name: 'Consultorio', email: 'invalid' })).not.toBe('')
    expect(validateClinic(blankClinic())).not.toBe('')
  })
  it('requires DNI for active manual consultations but not blocks or linked accounts', () => {
    expect(validateStaffAppointment(appointment)).toBe('')
    expect(validateStaffAppointment({ ...appointment, dni: '' })).toContain('DNI')
    expect(validateStaffAppointment({ ...appointment, dni: '', client_user_id: 'client' })).toBe('')
    expect(validateStaffAppointment({ ...appointment, dni: '', kind: 'block' })).toBe('')
    expect(validateStaffAppointment({ ...appointment, dni: '', status: 'cancelled' })).toBe('')
    expect(validateStaffAppointment({ ...appointment, dni: '', starts_at: '2000-01-01T12:00:00Z' })).toBe('')
  })
  it('rejects invalid durations, contacts, future attendance and block states', () => {
    for (const duration_minutes of [0, -30, 16, 30.5, 495, Number.NaN]) expect(validateStaffAppointment({ ...appointment, duration_minutes })).not.toBe('')
    expect(validateStaffAppointment({ ...appointment, kind: 'block', status: 'completed', starts_at: '2000-01-01T12:00:00Z' })).not.toBe('')
    expect(validateStaffAppointment({ ...appointment, status: 'completed' })).not.toBe('')
    expect(validateStaffAppointment({ ...appointment, starts_at: 'invalid' })).not.toBe('')
    expect(validateStaffAppointment({ ...appointment, email: 'invalid' })).not.toBe('')
    expect(validateStaffAppointment({ ...appointment, notes: 'x'.repeat(2001) })).not.toBe('')
  })
  it('validates hours, ranges and timezone and permits adjacent availability', () => {
    const hours = [{ weekday: 1, opens: '09:00', closes: '12:00' }]
    expect(validateBookingSettings(settings, hours)).toBe('')
    expect(validateBookingSettings(settings, [...hours, { weekday: 1, opens: '12:00', closes: '13:00' }])).toBe('')
    expect(validateBookingSettings(settings, [...hours, { weekday: 1, opens: '11:00', closes: '13:00' }])).toContain('superponerse')
    for (const item of [{ ...settings, advance_days: 0 }, { ...settings, cancel_hours: 0.5 }, { ...settings, lead_minutes: -1 }, { ...settings, timezone: 'Invalid/Zone' }, { ...settings, slug: 'INVALID' }]) expect(validateBookingSettings(item, hours)).not.toBe('')
    for (const hour of [{ weekday: 7, opens: '09:00', closes: '12:00' }, { weekday: 1, opens: '09:00', closes: '09:15' }, { weekday: 1, opens: '24:00', closes: '25:00' }, { weekday: 1, opens: '13:00', closes: '12:00' }]) expect(validateBookingSettings(settings, [hour])).not.toBe('')
    expect(validateBookingSettings(settings, [])).not.toBe('')
  })
})
