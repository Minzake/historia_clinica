import type { Clinic } from './types'
export const blankClinic = (): Clinic => ({ name: '', professional: '', address: '', phone: '', email: '', license: '' })

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
