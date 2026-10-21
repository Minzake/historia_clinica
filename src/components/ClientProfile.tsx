import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { bookingError,saveClientProfile } from '../lib/booking'
import type { ClientProfile } from '../lib/booking'
import { Field,Notice } from './ui'

export function ClientProfileForm({session,initial,onSaved}:{session:Session;initial?:ClientProfile|null;onSaved:(profile:ClientProfile)=>void}) {
  const metadata=session.user.user_metadata||{}
  const safe=(value:unknown)=>typeof value==='string'?value:''
  const [name,setName]=useState(initial?.full_name||safe(metadata.full_name))
  const [dni,setDni]=useState(initial?.dni||safe(metadata.dni))
  const [phone,setPhone]=useState(initial?.phone||safe(metadata.phone))
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  async function save(event:FormEvent) {
    event.preventDefault();setError('');setBusy(true)
    try {onSaved(await saveClientProfile(name,dni,phone,safe(metadata.booking_slug)||undefined))}catch(err){setError(bookingError(err))}finally{setBusy(false)}
  }
  return <form onSubmit={save} className="client-profile-form"><p>Estos datos identifican tu cuenta y tus reservas. No otorgan acceso a una historia clínica.</p>
    <fieldset disabled={busy} className="settings-fields"><Field label="Nombre y apellido" required minLength={2} value={name} onChange={setName}/><Field label="DNI" required inputMode="numeric" maxLength={16} readOnly={Boolean(initial)} pattern="[0-9. -]{6,16}" value={dni} onChange={setDni}/><Field label="Email verificado" type="email" value={session.user.email||''} readOnly/><Field label="Celular (opcional)" type="tel" maxLength={40} value={phone} onChange={setPhone}/></fieldset>
    {initial&&<p className="section-subtitle">Si tu DNI tiene un error, contactá al consultorio para revisar la identificación.</p>}{error&&<Notice>{error}</Notice>}
    <div className="dialog-actions"><button type="submit" className="primary-button" disabled={busy}>{busy?'Guardando…':initial?'Guardar mis datos':'Completar mis datos'}</button></div>
  </form>
}
