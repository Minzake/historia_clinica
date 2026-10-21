import type { Clinic } from './model'
import type { BookingSettings, OpeningHours, StaffAppointmentInput } from './booking'

export const normalizeDni = (value: string) => value.replace(/[.\s-]/g, '')
export const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export function validateClientProfile(name: string, dni: string, phone: string) {
  if (name.trim().length < 2 || name.trim().length > 200) return 'Ingresá un nombre y apellido de 2 a 200 caracteres.'
  if (!/^\d{6,10}$/.test(normalizeDni(dni))) return 'Ingresá un DNI de 6 a 10 dígitos.'
  if (phone.trim().length > 40) return 'El celular no puede superar los 40 caracteres.'
  return ''
}

export function validateClinic(clinic: Clinic) {
  if (!clinic.name.trim() && !clinic.professional.trim()) return 'Completá el nombre del consultorio o del profesional.'
  if (Object.values(clinic).some(value => typeof value !== 'string' || value.length > 200)) return 'Los datos del consultorio no pueden superar los 200 caracteres por campo.'
  if (clinic.email && !validEmail(clinic.email)) return 'Ingresá un correo válido para el consultorio o dejalo vacío.'
  return ''
}

export function validateStaffAppointment(data: StaffAppointmentInput, now = Date.now()) {
  const start = Date.parse(data.starts_at)
  if (!data.provider_id || !Number.isFinite(start)) return 'Seleccioná una profesional y una fecha y hora válidas.'
  if (!['consultation', 'block'].includes(data.kind) || !['confirmed', 'cancelled', 'completed', 'no_show'].includes(data.status)) return 'Revisá el tipo y el estado del turno.'
  const max = data.kind === 'block' ? 44640 : 480
  if (!Number.isInteger(data.duration_minutes) || data.duration_minutes < 15 || data.duration_minutes > max || data.duration_minutes % 15 !== 0) return `La duración debe ser múltiplo de 15 minutos, entre 15 y ${max}.`
  if (data.kind === 'block' && !['confirmed', 'cancelled'].includes(data.status)) return 'Un bloqueo solo puede estar confirmado o cancelado.'
  if (['completed', 'no_show'].includes(data.status) && start > now) return 'No se puede marcar como atendido o ausente un turno futuro.'
  if (data.name.length > 200 || (data.kind === 'consultation' && data.name.trim().length < 2)) return 'Ingresá un nombre y apellido de 2 a 200 caracteres.'
  if (data.dni && !/^\d{6,10}$/.test(data.dni)) return 'Ingresá un DNI de 6 a 10 dígitos.'
  if (data.kind === 'consultation' && data.status === 'confirmed' && start > now && !data.client_user_id && !data.dni) return 'Completá el DNI para controlar que el paciente tenga un solo turno por profesional.'
  if (data.email && !validEmail(data.email)) return 'Ingresá un correo válido o dejalo vacío.'
  if (data.phone.length > 40 || data.notes.length > 2000) return 'Revisá la longitud del celular (40) y de las observaciones (2000 caracteres).'
  return ''
}

export function validateBookingSettings(settings: BookingSettings, hours: OpeningHours[]) {
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(settings.slug)) return 'El enlace público debe tener entre 3 y 60 letras minúsculas, números o guiones.'
  try { new Intl.DateTimeFormat('es', { timeZone: settings.timezone }) } catch { return 'La zona horaria no es válida.' }
  for (const [value, min, max] of [[settings.advance_days, 1, 180], [settings.lead_minutes, 0, 10080], [settings.cancel_hours, 0, 168]]) {
    if (!Number.isInteger(value) || value < min || value > max) return 'Revisá los límites de anticipación y de cambios; deben ser números enteros dentro del rango indicado.'
  }
  if (settings.provider_name.length > 120) return 'El nombre público no puede superar los 120 caracteres.'
  if (settings.enabled && (!settings.provider_id || !settings.provider_name.trim() || !hours.length)) return 'Antes de habilitar reservas elegí a la profesional, completá su nombre público y agregá al menos una franja horaria.'
  if (hours.length > 28) return 'Podés configurar hasta 28 franjas horarias.'
  const minute = (time: string) => /^\d{2}:\d{2}$/.test(time) && Number(time.slice(0, 2)) < 24 && Number(time.slice(3)) < 60 ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : Number.NaN
  for (const [index, hour] of hours.entries()) {
    const opens = minute(hour.opens), closes = minute(hour.closes)
    if (!Number.isInteger(hour.weekday) || hour.weekday < 0 || hour.weekday > 6 || !Number.isFinite(opens) || !Number.isFinite(closes) || closes - opens < 30) return 'Cada franja debe tener un día válido y durar al menos 30 minutos, sin cruzar la medianoche.'
    if (hours.slice(0, index).some(other => other.weekday === hour.weekday && minute(other.opens) < closes && opens < minute(other.closes))) return 'Las franjas horarias del mismo día no pueden superponerse.'
  }
  return ''
}
