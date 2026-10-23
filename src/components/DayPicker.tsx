import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate, validDate } from '../core/format'
import { dateInZone, plusDays, weekStart } from '../lib/booking'
import { Field } from './ui'
import './scheduling.css'

type DayProps={value:string;onChange:(value:string)=>void;min?:string;max?:string;disabled?:boolean;today?:string}

export function WeekDays({value,onChange,min='0001-01-01',max='9999-12-31',disabled=false,today=dateInZone()}:DayProps) {
  const base=validDate(value)?value:today
  const start=weekStart(base)
  const days=Array.from({length:7},(_,i)=>plusDays(start,i))
  const previous=plusDays(start,-1),next=plusDays(start,7)
  const clamp=(date:string)=>date<min?min:date>max?max:date
  return <div className="schedule-week">
    <div className="schedule-week-heading"><span>{new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${base}T12:00:00Z`))}</span><div>
      <button type="button" aria-label="Ver semana anterior" disabled={disabled||!validDate(previous)||previous<min} onClick={()=>onChange(clamp(previous))}><ChevronLeft size={17} aria-hidden="true"/></button>
      <button type="button" aria-label="Ver semana siguiente" disabled={disabled||!validDate(next)||next>max} onClick={()=>onChange(clamp(next))}><ChevronRight size={17} aria-hidden="true"/></button>
    </div></div>
    <div className="schedule-week-days" role="group" aria-label="Elegir un día">
      {days.map(date=>{const valid=validDate(date),weekday=valid?new Intl.DateTimeFormat('es-AR',{weekday:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`)):''
        return <button key={date} type="button" aria-label={`Elegir ${weekday} ${formatDate(date)}`} aria-pressed={value===date} aria-current={date===today?'date':undefined} disabled={disabled||!valid||date<min||date>max} onClick={()=>onChange(date)}><span>{weekday.replace('.','')}</span><strong>{valid?Number(date.slice(8)):''}</strong>{date===today&&<i aria-hidden="true"/>}</button>
      })}
    </div>
  </div>
}

export function DayPicker({label,...props}:DayProps&{label:string}) {
  const today=props.today||dateInZone()
  const tomorrow=plusDays(today,1)
  return <div className="schedule-date-picker"><div className="schedule-date-input"><Field label={label} type="date" required min={props.min||'0001-01-01'} max={props.max||'9999-12-31'} value={props.value} onChange={props.onChange} disabled={props.disabled}/><div className="schedule-shortcuts" role="group" aria-label="Fechas rápidas">{[[today,'Hoy'],[tomorrow,'Mañana']].map(([date,text])=><button type="button" key={date} disabled={props.disabled||Boolean(props.min&&date<props.min)||Boolean(props.max&&date>props.max)} onClick={()=>props.onChange(date)}>{text}</button>)}</div></div><WeekDays {...props} today={today}/></div>
}
