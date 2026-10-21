import { displayTime,getSlots,plusDays,dateInZone,bookingError } from '../lib/booking'
import type { BookingPage } from '../lib/booking'
import { useRemote } from '../hooks/useRemote'
import { useNow } from '../hooks/useNow'
import { validDate } from '../lib/model'
import { Field,Loading,Notice } from './ui'

export function SlotPicker({page,date,onDate,selected,onSelect,disabled=false}:{page:Pick<BookingPage,'slug'|'timezone'|'advance_days'>;date:string;onDate:(value:string)=>void;selected:string;onSelect:(value:string)=>void;disabled?:boolean}) {
  const now=useNow()
  const min=dateInZone(new Date(now),page.timezone),max=plusDays(min,page.advance_days)
  const inRange=validDate(date)&&date>=min&&date<=max
  const slots=useRemote(`slots:${page.slug}:${inRange?date:'invalid'}`,()=>inRange?getSlots(page.slug,date):Promise.resolve([]))
  return <fieldset className="slot-picker" disabled={disabled} aria-busy={slots.loading}><Field label="Día de la consulta" type="date" value={date} required min={min} max={max} error={inRange?'':'Elegí una fecha desde hoy y dentro del período habilitado.'} onChange={(value)=>{onDate(value);onSelect('')}}/>
    <p className="section-subtitle">Horarios del consultorio · {page.timezone.replace(/_/g,' ')}</p>
    {inRange&&(slots.loading?<Loading label="Buscando horarios…"/>:slots.error?<Notice>{bookingError(slots.error)} <button type="button" className="text-button" onClick={slots.reload}>Reintentar</button></Notice>:slots.data?.length?<div className="slot-grid" role="group" aria-label="Horarios disponibles">{slots.data.map((slot)=><button key={slot} type="button" className={`slot-button ${selected===slot?'selected':''}`} aria-pressed={selected===slot} onClick={()=>onSelect(slot)}>{displayTime(slot,page.timezone)}</button>)}</div>:<Notice kind="info">No hay horarios disponibles ese día. Probá otra fecha.</Notice>)}
  </fieldset>
}
