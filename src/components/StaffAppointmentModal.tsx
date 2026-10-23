import { formatDate } from '../core/format'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useClinic } from '../context'
import { bookingError, dateInZone, displayTime, getAgenda, localDateTime, plusDays, saveStaffAppointment, searchRegisteredPatients, zonedInstant } from '../lib/booking'
import type { Appointment, AppointmentStatus, BookingSettings, OpeningHours, Practitioner, Service, StaffAppointmentInput } from '../lib/booking'
import { appointmentOverlap, eligiblePractitioners, initialAppointmentService, initialAppointmentTime, suggestedAppointmentTimes } from '../lib/agenda-ui'
import { useRemote } from '../hooks/useRemote'
import { useNow } from '../hooks/useNow'
import { Field, Form, Modal, Notice, SelectField, TextAreaField } from './ui'
import { UnsavedChanges } from './UnsavedChanges'
import { canReadClinical, specialtyAccess } from '../core/access'
import { dniError, normalizeDni } from '../lib/validation'
import { listPatientIdentities } from '../core/patients'
import { DayPicker } from './DayPicker'
import { Check, Clock, Search, Sun, Sunset, UserRound } from 'lucide-react'

type Props = {
  initial: Appointment | null; kind: 'consultation' | 'block'; day: string; timezone: string
  practitioners: Practitioner[]; services: Service[]; settings: BookingSettings; hours: OpeningHours[]
  defaultProvider: string; onClose: () => void; onSaved: () => void
}

function validInstant(value: string, timezone: string) {
  try { return zonedInstant(value, timezone) } catch { return '' }
}

export function StaffAppointmentModal({ initial, kind, day, timezone, practitioners, services, settings, hours, defaultProvider, onClose, onSaved }: Props) {
  const { membership, userId } = useClinic()
  const now = useNow()
  const block = kind === 'block'
  const availableServices=services.filter(service=>service.id===initial?.service_id||service.active&&eligiblePractitioners(practitioners,service,userId||undefined,membership.role==='professional').length)
  const initialService = initial?.service_id || initialAppointmentService(services,practitioners,settings.service_id,defaultProvider,userId||undefined,membership.role==='professional')
  const [service, setService] = useState(initialService)
  const selectedService = services.find(s => s.id === service)
  const eligible = !block&&services.length&&!selectedService?[]:eligiblePractitioners(practitioners, block ? undefined : selectedService, userId || undefined, membership.role === 'professional')
  const [provider, setProvider] = useState(() => initial?.provider_id || (eligible.some(p => p.user_id === defaultProvider) ? defaultProvider : eligible.length === 1 ? eligible[0].user_id : ''))
  const [dateTime, setDateTime] = useState(initial ? localDateTime(initial.starts_at, timezone) : `${day}T${initialAppointmentTime(day, timezone)}`)
  const date = dateTime.slice(0, 10), time = dateTime.slice(11)
  const [duration, setDuration] = useState(initial ? String(Math.round((Date.parse(initial.ends_at) - Date.parse(initial.starts_at)) / 60000)) : String(selectedService?.duration_minutes || 30))
  const [until, setUntil] = useState(() => initial ? localDateTime(initial.ends_at, timezone) : localDateTime(new Date(Date.parse(zonedInstant(dateTime, timezone)) + 3600000).toISOString(), timezone))
  const [name, setName] = useState(initial?.contact_name || ''), [dni, setDni] = useState(initial?.contact_dni || '')
  const [email, setEmail] = useState(initial?.contact_email || ''), [phone, setPhone] = useState(initial?.contact_phone || ''), [notes, setNotes] = useState(initial?.private_notes || '')
  const [manualContact, setManualContact] = useState({name,dni,email,phone})
  const [useAccount, setUseAccount] = useState(Boolean(initial?.client_user_id)), [accountId, setAccountId] = useState(initial?.client_user_id || '')
  const [accountQuery, setAccountQuery] = useState(''), [submittedQuery, setSubmittedQuery] = useState('')
  const [findPatient, setFindPatient] = useState(!initial), [patientQuery, setPatientQuery] = useState(''), [patientSearch, setPatientSearch] = useState('')
  const [compactPatient,setCompactPatient]=useState(Boolean(initial?.contact_dni))
  const patients = useRemote(`appointment-patients:${membership.clinicId}:${patientSearch}`, () => patientSearch.length >= 2 ? listPatientIdentities(membership.clinicId, patientSearch) : Promise.resolve({patients:[],count:0}))
  const accounts = useRemote(`registered:${membership.clinicId}:${useAccount}:${submittedQuery}`, () => useAccount && !initial?.client_user_id ? searchRegisteredPatients(membership.clinicId, submittedQuery) : Promise.resolve([]))
  const [status, setStatus] = useState<AppointmentStatus>(initial?.status || 'confirmed')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [allTimes, setAllTimes] = useState(false)
  const [more, setMore] = useState(false),[manualTime,setManualTime]=useState(Boolean(initial)),[durationOpen,setDurationOpen]=useState(false)
  const [period,setPeriod]=useState<'morning'|'afternoon'>(()=>time<'12:00'?'morning':'afternoon')
  const [baseline, setBaseline] = useState(() => JSON.stringify({ provider, dateTime, service, duration, until, name, dni, email, phone, notes, accountId, status }))
  const autoSelected = useRef(Boolean(initial))
  const dirty = baseline !== JSON.stringify({ provider, dateTime, service, duration, until, name, dni, email, phone, notes, accountId, status })
  function close() { if (!busy && (!dirty || window.confirm('Hay cambios sin guardar en el turno. ¿Querés descartarlos?'))) onClose() }
  const notesAccess = specialtyAccess(membership, selectedService?.specialty_id || 'podologia')
  const canManageNotes = membership.role !== 'reception' && (initial?.can_manage_notes ?? (provider === userId || Boolean(notesAccess?.canRead && notesAccess.scope === 'all')))
  const start = validInstant(dateTime, timezone)
  const minutes = block ? (Date.parse(validInstant(until, timezone)) - Date.parse(start)) / 60000 : Number(duration)
  const future = !start || Date.parse(start) > now
  const from = date && start ? zonedInstant(`${date}T00:00`, timezone) : ''
  const lastDate = block && minutes > 0 && minutes <= 44640 ? until.slice(0,10) : date
  const to = from ? zonedInstant(`${plusDays(lastDate, 1)}T00:00`, timezone) : ''
  // Reload for every day and provider, including when a turn is moved outside the visible week.
  const occupancy = useRemote(`staff-occupancy:${membership.clinicId}:${from}:${to}:${provider}`, () => from && to && provider ? getAgenda(membership.clinicId, from, to) : Promise.resolve([]))
  const conflict = status !== 'cancelled' && start ? appointmentOverlap(occupancy.data || [], provider, start, minutes, initial?.id) : undefined
  const conflictMessage = conflict ? `Se superpone con ${conflict.kind === 'block' ? 'un bloqueo' : 'otro turno'} de ${displayTime(conflict.starts_at, timezone)} a ${displayTime(conflict.ends_at, timezone)}. Elegí otro horario.` : ''
  const configuredHours = provider === settings.provider_id && service === settings.service_id && hours.length ? hours : undefined
  const times = start ? suggestedAppointmentTimes(date, timezone, minutes, provider, occupancy.data || [], configuredHours, now, initial?.id) : []
  const morning=times.filter(time=>time<'12:00'),afternoon=times.filter(time=>time>='12:00')
  const activePeriod=period==='morning'?(morning.length?'morning':'afternoon'):(afternoon.length?'afternoon':'morning')
  const visibleTimes=activePeriod==='morning'?morning:afternoon
  const firstTime = times.includes(time)?time:visibleTimes[0]||''
  useEffect(()=>{if(!findPatient)return;const timer=setTimeout(()=>setPatientSearch(patientQuery.trim()),300);return ()=>clearTimeout(timer)},[patientQuery,findPatient])
  useEffect(() => {
    if (block || autoSelected.current || occupancy.loading || occupancy.error || !provider || !firstTime) return
    autoSelected.current = true
    setDateTime(`${date}T${firstTime}`)
    setBaseline(current => { const saved = JSON.parse(current); return JSON.stringify({...saved,dateTime:`${saved.dateTime.slice(0,10)}T${firstTime}`}) })
  }, [block, occupancy.loading, occupancy.error, provider, firstTime, date])
  const end = start && Number.isFinite(minutes) && minutes > 0 && minutes <= 44640 ? new Date(Date.parse(start) + minutes * 60000).toISOString() : ''
  function changeService(id: string) {
    autoSelected.current=Boolean(initial);setAllTimes(false)
    setService(id)
    const next = services.find(s => s.id === id)
    if (!initial) setDuration(String(next?.duration_minutes || 30))
    const options = eligiblePractitioners(practitioners, next, userId || undefined, membership.role === 'professional')
    if (!options.some(p => p.user_id === provider)) setProvider(options.length === 1 ? options[0].user_id : '')
  }
  function selectAccount(id: string) {
    setAccountId(id)
    const account = accounts.data?.find(a => a.user_id === id)
    if (account) { setName(account.full_name); setDni(account.dni); setEmail(account.email); setPhone(account.phone) }
  }
  function searchPatients() { if (patientQuery.trim().length >= 2) { setPatientSearch(patientQuery.trim()); patients.reload() } }
  function searchAccounts() { setAccountId(''); setSubmittedQuery(accountQuery.trim()); accounts.reload() }
  function toggleAccount() {
    setFindPatient(false);setCompactPatient(false)
    setUseAccount(!useAccount); setAccountId('')
    if (useAccount) { setName(manualContact.name); setDni(manualContact.dni); setEmail(manualContact.email); setPhone(manualContact.phone) }
    else { setManualContact({name,dni,email,phone}); setName(''); setDni(''); setEmail(''); setPhone('') }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if(!block&&!useAccount&&findPatient){setError('Elegí un paciente de la lista o cargá sus datos para continuar.');return}
    if (useAccount && !accountId) { setError('Seleccioná una cuenta verificada o elegí cargar los datos manualmente.'); return }
    if(!block&&(!Number.isInteger(minutes)||minutes<15||minutes>480||minutes%15!==0)){setDurationOpen(true);setError('La duración debe ser de 15 a 480 minutos, en intervalos de 15.');return}
    if (conflictMessage) { setError(conflictMessage); return }
    setBusy(true)
    try {
      const data: StaffAppointmentInput = { provider_id: provider, service_id: block ? undefined : service || undefined, client_user_id: useAccount ? accountId || null : null, starts_at: zonedInstant(dateTime, timezone), duration_minutes: minutes, kind, status, name: name.trim(), dni: normalizeDni(dni), email: email.trim(), phone: phone.trim(), notes: canManageNotes ? notes : '' }
      await saveStaffAppointment(membership.clinicId, initial, data); onSaved()
    } catch (err) { setError(bookingError(err)); setMore(true); occupancy.reload() } finally { setBusy(false) }
  }
  return <Modal className={`appointment-dialog ${block?'appointment-dialog--block':''}`} title={block ? initial ? 'Editar bloqueo' : 'Bloquear horario' : initial ? 'Editar turno' : 'Nuevo turno'} onClose={close}>
    <UnsavedChanges dirty={dirty} saving={busy}/>
    <Form className="staff-appointment-form" onSubmit={submit}>
      <fieldset disabled={busy} className="settings-fields appointment-fields">
        {!block&&<section className="appointment-form-section">
          <h3><UserRound size={17} aria-hidden="true"/>Paciente</h3>
          {findPatient&&!useAccount?<>
            <Field label="Buscar paciente por nombre o DNI" type="search" placeholder="Escribí un nombre o DNI" value={patientQuery} onChange={setPatientQuery} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();searchPatients()}}}/>
            {patientQuery.trim().length>=2&&((patientSearch!==patientQuery.trim()||patients.loading)?<p className="appointment-search-status" role="status">Buscando pacientes…</p>:patients.error?<Notice>{bookingError(patients.error)}</Notice>:<div className="patient-appointment-results" role="group" aria-label="Pacientes encontrados">
              {patients.data?.patients.map(patient=><button type="button" className="secondary-button appointment-patient-result" key={patient.id} aria-label={`${patient.full_name} · DNI ${patient.dni||'no informado'}`} onClick={()=>{setName(patient.full_name);setDni(patient.dni);setPhone(patient.details.mobile||patient.details.phone||'');setEmail('');setCompactPatient(Boolean(patient.dni));setFindPatient(false)}}><UserRound size={18} aria-hidden="true"/><span><strong>{patient.full_name}</strong><small>DNI {patient.dni||'no informado'}</small></span><Check size={16} aria-hidden="true"/></button>)}
              {!patients.data?.patients.length&&<p className="section-subtitle">No encontramos coincidencias. Podés cargar sus datos.</p>}
            </div>)}
            <button type="button" className="secondary-button appointment-new-patient" onClick={()=>{setCompactPatient(false);setFindPatient(false)}}>{name?'Volver a los datos del paciente':'Cargar un paciente nuevo'}</button>
          </>:<>
            {compactPatient?<div className="appointment-selected-patient"><div><strong>{name}</strong><span>DNI {dni}</span></div><button type="button" className="text-button" onClick={()=>setCompactPatient(false)}>Ver datos</button></div>:<>
            <div className="field-grid patient-appointment-fields">
              <Field label="Nombre y apellido del paciente" required minLength={2} value={name} onChange={setName} readOnly={useAccount}/>
              <Field label="DNI" validationMessage={dniError(dni,future&&status==='confirmed'&&!useAccount)} inputMode="numeric" maxLength={16} required={future&&status==='confirmed'&&!useAccount} value={dni} onChange={setDni} readOnly={useAccount}/>
            </div>
            </>}
            {!useAccount&&!initial&&<button type="button" className="text-button" onClick={()=>setFindPatient(true)}><Search size={14} aria-hidden="true"/>Buscar otro paciente</button>}
            {useAccount&&<p className="section-subtitle">Vinculado a su cuenta del portal de pacientes.</p>}
          </>}
        </section>}

        <section className="appointment-form-section">
          <h3><Clock size={17} aria-hidden="true"/>{block?'Horario a bloquear':'Día y horario'}</h3>
          {!block&&availableServices.length>1&&<SelectField label="Prestación del turno" required value={service} onChange={event=>changeService(event.target.value)}>{availableServices.map(item=><option value={item.id} key={item.id}>{item.name} · {item.duration_minutes} min</option>)}</SelectField>}
          {eligible.length>1?<SelectField label="Profesional" required value={provider} onChange={event=>{autoSelected.current=Boolean(initial);setProvider(event.target.value);setAllTimes(false)}}><option value="">Seleccionar profesional</option>{eligible.map(person=><option key={person.user_id} value={person.user_id}>{person.display_name||person.email}</option>)}</SelectField>:eligible.length===1&&<p className="appointment-assignee"><span>Profesional</span><strong>{eligible[0].display_name||eligible[0].email}</strong></p>}
          {!eligible.length&&<Notice>No hay profesionales habilitados para esta prestación. Revisá sus permisos en Usuarios.</Notice>}
          {block?<>
            <div className="field-grid settings-contact-grid">
              <Field label="Desde" type="datetime-local" required value={dateTime} onChange={setDateTime}/>
              <Field label="Hasta" type="datetime-local" required validationMessage={until&&dateTime&&until<=dateTime?'El final del bloqueo debe ser posterior al inicio.':conflictMessage} value={until} onChange={setUntil}/>
            </div>
            <Field label="Motivo del bloqueo (interno)" value={name} onChange={setName}/>
          </>:<>
            <div className="appointment-date-duration">
              <DayPicker label="Día del turno" max="9999-12-30" value={date} today={dateInZone(new Date(now),timezone)} onChange={value=>{autoSelected.current=Boolean(initial);setDateTime(`${value}T${time}`);setAllTimes(false)}}/>
              <div className="appointment-duration-choice"><span>{duration||'—'} minutos{selectedService&&availableServices.length===1?` · ${selectedService.name}`:''}</span><button type="button" className="text-button" aria-expanded={durationOpen} onClick={()=>setDurationOpen(!durationOpen)}>{durationOpen?'Listo':'Cambiar duración'}</button></div>
            </div>
            {durationOpen&&<div className="appointment-duration">
              <Field label="Duración (minutos)" type="number" min={15} max={480} step={15} required value={duration} onChange={setDuration}/>
              <div className="button-row" role="group" aria-label="Duraciones frecuentes">{[30,45,60,90].map(value=><button className="secondary-button" type="button" key={value} aria-pressed={duration===String(value)} onClick={()=>setDuration(String(value))}>{value} min</button>)}</div>
            </div>}
            {provider&&<div className="appointment-time-picker">
              <strong>Horarios disponibles</strong>
              {occupancy.loading?<p className="appointment-search-status" role="status">Consultando horarios…</p>:occupancy.error?<Notice>No pudimos consultar la disponibilidad. <button className="text-button" type="button" onClick={occupancy.reload}>Reintentar</button></Notice>:<>
                {morning.length>0&&afternoon.length>0&&<div className="schedule-time-periods" role="group" aria-label="Franja horaria"><button type="button" aria-label="Horarios de mañana" aria-pressed={activePeriod==='morning'} onClick={()=>{setPeriod('morning');setAllTimes(false)}}><Sun size={15} aria-hidden="true"/>Mañana<small>{morning.length}</small></button><button type="button" aria-label="Horarios de tarde" aria-pressed={activePeriod==='afternoon'} onClick={()=>{setPeriod('afternoon');setAllTimes(false)}}><Sunset size={15} aria-hidden="true"/>Tarde<small>{afternoon.length}</small></button></div>}
                <div className="appointment-times">{(allTimes?visibleTimes:visibleTimes.slice(0,8)).map(value=><button type="button" className="secondary-button" aria-pressed={time===value} key={value} onClick={()=>{autoSelected.current=true;setDateTime(`${date}T${value}`)}}>{value}</button>)}</div>
                {!times.length&&<p className="section-subtitle">No hay horarios sugeridos. Elegí otro día o ingresá una hora.</p>}
                {visibleTimes.length>8&&<button type="button" className="text-button" aria-expanded={allTimes} onClick={()=>setAllTimes(!allTimes)}>{allTimes?'Ver menos horarios':'Ver todos los horarios'}</button>}
              </>}
            </div>}
            <button type="button" className="text-button" aria-expanded={manualTime} onClick={()=>setManualTime(!manualTime)}>{manualTime?'Ocultar hora manual':'Ingresar otra hora'}</button>
            {manualTime&&<Field label="Hora de inicio" type="time" required value={time} validationMessage={conflictMessage} onChange={value=>{autoSelected.current=true;setDateTime(`${date}T${value}`)}}/>}
          </>}
          {conflictMessage&&<Notice>{conflictMessage}</Notice>}
        </section>

        {!block&&<section className="appointment-form-section appointment-extra-options">
          <button type="button" className="text-button" aria-expanded={more} onClick={()=>setMore(!more)}>{more?'Ocultar opciones':'Más opciones'}</button>
          {more&&<div className="settings-fields">
            {!initial?.client_user_id&&<button type="button" className="text-button" onClick={toggleAccount}>{useAccount?'Cargar los datos manualmente':'Usar una cuenta del portal de pacientes'}</button>}
            {useAccount&&!initial?.client_user_id&&<div className="registered-account-picker">
              <div className="account-search"><Field label="Buscar cuenta por nombre, DNI o email" value={accountQuery} onChange={setAccountQuery} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();searchAccounts()}}}/><button type="button" className="secondary-button" onClick={searchAccounts}>Buscar</button></div>
              {accounts.loading?<p className="appointment-search-status">Buscando cuentas…</p>:accounts.error?<Notice>{bookingError(accounts.error)}</Notice>:<SelectField label="Cuenta de paciente" required value={accountId} onChange={event=>selectAccount(event.target.value)}><option value="">Seleccionar cuenta verificada</option>{accounts.data?.map(account=><option key={account.user_id} value={account.user_id}>{account.full_name} · DNI {account.dni} · {account.email}</option>)}</SelectField>}
              <p className="section-subtitle">Comprobá la identidad antes de vincular. El turno aparecerá en su portal.</p>
            </div>}
            <div className="field-grid settings-contact-grid"><Field label="Celular (opcional)" type="tel" maxLength={40} value={phone} onChange={setPhone} readOnly={useAccount}/><Field label="Email para avisos (opcional)" type="email" maxLength={254} value={email} onChange={setEmail} readOnly={useAccount}/></div>
            {initial?.contact_email&&<p className="section-subtitle">Aviso por email: {initial.notification_state==='sent'?'enviado':'pendiente'}.</p>}
            {canManageNotes&&<TextAreaField label="Observación interna · no se envía al paciente" rows={2} maxLength={2000} value={notes} onChange={event=>setNotes(event.target.value)}/>}
          </div>}
        </section>}
        {initial&&<SelectField label="Estado" value={status} onChange={event=>setStatus(event.target.value as AppointmentStatus)}><option value="confirmed">Confirmado</option><option value="cancelled">Cancelado · liberar horario</option>{!block&&<><option value="completed" disabled={future}>Atendido</option><option value="no_show" disabled={future}>Ausente</option></>}</SelectField>}
      </fieldset>
      {initial?.contact_dni&&!block&&canReadClinical(membership)&&<p className="section-subtitle"><Link to={`/historias?q=${encodeURIComponent(initial.contact_dni)}`}>Buscar su ficha clínica por DNI</Link></p>}
      {error&&<Notice>{error}</Notice>}
      <div className="dialog-actions appointment-save-bar"><div className="appointment-save-summary" aria-live="polite">{end?<><strong>{block?'Bloqueo':'Turno'} de {displayTime(start,timezone)} a {displayTime(end,timezone)}</strong><span>{formatDate(start,timezone)} · {minutes} minutos{!block&&name?` · ${name}`:''}</span></>:<span>Completá el día y el horario.</span>}</div><div className="button-row"><button className="secondary-button" type="button" disabled={busy} onClick={close}>Cancelar</button><button className="primary-button" type="submit" disabled={busy||!eligible.length||occupancy.loading}>{busy?'Guardando…':block?'Guardar bloqueo':'Guardar turno'}</button></div></div>
    </Form>
  </Modal>
}
