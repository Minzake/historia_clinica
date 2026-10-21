import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft,ArrowRight,Ban,CalendarDays,Clock,Mail,Plus,Settings2 } from 'lucide-react'
import { useClinic } from '../context'
import { bookingError,dateInZone,defaultTimezone,displayTime,getAgenda,getBookingSettings,localDateTime,plusDays,saveStaffAppointment,searchRegisteredPatients,sendAppointmentNotices,serverRequest,statusLabels,weekStart,zonedInstant } from '../lib/booking'
import type { Appointment,AppointmentStatus,Practitioner,StaffAppointmentInput } from '../lib/booking'
import { useRemote } from '../hooks/useRemote'
import { useNow } from '../hooks/useNow'
import { Field,Loading,Modal,Notice, Form, SelectField, TextAreaField } from '../components/ui'
import { dniError, normalizeDni } from '../lib/validation'

export function Agenda() {
  const {membership}=useClinic()
  const config=useRemote(`agenda-config:${membership.clinicId}`,()=>getBookingSettings(membership.clinicId))
  const [day,setDay]=useState(()=>dateInZone()),[view,setView]=useState<'day'|'week'>('day')
  const [editing,setEditing]=useState<{appointment:Appointment|null;kind:'consultation'|'block'}|null>(null)
  const [message,setMessage]=useState(''),[noticeBusy,setNoticeBusy]=useState(false)
  const timezone=config.data?.settings.timezone||defaultTimezone
  const rangeStart=view==='week'?weekStart(day):day
  const from=zonedInstant(`${rangeStart}T00:00`,timezone),to=zonedInstant(`${plusDays(rangeStart,view==='day'?1:7)}T00:00`,timezone)
  const agenda=useRemote(`agenda:${membership.clinicId}:${from}:${to}`,()=>getAgenda(membership.clinicId,from,to))
  const mail=useRemote('notification-configuration',()=>serverRequest('/api/notifications',{status_only:true}) as Promise<{configured:boolean}>)
  const days=Array.from({length:view==='day'?1:7},(_,index)=>plusDays(rangeStart,index))
  async function dispatch(){setNoticeBusy(true);const result=await sendAppointmentNotices();setMessage(result.configured?`${result.sent} avisos enviados; ${result.failed} pendientes de reintento.`:'El turno está guardado, pero el correo no está configurado. Agregá el proveedor y remitente en el servidor.');setNoticeBusy(false);agenda.reload();mail.reload()}
  return <><div className="page-heading"><div><p className="eyebrow">GESTIÓN DEL CONSULTORIO</p><h1>Agenda de turnos</h1><p className="page-description">Reservas web de 30 minutos y atenciones especiales asignadas por el profesional.</p></div><div className="button-row"><button className="secondary-button" onClick={()=>setEditing({appointment:null,kind:'block'})}><Ban size={16}/>Bloquear horario</button><button className="primary-button" onClick={()=>setEditing({appointment:null,kind:'consultation'})}><Plus size={17}/>Nuevo turno</button></div></div>
    {message&&<Notice kind="info">{message}</Notice>}
    {config.error&&<Notice>{bookingError(config.error)}</Notice>}{config.data&&!config.data.settings.enabled&&<Notice kind="info">Las reservas web están cerradas. {membership.role==='owner'?<Link to="/agenda/configuracion">Configurá la profesional y los horarios para abrirlas.</Link>:'La administración debe configurar la disponibilidad.'}</Notice>}
    {!mail.loading&&(!mail.data?.configured||mail.error)&&<Notice kind="info">Los avisos por email están pendientes de configurar. Los turnos se guardan y pueden consultarse normalmente. WhatsApp todavía no está integrado.</Notice>}
    <section className="panel agenda-panel"><div className="agenda-toolbar"><div className="button-row"><button className="secondary-button" aria-label="Período anterior" onClick={()=>setDay(plusDays(day,view==='day'?-1:-7))}><ArrowLeft size={16}/></button><Field label="Fecha de la agenda" type="date" min="0001-01-01" max="9999-12-31" value={day} onChange={(value)=>{if(value)setDay(value)}}/><button className="secondary-button" aria-label="Período siguiente" onClick={()=>setDay(plusDays(day,view==='day'?1:7))}><ArrowRight size={16}/></button><button className="text-button" onClick={()=>setDay(dateInZone(new Date(),timezone))}>Hoy</button></div><div className="button-row"><div className="view-switch" role="group" aria-label="Vista de la agenda"><button aria-pressed={view==='day'} className={view==='day'?'active':''} onClick={()=>setView('day')}>Día</button><button aria-pressed={view==='week'} className={view==='week'?'active':''} onClick={()=>setView('week')}>Semana</button></div>{membership.role==='owner'&&<Link className="secondary-button" to="/agenda/configuracion"><Settings2 size={16}/>Horarios</Link>}</div></div>
      <div className="agenda-meta"><span><Clock size={13}/>{timezone.replace(/_/g,' ')}</span><button className="text-button" onClick={agenda.reload}>Actualizar agenda</button></div>
      {agenda.loading?<Loading label="Cargando turnos…"/>:agenda.error?<div className="panel-content"><Notice>{bookingError(agenda.error)}</Notice></div>:<div className={`agenda-days ${view==='week'?'week-view':''}`}>{days.map((date)=>{
        const items=(agenda.data||[]).filter((item)=>dateInZone(item.starts_at,timezone)<=date&&dateInZone(item.ends_at,timezone)>=date&&Date.parse(item.ends_at)>Date.parse(zonedInstant(`${date}T00:00`,timezone)))
        return <section className="agenda-day" key={date}><h2>{new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'})}</h2>{!items.length?<div className="agenda-day-empty"><CalendarDays size={22}/><span>Sin turnos registrados</span></div>:items.map((item)=><button key={item.id} type="button" className={`agenda-appointment ${item.kind} ${item.status}`} onClick={()=>setEditing({appointment:item,kind:item.kind})}><div className="agenda-appointment-top"><strong>{displayTime(item.starts_at,timezone)}–{displayTime(item.ends_at,timezone)}</strong><span className={`status-badge ${item.status}`}>{statusLabels[item.status]}</span></div><h3>{item.kind==='block'?item.contact_name||'Horario bloqueado':item.contact_name}</h3><p>{item.kind==='block'?'Bloqueo interno':`${item.source==='web'?'Reserva web':'Asignado por profesional'} · ${Math.round((Date.parse(item.ends_at)-Date.parse(item.starts_at))/60000)} min`}</p>{view==='day'&&item.kind!=='block'&&<small>{[item.contact_dni&&`DNI ${item.contact_dni}`,item.contact_phone,item.contact_email].filter(Boolean).join(' · ')}</small>}{item.contact_email&&item.kind!=='block'&&<span className="email-state"><Mail size={12}/>{item.notification_state==='sent'?'Aviso enviado':'Aviso pendiente'}</span>}</button>)}</section>
      })}</div>}
      <div className="agenda-bottom"><p>Las reservas se protegen contra superposiciones en la base de datos. Cancelar libera el horario; los registros anteriores se conservan.</p><button className="secondary-button" disabled={noticeBusy} onClick={dispatch}><Mail size={14}/>{noticeBusy?'Procesando…':'Procesar avisos pendientes'}</button></div>
    </section>
    {editing&&config.data&&<StaffAppointmentModal initial={editing.appointment} kind={editing.kind} day={day} timezone={timezone} practitioners={config.data.practitioners} defaultProvider={config.data.settings.provider_id||''} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setMessage('Turno guardado. Si corresponde, se registró su aviso por email.');agenda.reload()}}/>}
    {editing&&config.loading&&<Modal title="Cargando agenda" onClose={()=>setEditing(null)}><Loading/></Modal>}
  </>
}

function StaffAppointmentModal({initial,kind,day,timezone,practitioners,defaultProvider,onClose,onSaved}:{initial:Appointment|null;kind:'consultation'|'block';day:string;timezone:string;practitioners:Practitioner[];defaultProvider:string;onClose:()=>void;onSaved:()=>void}) {
  const {membership,userId}=useClinic()
  const now=useNow()
  const [provider,setProvider]=useState(initial?.provider_id||(membership.role==='professional'?userId||defaultProvider:defaultProvider))
  const [dateTime,setDateTime]=useState(initial?localDateTime(initial.starts_at,timezone):`${day}T09:00`)
  const [duration,setDuration]=useState(initial?String(Math.round((Date.parse(initial.ends_at)-Date.parse(initial.starts_at))/60000)):'30')
  const [until,setUntil]=useState(initial?localDateTime(initial.ends_at,timezone):`${day}T10:00`)
  const [name,setName]=useState(initial?.contact_name||''),[dni,setDni]=useState(initial?.contact_dni||''),[email,setEmail]=useState(initial?.contact_email||''),[phone,setPhone]=useState(initial?.contact_phone||''),[notes,setNotes]=useState(initial?.private_notes||'')
  const [useAccount,setUseAccount]=useState(Boolean(initial?.client_user_id)),[accountId,setAccountId]=useState(initial?.client_user_id||'')
  const [accountQuery,setAccountQuery]=useState(''),[submittedQuery,setSubmittedQuery]=useState('')
  const accounts=useRemote(`registered:${membership.clinicId}:${useAccount}:${submittedQuery}`,()=>useAccount&&!initial?.client_user_id?searchRegisteredPatients(membership.clinicId,submittedQuery):Promise.resolve([]))
  const [status,setStatus]=useState<AppointmentStatus>(initial?.status||'confirmed')
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function submit(event:FormEvent) {
    event.preventDefault();setError('');setBusy(true)
    try {
      if(useAccount&&!accountId)throw new Error('Seleccioná una cuenta verificada para vincular el turno, o desmarcá esa opción.')
      const start=zonedInstant(dateTime,timezone)
      const minutes=kind==='block'?(Date.parse(zonedInstant(until,timezone))-Date.parse(start))/60000:Number(duration)
      const data:StaffAppointmentInput={provider_id:provider,client_user_id:useAccount?accountId||null:null,starts_at:start,duration_minutes:minutes,kind,status,name:name.trim(),dni:normalizeDni(dni),email:email.trim(),phone:phone.trim(),notes}
      await saveStaffAppointment(membership.clinicId,initial,data);onSaved()
    }catch(err){setError(bookingError(err))}finally{setBusy(false)}
  }
  const linked=useAccount
  function selectAccount(id:string){setAccountId(id);const account=accounts.data?.find((item)=>item.user_id===id);if(account){setName(account.full_name);setDni(account.dni);setEmail(account.email);setPhone(account.phone)}}
  let future=true
  try{future=Date.parse(zonedInstant(dateTime,timezone))>now}catch{/* The submit handler validates incomplete datetime input. */}
  return <Modal title={kind==='block'?'Bloquear horario':initial?'Editar turno':'Nuevo turno'} onClose={()=>{if(!busy)onClose()}}><Form onSubmit={submit}><fieldset className="settings-fields" disabled={busy}><SelectField label="Profesional" required value={provider} onChange={(event)=>setProvider(event.target.value)}><option value="">Seleccionar profesional</option>{practitioners.filter((p)=>membership.role==='owner'||p.user_id===userId).map((p)=><option key={p.user_id} value={p.user_id}>{p.email}</option>)}</SelectField>
    <div className="field-grid settings-contact-grid"><Field label={kind==='block'?'Desde':'Fecha y hora'} type="datetime-local" required value={dateTime} onChange={setDateTime}/>{kind==='block'?<Field label="Hasta" validationMessage={until&&dateTime&&until<=dateTime?"El final del bloqueo debe ser posterior al inicio.":""} type="datetime-local" required value={until} onChange={setUntil}/>:<Field label="Duración (minutos)" hint="De 15 a 480 minutos, en pasos de 15." type="number" min={15} max={480} step={15} required value={duration} onChange={setDuration}/>}</div><p className="section-subtitle">Zona horaria del consultorio: {timezone.replace(/_/g,' ')}. Los turnos especiales pueden durar más de 30 minutos y quedar fuera del horario web.</p>
    {kind!=='block'&&<div className="registered-account-picker"><label className="toggle-field"><input type="checkbox" checked={useAccount} disabled={Boolean(initial?.client_user_id)} onChange={(event)=>{setUseAccount(event.target.checked);setAccountId('')}}/><span>Vincular a una cuenta de paciente registrada</span></label>{useAccount&&!initial?.client_user_id&&<><div className="account-search"><Field label="Buscar cuenta por nombre, DNI o email" value={accountQuery} onChange={setAccountQuery}/><button type="button" className="secondary-button" onClick={()=>setSubmittedQuery(accountQuery)}>Buscar</button></div>{accounts.loading?<Loading label="Buscando cuentas del consultorio…"/>:accounts.error?<Notice>{bookingError(accounts.error)}</Notice>:<SelectField label="Cuenta de paciente" required value={accountId} onChange={(event)=>selectAccount(event.target.value)}><option value="">Seleccionar cuenta verificada</option>{accounts.data?.map((account)=><option key={account.user_id} value={account.user_id}>{account.full_name} · DNI {account.dni} · {account.email}</option>)}</SelectField>}<p className="section-subtitle">Seleccioná la cuenta solo después de comprobar la identidad. El turno aparecerá en su portal; ninguna historia clínica se vincula automáticamente.</p></>}</div>}
    <Field label={kind==='block'?'Motivo del bloqueo (interno)':'Nombre y apellido del paciente'} value={name} onChange={setName} required={kind!=='block'} minLength={kind!=='block'?2:undefined} readOnly={linked}/>
    {kind!=='block'&&<><div className="field-grid settings-contact-grid"><Field label="DNI" hint="De 6 a 10 dígitos; podés usar puntos." validationMessage={dniError(dni,future&&status==='confirmed'&&!linked)} inputMode="numeric" maxLength={16} required={future&&status==='confirmed'&&!linked} value={dni} onChange={setDni} readOnly={linked}/><Field label="Celular (opcional)" type="tel" maxLength={40} value={phone} onChange={setPhone} readOnly={linked}/></div><p className="section-subtitle">El DNI es obligatorio para turnos futuros confirmados: un turno por paciente y profesional, incluso si se carga manualmente.</p><Field label="Email para avisos (opcional)" type="email" maxLength={254} value={email} onChange={setEmail} readOnly={linked}/>{linked&&<p className="section-subtitle">Los datos de contacto provienen de su cuenta verificada. Una reserva vinculada no puede transferirse a otra persona.</p>}</>}
    <SelectField label="Estado" value={status} onChange={(event)=>setStatus(event.target.value as AppointmentStatus)}><option value="confirmed">Confirmado</option><option value="cancelled">Cancelado · liberar horario</option>{kind!=='block'&&<><option value="completed" disabled={future}>Atendido</option><option value="no_show" disabled={future}>Ausente</option></>}</SelectField><TextAreaField label="Observación interna · no se envía al paciente" rows={2} maxLength={2000} value={notes} onChange={(event)=>setNotes(event.target.value)}/>
    </fieldset>{initial?.contact_dni&&kind!=='block'&&<p className="section-subtitle"><Link to={`/historias?q=${encodeURIComponent(initial.contact_dni)}`}>Buscar su ficha clínica por DNI</Link> · No se vincula ninguna historia automáticamente.</p>}{error&&<Notice>{error}</Notice>}<div className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy}>{busy?'Guardando…':'Guardar turno'}</button></div></Form></Modal>
}
