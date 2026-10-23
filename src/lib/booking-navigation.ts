import { validDate } from '../core/format'

export function bookingSelection(search:string) {
  const params=new URLSearchParams(search),date=params.get('fecha')||'',slot=params.get('hora')||''
  const validSlot=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(slot)&&Number.isFinite(Date.parse(slot))
  return {date:validDate(date)?date:'',slot:validDate(date)&&validSlot?slot:''}
}

export function bookingDestination(slug:string,date='',slot='') {
  const path=`/reservar${slug?`/${encodeURIComponent(slug)}`:''}`
  const params=new URLSearchParams()
  if(validDate(date))params.set('fecha',date)
  if(bookingSelection(`fecha=${date}&hora=${encodeURIComponent(slot)}`).slot)params.set('hora',slot)
  return path+(params.size?`?${params}`:'')
}

// Accept only a booking route on this site, never an arbitrary redirect supplied in a URL.
export function bookingReturn(search:string) {
  const target=new URLSearchParams(search).get('volver')
  if(!target||target.length>500)return ''
  try {
    const url=new URL(target,'https://booking.invalid')
    if(!target.startsWith('/reservar')||url.origin!=='https://booking.invalid'||!/^\/reservar(?:\/[a-z0-9][a-z0-9-]{2,59})?$/.test(url.pathname))return ''
    const selection=bookingSelection(url.search)
    return bookingDestination(url.pathname.split('/')[2]||'',selection.date,selection.slot)
  }catch{return ''}
}
