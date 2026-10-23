import { dateInZone, localDateTime, zonedInstant } from './booking'
import type { Appointment, OpeningHours, Practitioner, Service } from './booking'

export const isGeneratedBookingSlug = (slug: string) => !slug || /^consultorio-[a-f0-9]{32}$/.test(slug)

export function suggestBookingSlug(clinic: string, service: string, provider: string, taken: string[] = []) {
  const text = `${service.replace(/^consulta(?:\s+de)?\s+/i, '') || 'turnos'} ${provider || clinic}`
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 54).replace(/-$/, '') || 'turnos'
  const base = normalized.length < 3 ? `turnos-${normalized}` : normalized
  let slug = base
  for (let suffix = 2; taken.includes(slug); suffix++) slug = `${base}-${suffix}`
  return slug
}

export function eligiblePractitioners(practitioners: Practitioner[], service: Service | undefined, userId?: string, ownOnly = false) {
  return practitioners.filter(p => (!ownOnly || p.user_id === userId) && (!service || !p.specialty_ids || p.specialty_ids.includes(service.specialty_id)))
}

export function appointmentOverlap(appointments: Appointment[], provider: string, start: string, minutes: number, excludeId?: string) {
  const from = Date.parse(start), to = from + minutes * 60000
  return appointments.find(a => a.id !== excludeId && a.provider_id === provider && a.status !== 'cancelled' && Date.parse(a.starts_at) < to && Date.parse(a.ends_at) > from)
}

export function suggestedAppointmentTimes(date: string, timezone: string, minutes: number, provider: string, appointments: Appointment[], hours: OpeningHours[] | undefined, now = Date.now(), excludeId?: string) {
  if (!date || !provider || !Number.isInteger(minutes) || minutes < 15 || minutes > 480) return []
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const ranges = hours === undefined ? [{ opens: '09:00', closes: '18:00' }] : hours.filter(h => h.weekday === weekday)
  const times = new Set<string>()
  for (const range of ranges) {
    const toMinute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
    for (let minute = toMinute(range.opens); minute + minutes <= toMinute(range.closes); minute += 15) {
      const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
      try {
        const start = zonedInstant(`${date}T${time}`, timezone)
        if (Date.parse(start) > now && !appointmentOverlap(appointments, provider, start, minutes, excludeId)) times.add(time)
      } catch { /* Skip local times that do not exist when daylight saving starts. */ }
    }
  }
  return [...times].sort()
}

export function initialAppointmentTime(day: string, timezone: string, now = Date.now()) {
  if (day !== dateInZone(new Date(now), timezone)) return '09:00'
  const rounded = new Date(Math.ceil((now + 60000) / 900000) * 900000).toISOString()
  return dateInZone(rounded, timezone) === day ? localDateTime(rounded, timezone).slice(11) : '23:59'
}
