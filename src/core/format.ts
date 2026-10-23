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

export function formatDate(value: string,timeZone?:string) {
  if (!value) return '—'
  if(value.length===10)return validDate(value)?value.split('-').reverse().join('/'):'—'
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))return '—'
  const parts=new Intl.DateTimeFormat('es-AR',{timeZone,day:'2-digit',month:'2-digit',year:'numeric',calendar:'gregory',numberingSystem:'latn'}).formatToParts(date)
  const part=(type:string)=>parts.find(item=>item.type===type)!.value
  return `${part('day')}/${part('month')}/${part('year').padStart(4,'0')}`
}

export function formatDateTime(value:string,timeZone?:string) {
  const date=formatDate(value,timeZone)
  return date==='—'?date:`${date} ${new Date(value).toLocaleTimeString('es-AR',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}`
}

export function dateInputDisplay(value:string,withTime=false) {
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/)
  return match?`${match[3]}/${match[2]}/${match[1]}${withTime&&match[4]?` ${match[4]}:${match[5]}`:''}`:value
}
export function parseDateInput(value:string,withTime=false) {
  const match=value.match(withTime?/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/:/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if(!match)return ''
  const date=`${match[3]}-${match[2]}-${match[1]}`
  if(!validDate(date)||withTime&&(Number(match[4])>23||Number(match[5])>59))return ''
  return withTime?`${date}T${match[4]}:${match[5]}`:date
}
