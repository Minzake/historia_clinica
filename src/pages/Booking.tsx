import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Link,useNavigate } from 'react-router-dom'
import { CalendarDays,Check,Clock,MapPin } from 'lucide-react'
import { bookAppointment,bookingError,dateInZone,displayTime,getBookingPages,getClientProfile,getMyAppointments,isActiveAppointment } from '../lib/booking'
import { useRemote } from '../hooks/useRemote'
import { useNow } from '../hooks/useNow'
import { Loading,Modal,Notice } from '../components/ui'
import { ClientProfileForm } from '../components/ClientProfile'
import { SlotPicker } from '../components/SlotPicker'

export function Booking({session,slug=''}:{session:Session|null;slug?:string}) {
  const now=useNow()
  const pages=useRemote('public-booking-pages',getBookingPages)
  const profile=useRemote(`booking-profile:${session?.user.id||'guest'}`,()=>session?getClientProfile():Promise.resolve(null))
  const appointments=useRemote(`booking-appointments:${session?.user.id||'guest'}`,()=>session?getMyAppointments():Promise.resolve([]))
  const [chosen,setChosen]=useState(slug),[date,setDate]=useState(()=>dateInZone()),[selected,setSelected]=useState('')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[onboarding,setOnboarding]=useState(false)
  const page=pages.data?.find((item)=>item.slug===(chosen||pages.data?.[0]?.slug))
  const active=appointments.data?.find((appointment)=>appointment.provider_id===page?.provider_id&&isActiveAppointment(appointment,now))
  const navigate=useNavigate()
  async function confirm() {
    if(!page||!selected||!session||busy||appointments.loading||appointments.error||active)return
    if(!profile.data){setOnboarding(true);return}
    setBusy(true);setError('')
    try {
      const result=await bookAppointment(page.slug,selected)
      navigate('/mis-turnos',{state:{notice:result.notification.sent?'Turno confirmado. Se envió el aviso por email.':'Turno confirmado. El aviso por email está pendiente; la reserva ya está guardada.'}})
    }catch(err){setError(bookingError(err));setSelected('');appointments.reload()}
    finally{setBusy(false)}
  }
  return <div className="patient-layout"><header className="patient-topbar"><Link className="brand" to={session?'/mis-turnos':'/'}><span className="brand-mark"><img src="/logo.svg" alt=""/></span>Consultorio · Turnos</Link><Link className="secondary-button" to={session?'/mis-turnos':'/'}>{session?'Mis turnos':'Ingresar'}</Link></header>
    <main className="booking-workspace"><div className="page-heading"><div><p className="eyebrow">RESERVA ONLINE</p><h1>Reservá tu consulta</h1><p className="page-description">Atención de consultorio · 30 minutos · Confirmación automática</p></div></div>
      {pages.loading?<Loading/>:pages.error?<Notice>{bookingError(pages.error)} <button className="text-button" onClick={pages.reload}>Reintentar</button></Notice>:!pages.data?.length?<section className="panel empty-state"><CalendarDays size={32}/><h2>La agenda web todavía no está abierta</h2><p>El consultorio debe configurar sus días y horarios. Podés crear tu cuenta para reservar cuando se habilite.</p><Link className="primary-button" to={session?'/mis-turnos':'/registro'}>{session?'Ir a mis turnos':'Crear mi cuenta'}</Link></section>:!page?<Notice>No encontramos esa agenda. <button className="text-button" onClick={()=>setChosen('')}>Ver consultorios disponibles</button></Notice>:<div className="booking-layout">
        <aside className="panel booking-info"><p className="eyebrow">TU ATENCIÓN</p><h2>{page.name}</h2>{pages.data.length>1&&<label className="field"><span>Consultorio</span><select value={page.slug} onChange={(event)=>{setChosen(event.target.value);setSelected('')}}>{pages.data.map((item)=><option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>}
          <p><CalendarDays size={16}/>{page.provider_name}</p><p><Clock size={16}/>Consulta de 30 minutos</p>{page.address&&<p><MapPin size={16}/>{page.address}</p>}
          <div className="booking-rules"><strong>Antes de reservar</strong><p>Podés cancelar o reprogramar por la web hasta {page.cancel_hours} horas antes. Para atenciones específicas o más largas, contactá al profesional.</p><p>Los horarios no se retienen mientras completás tu cuenta. Se comprueban nuevamente al confirmar.</p></div>
        </aside>
        <section className="panel booking-form"><h2>Elegí día y horario</h2>{session&&appointments.loading?<Loading label="Verificando tus turnos…"/>:session&&appointments.error?<Notice>{bookingError(appointments.error)} <button type="button" className="text-button" onClick={appointments.reload}>Reintentar</button></Notice>:active?<><Notice kind="info">Ya tenés un turno confirmado con {page.provider_name} el {new Date(active.starts_at).toLocaleDateString('es-AR',{timeZone:active.timezone})} a las {displayTime(active.starts_at,active.timezone)}. Podés reprogramarlo o cancelarlo desde Mis turnos.</Notice><Link className="primary-button" to="/mis-turnos">Ver mi turno</Link></>:<><SlotPicker page={page} date={date} onDate={setDate} selected={selected} onSelect={setSelected}/>
          {error&&<Notice>{error}</Notice>}
          {selected&&<Notice kind="info">Seleccionaste el {new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR',{timeZone:'UTC'})} a las {displayTime(selected,page.timezone)}.</Notice>}
          {!session?<div className="booking-auth-prompt"><p>Para confirmar necesitás una cuenta con DNI y email verificado.</p><div className="button-row"><Link className="primary-button" to={`/registro?consultorio=${encodeURIComponent(page.slug)}`}>Crear cuenta</Link><Link className="secondary-button" to="/">Ya tengo cuenta</Link></div></div>:profile.loading?<Loading label="Verificando tus datos…"/>:profile.error?<Notice>{bookingError(profile.error)}</Notice>:<button className="primary-button booking-confirm" type="button" disabled={!selected||busy} onClick={confirm}><Check size={17}/>{busy?'Confirmando…':profile.data?'Confirmar turno':'Completar mis datos y reservar'}</button>}
          <p className="section-subtitle">Un turno futuro confirmado por paciente y profesional. Para cambiarlo, reprogramá el existente.</p></>}
        </section>
      </div>}
    </main>
    {onboarding&&session&&<Modal title="Tus datos de paciente" onClose={()=>setOnboarding(false)}><ClientProfileForm session={session} onSaved={()=>{profile.reload();setOnboarding(false)}}/></Modal>}
  </div>
}
