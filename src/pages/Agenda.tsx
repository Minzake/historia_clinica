import { useEffect,useRef,useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft,ArrowRight,Ban,CalendarDays,ChevronRight,Mail,MoreHorizontal,Plus,RefreshCw,Settings2 } from 'lucide-react'
import { formatDate } from '../core/format'
import { useClinic } from '../context'
import { bookingError,dateInZone,defaultTimezone,displayTime,getAgenda,getBookingSettings,plusDays,sendAppointmentNotices,serverRequest,statusLabels,weekStart,zonedInstant } from '../lib/booking'
import type { Appointment } from '../lib/booking'
import { useRemote } from '../hooks/useRemote'
import { Field,Loading,Notice,SelectField } from '../components/ui'
import { StaffAppointmentModal } from '../components/StaffAppointmentModal'
import { WeekDays } from '../components/DayPicker'
import { useNow } from '../hooks/useNow'
import './agenda.css'

export function Agenda() {
  const now=useNow()
  const {membership}=useClinic()
  const config=useRemote(`agenda-config:${membership.clinicId}`,()=>getBookingSettings(membership.clinicId))
  const [day,setDay]=useState(()=>dateInZone()),[view,setView]=useState<'day'|'week'>('day')
  const [editing,setEditing]=useState<{appointment:Appointment|null;kind:'consultation'|'block';day:string}|null>(null)
  const [message,setMessage]=useState(''),[noticeBusy,setNoticeBusy]=useState(false)
  const [providerFilter,setProviderFilter]=useState(''),[showCancelled,setShowCancelled]=useState(false)
  const tools=useRef<HTMLDetailsElement>(null)
  const timezone=config.data?.settings.timezone||defaultTimezone
  const rangeStart=view==='week'?weekStart(day):day
  const from=zonedInstant(`${rangeStart}T00:00`,timezone),to=zonedInstant(`${plusDays(rangeStart,view==='day'?1:7)}T00:00`,timezone)
  const agenda=useRemote(`agenda:${membership.clinicId}:${from}:${to}`,()=>getAgenda(membership.clinicId,from,to))
  const mail=useRemote('notification-configuration',()=>serverRequest('/api/notifications',{status_only:true}) as Promise<{configured:boolean}>)
  const days=Array.from({length:view==='day'?1:7},(_,index)=>plusDays(rangeStart,index))
  useEffect(()=>{const close=(event:PointerEvent)=>{if(tools.current&&event.target instanceof Node&&!tools.current.contains(event.target))tools.current.open=false};document.addEventListener('pointerdown',close);return ()=>document.removeEventListener('pointerdown',close)},[])
  function closeTools(){if(tools.current)tools.current.open=false}
  function open(kind:'consultation'|'block',date=day,appointment:Appointment|null=null){closeTools();setMessage('');setEditing({appointment,kind,day:date})}
  async function dispatch(){setNoticeBusy(true);try{const result=await sendAppointmentNotices();setMessage(result.configured?`${result.sent} avisos enviados; ${result.failed} pendientes de reintento.`:'Los turnos están guardados. Los avisos por email todavía no están habilitados.');agenda.reload();mail.reload()}finally{setNoticeBusy(false);closeTools()}}
  return <div className="agenda-minimal">
    <div className="page-heading"><div><h1>Agenda</h1><p className="page-description">Consultas y horarios del consultorio.</p></div><button className="primary-button" disabled={!config.data} onClick={()=>open('consultation')}><Plus size={17}/>Nuevo turno</button></div>
    {message&&<Notice kind="success">{message}</Notice>}
    {Boolean(config.error)&&<Notice>{bookingError(config.error)} <button className="text-button" onClick={config.reload}>Reintentar</button></Notice>}
    <section className="panel agenda-panel">
      <div className="agenda-toolbar">
        <div className="agenda-date-nav">
          <button className="secondary-button" aria-label="Período anterior" onClick={()=>setDay(plusDays(day,view==='day'?-1:-7))}><ArrowLeft size={16}/></button>
          <Field label="Fecha de la agenda" type="date" min="0001-01-01" max="9999-12-31" value={day} onChange={value=>{if(value)setDay(value)}}/>
          <button className="secondary-button" aria-label="Período siguiente" onClick={()=>setDay(plusDays(day,view==='day'?1:7))}><ArrowRight size={16}/></button>
          <button className="secondary-button" onClick={()=>setDay(dateInZone(new Date(),timezone))}>Hoy</button>
        </div>
        <div className="agenda-toolbar-actions">
          {(config.data?.practitioners.length||0)>1&&<div className="agenda-professional-filter"><SelectField label="Filtrar profesional" value={providerFilter} onChange={event=>setProviderFilter(event.target.value)}><option value="">Todos los profesionales</option>{config.data?.practitioners.map(person=><option key={person.user_id} value={person.user_id}>{person.display_name||person.email}</option>)}</SelectField></div>}
          <div className="view-switch" role="group" aria-label="Vista de la agenda"><button aria-pressed={view==='day'} className={view==='day'?'active':''} onClick={()=>setView('day')}>Día</button><button aria-pressed={view==='week'} className={view==='week'?'active':''} onClick={()=>setView('week')}>Semana</button></div>
          <details className="agenda-tools" ref={tools} onKeyDown={event=>{if(event.key==='Escape'){closeTools();tools.current?.querySelector('summary')?.focus()}}}>
            <summary role="button" aria-label="Opciones de agenda"><MoreHorizontal size={18}/><span>Opciones</span></summary>
            <div className="agenda-tools-content">
              <button className="text-button" disabled={!config.data} onClick={()=>open('block')}><Ban size={15}/>Bloquear horario</button>
              {membership.role==='owner'&&<Link className="text-button" to="/agenda/configuracion" onClick={closeTools}><Settings2 size={15}/>Horarios y reservas web</Link>}
              <button className="text-button" onClick={()=>{agenda.reload();closeTools()}}><RefreshCw size={15}/>Actualizar agenda</button>
              <label className="agenda-cancelled-toggle"><input type="checkbox" checked={showCancelled} onChange={event=>setShowCancelled(event.target.checked)}/>Mostrar cancelados</label>
              <div className="agenda-tools-status"><span>Reservas web</span><strong>{(config.data?.pages?.some(page=>page.enabled)||config.data?.settings.enabled)?'Abiertas':'Cerradas'}</strong></div>
              <div className="agenda-tools-status"><span>Avisos por email</span><strong>{mail.loading?'Consultando…':mail.error?'No disponible':mail.data?.configured?'Activos':'Sin configurar'}</strong></div>
              {mail.data?.configured&&<button className="text-button" disabled={noticeBusy} onClick={()=>void dispatch()}><Mail size={15}/>{noticeBusy?'Procesando…':'Procesar avisos pendientes'}</button>}
            </div>
          </details>
        </div>
      </div>
      {view==='day'&&<div className="agenda-week-strip"><WeekDays value={day} onChange={setDay} today={dateInZone(new Date(now),timezone)}/></div>}
      {agenda.loading?<Loading label="Cargando turnos…"/>:agenda.error?<div className="panel-content"><Notice>{bookingError(agenda.error)} <button className="text-button" onClick={agenda.reload}>Reintentar</button></Notice></div>:<div className={`agenda-days ${view==='week'?'week-view':''}`}>
        {days.map(date=>{
          const weekday=new Intl.DateTimeFormat('es-AR',{weekday:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`))
          const items=(agenda.data||[]).filter(item=>(showCancelled||item.status!=='cancelled')&&(!providerFilter||item.provider_id===providerFilter)&&dateInZone(item.starts_at,timezone)<=date&&dateInZone(item.ends_at,timezone)>=date&&Date.parse(item.ends_at)>Date.parse(zonedInstant(`${date}T00:00`,timezone))).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at))
          return <section className="agenda-day" key={date} aria-label={`Turnos del ${formatDate(date)}`}>
            <div className="agenda-day-heading"><div><span className="agenda-weekday">{weekday}</span><h2>{formatDate(date)}</h2><small>{items.length?`${items.filter(item=>item.kind==='consultation').length} turnos${items.some(item=>item.kind==='block')?` · ${items.filter(item=>item.kind==='block').length} bloqueos`:''}`:'Sin turnos'}</small></div><button className="text-button" aria-label={`Agregar turno el ${formatDate(date)}`} onClick={()=>open('consultation',date)}><Plus size={14}/>Agregar turno</button></div>
            {!items.length?view==='week'?null:<div className="agenda-day-empty"><CalendarDays size={25}/><span>Este día está libre</span><button className="text-button" onClick={()=>open('consultation',date)}>Asignar un turno</button></div>:items.map(item=>{
              const person=config.data?.practitioners.find(p=>p.user_id===item.provider_id),service=config.data?.services?.find(s=>s.id===item.service_id)
              return <button key={item.id} className={`agenda-appointment agenda-row ${item.kind} ${item.status}`} onClick={()=>open(item.kind,date,item)}>
                <span className="agenda-row-time"><strong>{displayTime(item.starts_at,timezone)}</strong><span>{displayTime(item.ends_at,timezone)}</span></span>
                <span className="agenda-row-copy"><h3>{item.kind==='block'?item.contact_name||'Horario bloqueado':item.contact_name}</h3><span>{item.kind==='block'?'Horario bloqueado':[service?.name,(config.data?.practitioners.length||0)>1&&!providerFilter?person?.display_name||person?.email:'',`${Math.round((Date.parse(item.ends_at)-Date.parse(item.starts_at))/60000)} min`].filter(Boolean).join(' · ')}</span></span>
                <span className="agenda-row-status"><span className={`status-badge ${item.status}`}>{statusLabels[item.status]}</span><ChevronRight size={16}/></span>
              </button>
            })}
          </section>
        })}
      </div>}
    </section>
    {editing&&config.data&&<StaffAppointmentModal initial={editing.appointment} kind={editing.kind} day={editing.day} timezone={timezone} practitioners={config.data.practitioners} services={config.data.services||[]} settings={config.data.settings} hours={config.data.hours} defaultProvider={providerFilter||config.data.settings.provider_id||''} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setMessage(editing.kind==='block'?'Horario bloqueado.':'Turno guardado.');agenda.reload()}}/>}
  </div>
}
