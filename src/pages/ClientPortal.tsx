import { formatDate } from '../core/format'
import { useCallback,useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link,Navigate,useLocation } from 'react-router-dom'
import { CalendarDays,LogOut,Plus,UserRound } from 'lucide-react'
import { bookingError,changeMyAppointment,dateInZone,displayTime,getClientProfile,getMyAppointments,isActiveAppointment,plusDays,statusLabels } from '../lib/booking'
import type { MyAppointment } from '../lib/booking'
import { database } from '../lib/supabase'
import { useRemote } from '../hooks/useRemote'
import { useNow } from '../hooks/useNow'
import { ClientProfileForm } from '../components/ClientProfile'
import { Loading,Modal,Notice } from '../components/ui'
import { SlotPicker } from '../components/SlotPicker'

export function ClientPortal({session}:{session:Session}) {
  const profile=useRemote(`client-profile:${session.user.id}`,getClientProfile)
  const [edit,setEdit]=useState(false),[logoutError,setLogoutError]=useState('')
  const location=useLocation()
  const [notice,setNotice]=useState(()=>typeof location.state?.notice==='string'?location.state.notice:'')
  if(location.pathname!=='/mis-turnos')return <Navigate to="/mis-turnos" replace/>
  async function logout(){const {error}=await database().auth.signOut({scope:'local'});if(error)setLogoutError('No se pudo cerrar la sesión. Intentá nuevamente.')}
  return <div className="patient-layout"><header className="patient-topbar"><Link className="brand" to="/mis-turnos"><span className="brand-mark"><img src="/logo.svg" alt=""/></span>Mi consultorio</Link><div className="button-row"><button className="secondary-button" onClick={()=>setEdit(true)} disabled={!profile.data}><UserRound size={15}/>Mis datos</button><button className="secondary-button" onClick={logout}><LogOut size={15}/>Salir</button></div></header>
    <main className="booking-workspace">{logoutError&&<Notice>{logoutError}</Notice>}{profile.loading?<Loading/>:profile.error?<Notice>{bookingError(profile.error)} <button className="text-button" onClick={profile.reload}>Reintentar</button></Notice>:!profile.data?<section className="panel onboarding-panel"><p className="eyebrow">BIENVENIDO/A</p><h1>Completá tu cuenta</h1><ClientProfileForm session={session} onSaved={profile.reload}/></section>:<>
      <div className="page-heading"><div><p className="eyebrow">PORTAL DEL PACIENTE</p><h1>Hola, {profile.data.full_name}</h1><p className="page-description">Un turno futuro confirmado por profesional. Podés reprogramar o cancelar el existente.</p></div><Link className="primary-button" to="/reservar"><Plus size={17}/>Reservar turno</Link></div>
      {notice&&<Notice kind="success">{notice}</Notice>}<ClientAppointments onChanged={()=>setNotice('')}/>
    </>}</main>
    {edit&&profile.data&&<Modal title="Mis datos" onClose={()=>setEdit(false)}><ClientProfileForm session={session} initial={profile.data} onSaved={()=>{profile.reload();setEdit(false)}}/></Modal>}
  </div>
}

function ClientAppointments({onChanged}:{onChanged:()=>void}) {
  const appointments=useRemote('my-appointments',getMyAppointments)
  const now=useNow()
  const [selected,setSelected]=useState<{appointment:MyAppointment;mode:'cancel'|'reschedule'}|null>(null)
  const [date,setDate]=useState(()=>dateInZone()),[slot,setSlot]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [slotAvailable,setSlotAvailable]=useState(false)
  const [slotNotice,setSlotNotice]=useState(''),[availabilityAttempt,setAvailabilityAttempt]=useState(0)
  const selectSlot=useCallback((value:string,reason?:'unavailable')=>{setSlot(value);setSlotNotice(reason?'El horario que habías elegido ya no está disponible. Elegí otro.':'')},[])
  async function save() {
    if(!selected||busy||(selected.mode==='reschedule'&&!slotAvailable))return
    setBusy(true);setError('')
    try {await changeMyAppointment(selected.appointment,selected.mode==='cancel'?null:slot);setSelected(null);onChanged();appointments.reload()}
    catch(err){setError(bookingError(err));selectSlot('');setAvailabilityAttempt(current=>current+1);appointments.reload()}
    finally{setBusy(false)}
  }
  function choose(appointment:MyAppointment,mode:'cancel'|'reschedule'){
    const today=dateInZone(new Date(now),appointment.timezone),max=plusDays(today,appointment.advance_days)
    const original=dateInZone(appointment.starts_at,appointment.timezone)
    setError('');selectSlot('');setDate(original>=today&&original<=max?original:today);setSelected({appointment,mode})
  }
  const ordered=[...(appointments.data||[])].sort((a,b)=>{
    const aFuture=isActiveAppointment(a,now),bFuture=isActiveAppointment(b,now)
    return aFuture!==bFuture?aFuture?-1:1:aFuture?Date.parse(a.starts_at)-Date.parse(b.starts_at):Date.parse(b.starts_at)-Date.parse(a.starts_at)
  })
  return <section className="panel"><div className="panel-heading"><h2>Mis turnos</h2><button className="text-button" onClick={appointments.reload}>Actualizar</button></div>
    {appointments.loading?<Loading/>:appointments.error?<div className="panel-content"><Notice>{bookingError(appointments.error)}</Notice></div>:!ordered.length?<div className="empty-state"><CalendarDays size={30}/><h3>Todavía no tenés reservas</h3><p>Elegí un horario disponible para tu próxima consulta.</p><Link className="primary-button" to="/reservar">Buscar un turno</Link></div>:<div className="my-appointments">{ordered.map((appointment)=>{
      const changeable=appointment.status==='confirmed'&&Date.parse(appointment.starts_at)>now+appointment.cancel_hours*3600000
      return <article className={`my-appointment ${appointment.status}`} key={appointment.id}><div className="appointment-date"><strong>{formatDate(appointment.starts_at,appointment.timezone)}</strong><span>{displayTime(appointment.starts_at,appointment.timezone)}–{displayTime(appointment.ends_at,appointment.timezone)}</span></div><div className="appointment-copy"><span className={`status-badge ${appointment.status}`}>{statusLabels[appointment.status]}</span><h3>{appointment.clinic_name||'Consultorio'}</h3><p>{appointment.provider_name}</p><p>{appointment.address}</p>{appointment.notification_state&&appointment.notification_state!=='sent'&&appointment.status==='confirmed'&&<small>El aviso por email está pendiente. Tu turno ya está confirmado.</small>}{(!changeable||!appointment.can_reschedule)&&isActiveAppointment(appointment,now)&&<small>Para reprogramar esta reserva, contactá al consultorio{appointment.phone?`: ${appointment.phone}`:'.'}</small>}</div><div className="appointment-actions">{changeable&&<>{appointment.can_reschedule&&<button className="secondary-button" onClick={()=>choose(appointment,'reschedule')}>Reprogramar</button>}<button className="text-button cancel-link" onClick={()=>choose(appointment,'cancel')}>Cancelar turno</button></>}</div></article>
    })}</div>}
    {selected&&<Modal title={selected.mode==='cancel'?'¿Cancelar este turno?':'Reprogramar turno'} onClose={()=>{if(!busy)setSelected(null)}}>{selected.mode==='cancel'?<p>El horario quedará libre para otra persona y se registrará el aviso de cancelación.</p>:<SlotPicker key={`${selected.appointment.id}:${availabilityAttempt}`} disabled={busy} page={{slug:selected.appointment.slug,timezone:selected.appointment.timezone,advance_days:selected.appointment.advance_days}} date={date} onDate={setDate} selected={slot} onSelect={selectSlot} onAvailabilityChange={setSlotAvailable}/>}<p className="section-subtitle">Cambios permitidos hasta {selected.appointment.cancel_hours} horas antes del turno actual.</p>{slotNotice&&<Notice kind="info">{slotNotice}</Notice>}{error&&<Notice>{error}</Notice>}<div className="dialog-actions"><button className="secondary-button" disabled={busy} onClick={()=>setSelected(null)}>Volver</button><button className={selected.mode==='cancel'?'danger-button':'primary-button'} disabled={busy||(selected.mode==='reschedule'&&(!slot||!slotAvailable))} onClick={save}>{busy?'Guardando…':selected.mode==='cancel'?'Confirmar cancelación':'Confirmar nuevo horario'}</button></div></Modal>}
  </section>
}
