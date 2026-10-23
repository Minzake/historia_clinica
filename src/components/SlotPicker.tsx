import { displayTime,getSlots,plusDays,dateInZone,bookingError } from '../lib/booking'
import type { BookingPage } from '../lib/booking'
import { useRemote } from '../hooks/useRemote'
import { useNow } from '../hooks/useNow'
import { validDate } from '../lib/model'
import { useEffect } from 'react'
import { Loading,Notice } from './ui'
import { DayPicker } from './DayPicker'

export function SlotPicker({page,date,onDate,selected,onSelect,disabled=false,onAvailabilityChange}:{page:Pick<BookingPage,'slug'|'timezone'|'advance_days'>;date:string;onDate:(value:string)=>void;selected:string;onSelect:(value:string,reason?:'unavailable')=>void;disabled?:boolean;onAvailabilityChange?:(available:boolean)=>void}) {
  const now=useNow()
  const min=dateInZone(new Date(now),page.timezone),max=plusDays(min,page.advance_days)
  const inRange=validDate(date)&&date>=min&&date<=max
  const slots=useRemote(`slots:${page.slug}:${inRange?date:'invalid'}`,()=>inRange?getSlots(page.slug,date):Promise.resolve([]))
  const available=Boolean(inRange&&!slots.loading&&!slots.error&&selected&&slots.data?.some(slot=>Date.parse(slot)===Date.parse(selected)))
  useEffect(()=>{onAvailabilityChange?.(available)},[available,onAvailabilityChange])
  useEffect(()=>{if(selected&&!slots.loading&&!slots.error&&!available)onSelect('','unavailable')},[selected,slots.loading,slots.error,available,onSelect])
  function changeDate(value:string){onDate(value);onSelect('')}
  return <fieldset className="slot-picker" disabled={disabled} aria-busy={slots.loading}><DayPicker label="Día de la consulta" value={date} min={min} max={max} today={min} disabled={disabled} onChange={changeDate}/>
    {!inRange&&<Notice>Elegí una fecha desde hoy y dentro del período habilitado.</Notice>}
    {inRange&&(slots.loading?<Loading label="Buscando horarios…"/>:slots.error?<Notice>{bookingError(slots.error)} <button type="button" className="text-button" onClick={slots.reload}>Reintentar</button></Notice>:slots.data?.length?<div role="group" aria-label="Horarios disponibles">{[{name:'Mañana',match:(slot:string)=>displayTime(slot,page.timezone)<'12:00'},{name:'Tarde y noche',match:(slot:string)=>displayTime(slot,page.timezone)>='12:00'}].map(period=>{
      const times=slots.data!.filter(period.match)
      return times.length?<div className="booking-time-group" key={period.name}><h3>{period.name}<small>{times.length} disponibles</small></h3><div className="slot-grid">{times.map(slot=><button key={slot} type="button" className={`slot-button ${Date.parse(selected)===Date.parse(slot)?'selected':''}`} aria-pressed={Date.parse(selected)===Date.parse(slot)} onClick={()=>onSelect(slot)}>{displayTime(slot,page.timezone)}</button>)}</div></div>:null
    })}<p className="section-subtitle">Los horarios corresponden a la hora local del consultorio.</p></div>:<div className="booking-no-slots"><Notice kind="info">No hay horarios disponibles ese día. Probá otra fecha.</Notice>{date<max&&<button type="button" className="secondary-button" onClick={()=>changeDate(plusDays(date,1))}>Ver día siguiente</button>}</div>)}
  </fieldset>
}
