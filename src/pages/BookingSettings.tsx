import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft,Plus,Save,Trash2 } from 'lucide-react'
import { useClinic } from '../context'
import { bookingError,getBookingSettings,saveBookingSettings } from '../lib/booking'
import type { OpeningHours,BookingSettings as Settings } from '../lib/booking'
import { useRemote } from '../hooks/useRemote'
import { Field,Loading,Notice } from '../components/ui'
import { UnsavedChanges } from '../components/UnsavedChanges'
import { validateBookingSettings } from '../lib/validation'

const weekdays=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
export function BookingSettings() {
  const {membership}=useClinic()
  return membership.role==='owner'?<SettingsLoader/>:<Notice>Solo los administradores pueden cambiar los horarios de reserva.</Notice>
}
function SettingsLoader() {
  const {membership}=useClinic(),resource=useRemote(`booking-settings:${membership.clinicId}`,()=>getBookingSettings(membership.clinicId))
  const [message,setMessage]=useState('')
  return <><Link className="back-link" to="/agenda"><ArrowLeft size={15}/>Agenda</Link><div className="page-heading"><div><p className="eyebrow">CONFIGURACIÓN DE TURNOS</p><h1>Horarios y reservas web</h1><p className="page-description">La web ofrece consultas de 30 minutos. Las atenciones extendidas se cargan desde la agenda.</p></div></div>{message&&<Notice kind="success">{message}</Notice>}{resource.loading?<Loading/>:resource.error?<Notice>{bookingError(resource.error)} <button className="text-button" onClick={resource.reload}>Reintentar</button></Notice>:resource.data&&<SettingsForm key={resource.data.settings.version} initial={resource.data} onSaved={()=>{setMessage('Disponibilidad guardada. Los cambios ya se aplican a las nuevas reservas.');resource.reload()}}/>}</>
}
function SettingsForm({initial,onSaved}:{initial:Awaited<ReturnType<typeof getBookingSettings>>;onSaved:()=>void}) {
  const {membership}=useClinic()
  const [settings,setSettings]=useState<Settings>({...initial.settings,provider_name:initial.settings.provider_name||membership.clinic.professional})
  const [hours,setHours]=useState<OpeningHours[]>(initial.hours.map((hour)=>({...hour,opens:hour.opens.slice(0,5),closes:hour.closes.slice(0,5)})))
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const [baseline]=useState(()=>JSON.stringify({settings:{...initial.settings,provider_name:initial.settings.provider_name||membership.clinic.professional},hours:initial.hours.map((hour)=>({...hour,opens:hour.opens.slice(0,5),closes:hour.closes.slice(0,5)}))}))
  const dirty=JSON.stringify({settings,hours})!==baseline
  function update<K extends keyof Settings>(key:K,value:Settings[K]){setSettings((current)=>({...current,[key]:value}))}
  function updateHours(index:number,patch:Partial<OpeningHours>){setHours((current)=>current.map((hour,i)=>i===index?{...hour,...patch}:hour))}
  async function save(event:FormEvent) {
    event.preventDefault();setError('')
    const validation=validateBookingSettings(settings,hours)
    if(validation){setError(validation);return}
    setBusy(true)
    try{await saveBookingSettings(settings,hours);onSaved()}catch(err){setError(bookingError(err))}finally{setBusy(false)}
  }
  return <form className="panel" onSubmit={save}><UnsavedChanges dirty={dirty||busy} saving={busy}/><div className="panel-heading"><h2>Disponibilidad del consultorio</h2><span className={`status-badge ${settings.enabled?'confirmed':'cancelled'}`}>{settings.enabled?'Reservas habilitadas':'Reservas cerradas'}</span></div><div className="panel-content"><fieldset disabled={busy} className="settings-fields">
    <label className="toggle-field"><input type="checkbox" checked={settings.enabled} onChange={(event)=>update('enabled',event.target.checked)}/><span>Habilitar reservas automáticas por la web</span></label>
    <div className="field-grid settings-contact-grid"><label className="field"><span>Profesional que atiende</span><select value={settings.provider_id||''} onChange={(event)=>update('provider_id',event.target.value||null)}><option value="">Seleccionar profesional</option>{initial.practitioners.map((p)=><option key={p.user_id} value={p.user_id}>{p.email}</option>)}</select></label><Field label="Nombre público de la profesional" maxLength={120} value={settings.provider_name} onChange={(value)=>update('provider_name',value)}/></div>
    <p className="section-subtitle">Elegí a quien realiza las consultas. Una cuenta administrativa técnica no necesita tener agenda.</p>
    <div className="field-grid settings-contact-grid"><Field label="Identificador del enlace público" required pattern="[a-z0-9][a-z0-9-]{2,59}" maxLength={60} value={settings.slug} onChange={(value)=>update('slug',value)}/><Field label="Zona horaria" readOnly value={settings.timezone}/></div>
    <p className="section-subtitle">Enlace: <Link to={`/reservar/${settings.slug}`}>{`${window.location.origin}/reservar/${settings.slug}`}</Link></p>
    <h3>Reglas de reserva</h3><div className="field-grid"><Field label="Anticipación máxima (días)" type="number" min={1} max={180} required value={String(settings.advance_days)} onChange={(value)=>update('advance_days',Number(value))}/><Field label="Anticipación mínima (minutos)" type="number" min={0} max={10080} required value={String(settings.lead_minutes)} onChange={(value)=>update('lead_minutes',Number(value))}/><Field label="Cambios hasta (horas antes)" type="number" min={0} max={168} required value={String(settings.cancel_hours)} onChange={(value)=>update('cancel_hours',Number(value))}/></div>
    <h3>Días y franjas de atención</h3><p className="section-subtitle">Agregá dos franjas para separar mañana y tarde. Los bloqueos por feriados o ausencias se cargan en Agenda. Cambiar estas reglas no cancela reservas existentes.</p>
    <div className="opening-hours">{hours.map((hour,index)=><div className="opening-hour" key={index}><label className="field"><span>Día</span><select value={hour.weekday} onChange={(event)=>updateHours(index,{weekday:Number(event.target.value)})}>{weekdays.map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label><Field label="Desde" type="time" step={900} required value={hour.opens} onChange={(value)=>updateHours(index,{opens:value})}/><Field label="Hasta" type="time" step={900} required value={hour.closes} onChange={(value)=>updateHours(index,{closes:value})}/><button type="button" className="remove-evolution-button" aria-label={`Quitar franja ${index+1}`} onClick={()=>setHours((current)=>current.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div>)}</div>
    <button type="button" className="add-evolution-button" disabled={hours.length>=28} onClick={()=>setHours((current)=>[...current,{weekday:1,opens:'09:00',closes:'12:00'}])}><Plus size={16}/>Agregar franja</button>
    </fieldset>{error&&<Notice>{error}</Notice>}<div className="dialog-actions"><button type="submit" className="primary-button" disabled={busy||!dirty}><Save size={16}/>{busy?'Guardando…':'Guardar disponibilidad'}</button></div></div></form>
}
