import type { ClinicalMetadata, PatientIdentity } from '../../core/types'
import { decimal, today, validDate } from '../../core/format'
import { dniError, phoneError } from '../../lib/validation'
export type Answer = 'unset' | 'yes' | 'no'
export type Antecedent = { id: string; label: string; answer: Answer; notes: string }
export type Patient = PatientIdentity & {
  date: string; age: string; antecedents: Antecedent[]; vaccines: Antecedent[]
  treatment: Answer; treatmentNotes: string; medication: string; sports: string; diet: string
  alcohol: string; smoking: string; footwear: string; photoConsent: Answer; referredBy: string
}
export type Clinical = { usual: string; pressure: string; glucose: string; weight: string; height: string }
export type Evolution = { id: string; date: string; procedure: string }
export type RecordDraft = { patient: Patient; clinical: Clinical; evolutions: Evolution[] }
export type SavedRecord = RecordDraft & ClinicalMetadata & { id: string; version: number; updatedAt: string }
export type Revision = { id: number; version: number; recorded_at: string; snapshot: RecordDraft & ClinicalMetadata }

const labels = ['Diabetes', 'VPP - NPP', 'Enfermedades cardíacas', 'Hipertensión', 'Hipotensión', 'Convulsiones', 'Asma', 'Alergias', 'VIH / Sida - Sífilis - Otras', 'Hepatitis', 'Tuberculosis', 'Infecciones', 'Fracturas / Esguinces', 'Luxaciones', 'Colesterol', 'Tiroides', 'Está anticoagulado', 'Otros (detallar)']


export function blankEvolution(): Evolution {
  return { id: crypto.randomUUID(), date: today(), procedure: '' }
}

export function blankPatient(): Patient {
  return {
    historyNumber: '', date: today(), fullName: '', address: '', age: '', birthDate: '', phone: '', mobile: '',
    insurance: '', occupation: '', dni: '', emergencyContact: '', emergencyPhone: '',
    antecedents: labels.map((label, index) => ({ id: String(index), label, answer: 'unset', notes: '' })),
    vaccines: ['Antitetánica', 'Hepatitis B', 'Otras (detallar)'].map((label, index) => ({ id: `v${index}`, label, answer: 'unset', notes: '' })),
    treatment: 'unset', treatmentNotes: '', medication: '', sports: '', diet: '', alcohol: '', smoking: '',
    footwear: '', photoConsent: 'unset', referredBy: '',
  }
}

export const blankClinical = (): Clinical => ({ usual: '', pressure: '', glucose: '', weight: '', height: '' })
export const blankRecord = (): RecordDraft => ({ patient: blankPatient(), clinical: blankClinical(), evolutions: [] })


export function bmi(weight: string, height: string) {
  const kg = decimal(weight)
  const cm = decimal(height)
  return Number.isFinite(kg) && Number.isFinite(cm) && kg > 0 && cm > 0
    ? (kg / (cm / 100) ** 2).toFixed(1) : ''
}

export function recordStructureError(value: unknown): string {
  const object = (item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)
  if (!object(value) || !object(value.patient) || !object(value.clinical) || !Array.isArray(value.evolutions)) return 'La ficha tiene una estructura inválida. Volvé a abrirla o contactá al consultorio.'
  const { patient, clinical, evolutions } = value
  for (const [key, template] of Object.entries(blankPatient())) {
    if (typeof template === 'string' && (typeof patient[key] !== 'string' || patient[key].length > 2000)) return 'Revisá los datos personales: hay campos inválidos o demasiado largos.'
  }
  for (const [key, max] of [['usual', 2000], ['pressure', 40], ['glucose', 40], ['weight', 10], ['height', 10]] as const) {
    if (typeof clinical[key] !== 'string' || clinical[key].length > max) return 'Revisá los valores clínicos y la longitud de las observaciones.'
  }
  for (const key of ['antecedents', 'vaccines'] as const) {
    const items = patient[key]
    if (!Array.isArray(items) || items.some(item => !object(item) || typeof item.id !== 'string' || item.id.length > 40 || typeof item.label !== 'string' || item.label.length > 100 || typeof item.notes !== 'string' || item.notes.length > 2000 || !['unset', 'yes', 'no'].includes(item.answer as string))) return 'Revisá las respuestas y las observaciones de antecedentes y vacunas.'
  }
  if (evolutions.length > 500 || evolutions.some(item => !object(item) || typeof item.id !== 'string' || typeof item.date !== 'string' || typeof item.procedure !== 'string' || item.procedure.length > 20000)) return 'Revisá las consultas: máximo 500 entradas y 20000 caracteres por procedimiento.'
  return ''
}

export function recordFieldErrors({ patient, clinical, evolutions }: RecordDraft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (patient.fullName.trim().length < 2) errors['patient.fullName'] = 'Completá el apellido y nombre del paciente.'
  if (patient.fullName.length > 200) errors['patient.fullName'] = 'El nombre no puede superar los 200 caracteres.'
  if (patient.historyNumber.length > 40) errors['patient.historyNumber'] = 'Usá hasta 40 caracteres para el número de historia.'
  if (patient.referredBy.length > 80) errors['patient.referredBy'] = 'Usá hasta 80 caracteres para la referencia.'
  if (!validDate(patient.date) || patient.date > today()) errors['patient.date'] = 'La fecha de la historia debe ser válida y no puede ser futura.'
  if (patient.birthDate && (!validDate(patient.birthDate) || patient.birthDate > patient.date)) errors['patient.birthDate'] = 'La fecha de nacimiento debe ser válida y anterior o igual a la fecha de la historia.'
  if (patient.age && (!/^\d{1,3}$/.test(patient.age) || Number(patient.age) > 125)) errors['patient.age'] = 'Revisá la edad del paciente (0 a 125 años).'
  if (dniError(patient.dni)) errors['patient.dni'] = dniError(patient.dni)
  for (const key of ['phone', 'mobile', 'emergencyPhone'] as const) {
    if (phoneError(patient[key])) errors[`patient.${key}`] = phoneError(patient[key])
  }
  for (const [key, label, max] of [['weight', 'peso', 700], ['height', 'talla', 300]] as const) {
    const value = clinical[key]
    if (value && (!Number.isFinite(decimal(value)) || decimal(value) <= 0 || decimal(value) > max)) errors[`clinical.${key}`] = `Revisá el valor de ${label}; debe ser un número positivo (máximo ${max}).`
  }
  for (const evolution of evolutions) {
    if (!validDate(evolution.date) || evolution.date > today() || (patient.birthDate && evolution.date < patient.birthDate)) errors[`evolutions.${evolution.id}.date`] = 'Revisá las fechas de las evoluciones: no pueden ser futuras ni anteriores al nacimiento.'
    if (!evolution.procedure.trim()) errors[`evolutions.${evolution.id}.procedure`] = 'Completá el procedimiento de cada evolución o quitá las filas vacías.'
  }
  return errors
}

export function validateRecord(record: RecordDraft): string[] {
  const structure = recordStructureError(record)
  if (structure) return [structure]
  const { patient, evolutions } = record
  const errors: string[] = []
  errors.push(...Object.values(recordFieldErrors(record)))
  if (new Set(evolutions.map(e => e.id)).size !== evolutions.length || evolutions.some(e => !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(e.id))) errors.push('Hay consultas repetidas o con identificadores inválidos. Volvé a abrir la ficha.')
  const template = blankPatient()
  for (const key of ['antecedents', 'vaccines'] as const) {
    if (patient[key].length !== template[key].length || patient[key].some((item, index) => item.id !== template[key][index]?.id || item.label !== template[key][index]?.label)) errors.push('Revisá los antecedentes y las vacunas: hay preguntas repetidas, faltantes o modificadas.')
  }
  return [...new Set(errors)]
}
