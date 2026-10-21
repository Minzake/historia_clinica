export type Answer = 'unset' | 'yes' | 'no'
export type Antecedent = { id: string; label: string; answer: Answer; notes: string }
export type Patient = {
  historyNumber: string; date: string; fullName: string; address: string; age: string; birthDate: string
  phone: string; mobile: string; insurance: string; occupation: string; dni: string
  emergencyContact: string; emergencyPhone: string; antecedents: Antecedent[]; vaccines: Antecedent[]
  treatment: Answer; treatmentNotes: string; medication: string; sports: string; diet: string
  alcohol: string; smoking: string; footwear: string; photoConsent: Answer; referredBy: string
}
export type Clinical = { usual: string; pressure: string; glucose: string; weight: string; height: string }
export type Evolution = { id: string; date: string; procedure: string }
export type Clinic = { name: string; professional: string; address: string; phone: string; email: string; license: string }
export type RecordDraft = { patient: Patient; clinical: Clinical; evolutions: Evolution[] }
export type SavedRecord = RecordDraft & { id: string; version: number; updatedAt: string }
export type PatientSummary = { id: string; full_name: string; history_number: string; dni: string; updated_at: string }
export type Membership = { clinicId: string; role: 'owner' | 'professional'; clinic: Clinic; version: number }
export type Revision = { id: number; version: number; recorded_at: string; snapshot: RecordDraft }

const labels = ['Diabetes', 'VPP - NPP', 'Enfermedades cardíacas', 'Hipertensión', 'Hipotensión', 'Convulsiones', 'Asma', 'Alergias', 'VIH / Sida - Sífilis - Otras', 'Hepatitis', 'Tuberculosis', 'Infecciones', 'Fracturas / Esguinces', 'Luxaciones', 'Colesterol', 'Tiroides', 'Está anticoagulado', 'Otros (detallar)']

export function today() {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

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

export const blankClinic = (): Clinic => ({ name: '', professional: '', address: '', phone: '', email: '', license: '' })
export const blankClinical = (): Clinical => ({ usual: '', pressure: '', glucose: '', weight: '', height: '' })
export const blankRecord = (): RecordDraft => ({ patient: blankPatient(), clinical: blankClinical(), evolutions: [] })

export function readClinic(value: unknown): Clinic {
  const result = blankClinic()
  if (value && typeof value === 'object') {
    for (const key of Object.keys(result) as (keyof Clinic)[]) {
      const field = (value as Record<string, unknown>)[key]
      if (typeof field === 'string') result[key] = field
    }
  }
  return result
}

export function legacyClinic(): Clinic | null {
  try {
    const clinic = readClinic(JSON.parse(localStorage.getItem('historia-clinica-consultorio-v1') || 'null'))
    return Object.values(clinic).some(Boolean) ? clinic : null
  } catch { return null }
}

export function decimal(value: string) {
  const normalized = value.trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN
}

export function bmi(weight: string, height: string) {
  const kg = decimal(weight)
  const cm = decimal(height)
  return Number.isFinite(kg) && Number.isFinite(cm) && kg > 0 && cm > 0
    ? (kg / (cm / 100) ** 2).toFixed(1) : ''
}

export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value
}

export function ageAt(birthDate: string, reference = today()) {
  if (!validDate(birthDate) || !validDate(reference) || birthDate > reference) return ''
  const [year, month, day] = birthDate.split('-').map(Number)
  const [refYear, refMonth, refDay] = reference.split('-').map(Number)
  return String(refYear - year - (refMonth < month || (refMonth === month && refDay < day) ? 1 : 0))
}

export function validateRecord({ patient, clinical, evolutions }: RecordDraft): string[] {
  const errors: string[] = []
  if (patient.fullName.trim().length < 2) errors.push('Completá el apellido y nombre del paciente.')
  if (!validDate(patient.date) || patient.date > today()) errors.push('La fecha de la historia debe ser válida y no puede ser futura.')
  if (patient.birthDate && (!validDate(patient.birthDate) || patient.birthDate > patient.date)) errors.push('La fecha de nacimiento debe ser válida y anterior o igual a la fecha de la historia.')
  if (patient.age && (!/^\d{1,3}$/.test(patient.age) || Number(patient.age) > 125)) errors.push('Revisá la edad del paciente (0 a 125 años).')
  if (patient.dni && !/^\d{6,10}$/.test(patient.dni.replace(/[.\s-]/g, ''))) errors.push('Ingresá un DNI de 6 a 10 dígitos o dejalo vacío.')
  for (const [label, value, max] of [['peso', clinical.weight, 700], ['talla', clinical.height, 300]] as const) {
    if (value && (!Number.isFinite(decimal(value)) || decimal(value) <= 0 || decimal(value) > max)) errors.push(`Revisá el valor de ${label}; debe ser un número positivo (máximo ${max}).`)
  }
  if (evolutions.some((e) => !validDate(e.date) || e.date > today() || (patient.birthDate && e.date < patient.birthDate))) errors.push('Revisá las fechas de las evoluciones: no pueden ser futuras ni anteriores al nacimiento.')
  if (evolutions.some((e) => !e.procedure.trim())) errors.push('Completá el procedimiento de cada evolución o quitá las filas vacías.')
  return errors
}

export function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-AR')
}
