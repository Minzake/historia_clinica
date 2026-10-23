import { formatDate } from '../core/format'
import { useCallback,useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link,useLocation,useNavigate } from 'react-router-dom'
import { CalendarDays,Check,Clock,MapPin } from 'lucide-react'
import { bookAppointment,bookingError,dateInZone,displayTime,getBookingPages,getClientProfile,getMyAppointments,isActiveAppointment } from '../lib/booking'
import { useRemote } from '../hooks/useRemote'
import { useNow } from '../hooks/useNow'
import { Loading,Modal,Notice } from '../components/ui'
import { ClientProfileForm } from '../components/ClientProfile'
import { SlotPicker } from '../components/SlotPicker'
import { bookingDestination,bookingSelection } from '../lib/booking-navigation'
import './booking.css'

export function Booking({session,slug=''}:{session:Session|null;slug?:string}) {
  const now=useNow()
  const location=useLocation(),requested=bookingSelection(location.search)
  const pages=useRemote('public-booking-pages',getBookingPages)
  const profile=useRemote(`booking-profile:${session?.user.id||'guest'}`,()=>session?getClientProfile():Promise.resolve(null))
  const appointments=useRemote(`booking-appointments:${session?.user.id||'guest'}`,()=>session?getMyAppointments():Promise.resolve([]))
  const [chosen,setChosen]=useState(slug),[date,setDate]=useState(()=>requested.date||dateInZone()),[selected,setSelected]=useState(requested.slot)
  const [selectionAvailable,setSelectionAvailable]=useState(false)
  const [selectionNotice,setSelectionNotice]=useState(''),[availabilityAttempt,setAvailabilityAttempt]=useState(0)
  const selectSlot=useCallback((value:string,reason?:'unavailable')=>{setSelected(value);setSelectionNotice(reason?'El horario que habías elegido ya no está disponible. Elegí otro.':'')},[])
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[onboarding,setOnboarding]=useState(false)
  const page=pages.data?.find((item)=>(item.slug===(chosen||pages.data?.[0]?.slug)||item.aliases?.includes(chosen)))
  const active=appointments.data?.find((appointment)=>appointment.provider_id===page?.provider_id&&isActiveAppointment(appointment,now))
  const navigate=useNavigate()
  const destination=bookingDestination(page?.slug||'',date,selected)
  const loginUrl=`/?${new URLSearchParams({volver:destination})}`
  const registerUrl=`/registro?${new URLSearchParams({consultorio:page?.slug||'',volver:destination})}`
  async function confirm() {
    if(!page||!selected||!selectionAvailable||!session||busy||appointments.loading||appointments.error||active)return
    if(!profile.data){setOnboarding(true);return}
    setBusy(true);setError('')
    try {
      const result=await bookAppointment(page.slug,selected)
      navigate('/mis-turnos',{state:{notice:result.notification.sent?'Turno confirmado. Se envió el aviso por email.':'Turno confirmado. El aviso por email está pendiente; la reserva ya está guardada.'}})
    }catch(err){setError(bookingError(err));setSelected('');setAvailabilityAttempt(current=>current+1);appointments.reload()}
    finally{setBusy(false)}
  }
  return <div className="patient-layout booking-page"><header className="patient-topbar"><Link className="brand" to={session?'/mis-turnos':'/'}><span className="brand-mark"><img src="/logo.svg" alt=""/></span>Consultorio · Turnos</Link><Link className="secondary-button" to={session?'/mis-turnos':loginUrl}>{session?'Mis turnos':'Ingresar'}</Link></header>
    <main className="booking-workspace"><div className="page-heading"><div><p className="eyebrow">RESERVA ONLINE</p><h1>Reservá tu consulta</h1><p className="page-description">Elegí una atención disponible y confirmá tu horario.</p></div></div>
      {pages.loading?<Loading/>:pages.error?<Notice>{bookingError(pages.error)} <button className="text-button" onClick={pages.reload}>Reintentar</button></Notice>:!pages.data?.length?<section className="panel empty-state"><CalendarDays size={32}/><h2>La agenda web todavía no está abierta</h2><p>El consultorio debe configurar sus días y horarios. Podés crear tu cuenta para reservar cuando se habilite.</p><Link className="primary-button" to={session?'/mis-turnos':'/registro'}>{session?'Ir a mis turnos':'Crear mi cuenta'}</Link></section>:!page?<Notice>No encontramos esa agenda. <button className="text-button" onClick={()=>setChosen('')}>Ver consultorios disponibles</button></Notice>:<div className="booking-layout">
        <aside className="panel booking-info"><p className="eyebrow">TU ATENCIÓN</p><h2>{page.name}</h2>{pages.data.length>1&&<label className="field"><span>Atención</span><select value={page.slug} onChange={(event)=>{setChosen(event.target.value);setSelected('')}}>{pages.data.map((item)=><option key={item.slug} value={item.slug}>{item.name} · {item.service_name||"Consulta"} · {item.provider_name}</option>)}</select></label>}
          <p><CalendarDays size={16}/>{page.provider_name}</p><p><Clock size={16}/>{page.service_name||"Consulta"} · {page.duration_minutes} minutos</p>{page.address&&<p className="booking-address"><MapPin size={16}/>{page.address}</p>}
          <details className="booking-rules"><summary>Ubicación y condiciones del turno</summary>{page.address&&<p className="booking-address-details">Dirección: {page.address}</p>}<p>Podés cancelar o reprogramar por la web hasta {page.cancel_hours} horas antes. Para atenciones específicas o más largas, contactá al profesional.</p><p>El horario se vuelve a comprobar al confirmar la reserva.</p></details>
        </aside>
        <section className="panel booking-form"><h2>Elegí día y horario</h2><p className="booking-form-intro">Tocá un día y después elegí la hora que te quede cómoda.</p>{session&&appointments.loading?<Loading label="Verificando tus turnos…"/>:session&&appointments.error?<Notice>{bookingError(appointments.error)} <button type="button" className="text-button" onClick={appointments.reload}>Reintentar</button></Notice>:active?<><Notice kind="info">Ya tenés un turno confirmado con {page.provider_name} el {formatDate(active.starts_at,active.timezone)} a las {displayTime(active.starts_at,active.timezone)}. Podés reprogramarlo o cancelarlo desde Mis turnos.</Notice><Link className="primary-button" to="/mis-turnos">Ver mi turno</Link></>:<><SlotPicker key={`${page.slug}:${availabilityAttempt}`} disabled={busy} page={page} date={date} onDate={setDate} selected={selected} onSelect={selectSlot} onAvailabilityChange={setSelectionAvailable}/>
          {selectionNotice&&<Notice kind="info">{selectionNotice}</Notice>}{error&&<Notice>{error}</Notice>}
          <div className="booking-checkout">
            <div className="booking-selection" aria-live="polite"><CalendarDays size={20} aria-hidden="true"/><div><strong>{selected?`${formatDate(date)} · ${displayTime(selected,page.timezone)}`:'Elegí un horario para continuar'}</strong><span>{selected?`${page.provider_name} · ${page.duration_minutes} minutos`:'Tu reserva queda confirmada al finalizar.'}</span></div>{selected&&<Check size={18} aria-hidden="true"/>}</div>
            {!session?<div className="booking-auth-prompt"><p>Ingresá o creá tu cuenta para confirmar. Conservamos tu selección y volvemos a comprobar la disponibilidad al ingresar.</p><div className="button-row"><Link className="primary-button" to={loginUrl}>Ya tengo cuenta</Link><Link className="secondary-button" to={registerUrl}>Crear cuenta</Link></div></div>:profile.loading?<Loading label="Verificando tus datos…"/>:profile.error?<Notice>{bookingError(profile.error)} <button className="text-button" type="button" onClick={profile.reload}>Reintentar</button></Notice>:<button className="primary-button booking-confirm" type="button" disabled={!selected||!selectionAvailable||busy} onClick={confirm}><Check size={17}/>{busy?'Confirmando…':profile.data?'Confirmar turno':'Completar mis datos'}</button>}
          </div>
          <p className="section-subtitle booking-limit-note">Podés tener un turno futuro por profesional. Si ya reservaste, cambialo desde Mis turnos.</p></>}
        </section>
      </div>}
    </main>
    {onboarding&&session&&<Modal title="Tus datos de paciente" onClose={()=>setOnboarding(false)}><ClientProfileForm session={session} onSaved={()=>{profile.reload();setOnboarding(false)}}/></Modal>}
  </div>
}
