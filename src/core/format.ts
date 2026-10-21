export function today() {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

export function decimal(value: string) {
  const normalized = value.trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN
}

export function validDate(value: string) {
  return typeof value === 'string' && /^[0-9]{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) > 0 && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value
}

export function ageAt(birthDate: string, reference = today()) {
  if (!validDate(birthDate) || !validDate(reference) || birthDate > reference) return ''
  const [year, month, day] = birthDate.split('-').map(Number)
  const [refYear, refMonth, refDay] = reference.split('-').map(Number)
  return String(refYear - year - (refMonth < month || (refMonth === month && refDay < day) ? 1 : 0))
}

export function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-AR')
}
