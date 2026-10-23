import { useId, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { FileText, MoreHorizontal, Pencil, Plus, Search, ShieldCheck } from 'lucide-react'
import { useClinic } from '../context'
import { blankIdentity,identityFromPatient,listPatientIdentities,savePatientIdentity } from '../core/patients'
import type { AdministrativePatient } from '../core/patients'
import type { PatientIdentity } from '../core/types'
import { useRemote } from '../hooks/useRemote'
import { dniError } from '../lib/validation'
import { today } from '../core/format'
import { errorMessage } from '../lib/supabase'
import { Field,Form,Loading,Modal,Notice } from '../components/ui'
import { ChartAccessDialog } from '../components/ChartAccessDialog'
import './patient-directory.css'

export function PatientDirectory() {
  const {membership}=useClinic()
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(0)
  const [editing,setEditing]=useState<{patient:AdministrativePatient|null}|null>(null),[message,setMessage]=useState('')
  const [assignment,setAssignment]=useState<string|null>(null)
  const patients=useRemote(`identity:${membership.clinicId}:${search}:${page}`,()=>listPatientIdentities(membership.clinicId,search,page))
  return <><div className="page-heading"><div><p className="eyebrow">DIRECTORIO DEL CONSULTORIO</p><h1>Pacientes</h1><p className="page-description">Datos personales y de contacto compartidos por el equipo autorizado.</p></div><button className="primary-button" onClick={()=>setEditing({patient:null})}><Plus size={16}/>Agregar paciente</button></div>
    {message&&<Notice kind="success">{message}</Notice>}
    <section className="panel"><Form className="list-toolbar" role="search" onSubmit={event=>{event.preventDefault();setPage(0);setSearch(query.trim())}}><Field label="Buscar paciente por nombre, DNI o historia" type="search" maxLength={100} value={query} onChange={setQuery}/><button className="secondary-button"><Search size={16}/>Buscar</button></Form>
      {patients.loading?<Loading/>:patients.error?<div className="panel-content"><Notice>{errorMessage(patients.error)} <button className="text-button" onClick={patients.reload}>Reintentar</button></Notice></div>:!patients.data?.patients.length?<div className="empty-state"><p>No encontramos pacientes. Podés agregar sus datos de contacto.</p></div>:<div className="table-scroll"><table className="patients-table history-table patient-directory-table"><thead><tr><th>Paciente</th><th>DNI</th><th>Contacto</th><th>Acciones</th></tr></thead><tbody>{patients.data.patients.map(patient=><tr key={patient.id}><td><strong>{patient.full_name}</strong><small className="self-label">{patient.history_number}</small></td><td data-label="DNI">{patient.dni||'—'}</td><td data-label="Contacto">{patient.details.mobile||patient.details.phone||'—'}</td><td><PatientActions patient={patient} owner={membership.role==='owner'} onEdit={()=>setEditing({patient})} onAssign={setAssignment}/></td></tr>)}</tbody></table></div>}
      {patients.data&&patients.data.count>12&&<div className="list-pagination"><span>{patients.data.count} pacientes · Página {page+1}</span><div className="button-row"><button className="secondary-button" disabled={!page} onClick={()=>setPage(page-1)}>Anterior</button><button className="secondary-button" disabled={(page+1)*12>=patients.data!.count} onClick={()=>setPage(page+1)}>Siguiente</button></div></div>}
    </section>
    {assignment&&<ChartAccessDialog chartId={assignment} onClose={()=>setAssignment(null)} onSaved={()=>{setAssignment(null);patients.reload()}}/>}
    {editing&&<IdentityDialog initial={editing.patient} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setMessage('Datos del paciente guardados.');patients.reload()}}/>}
  </>
}
function PatientActions({patient,owner,onEdit,onAssign}:{patient:AdministrativePatient;owner:boolean;onEdit:()=>void;onAssign:(id:string)=>void}) {
  const menuId=useId(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null)
  const [open,setOpen]=useState(false)
  const assignments=owner?patient.assignment_charts||[]:[]
  useLayoutEffect(()=>{
    if(!open)return
    function position(){
      const button=trigger.current,popover=menu.current
      if(!button||!popover)return
      const anchor=button.getBoundingClientRect(),width=popover.offsetWidth,height=popover.offsetHeight
      popover.style.left=`${Math.max(12,Math.min(anchor.right-width,window.innerWidth-width-12))}px`
      const below=anchor.bottom+8
      popover.style.top=`${below+height<=window.innerHeight-12?below:Math.max(12,anchor.top-height-8)}px`
    }
    position()
    window.addEventListener('resize',position)
    document.addEventListener('scroll',position,true)
    return ()=>{window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true)}
  },[open])
  function choose(action:()=>void){menu.current?.hidePopover();action()}
  return <div className="patient-directory-actions">
    {patient.chart_links?.map(link=><Link key={link.specialtyId} className={`patient-chart-action patient-chart-action--${link.action}`} aria-label={`${link.action==='open'?'Abrir':'Crear'} ficha · ${link.name}`} to={link.action==='open'?`/historias/${patient.id}?especialidad=${encodeURIComponent(link.specialtyId)}`:`/historias/nueva?paciente=${patient.id}&especialidad=${encodeURIComponent(link.specialtyId)}`}>
      {link.action==='open'?<FileText size={17} aria-hidden="true"/>:<Plus size={17} aria-hidden="true"/>}<span><strong>{link.name}</strong><small>{link.action==='open'?'Abrir ficha':'Crear ficha'}</small></span>
    </Link>)}
    {assignments.length>0?<>
      <button ref={trigger} className="patient-more-action" type="button" popoverTarget={menuId} aria-label={`Más acciones de ${patient.full_name}`} title="Más acciones" aria-expanded={open} aria-controls={menuId}><MoreHorizontal size={20} aria-hidden="true"/></button>
      <div ref={menu} id={menuId} popover="auto" className="patient-actions-popover" role="group" aria-label={`Acciones de ${patient.full_name}`} onToggle={event=>setOpen(event.newState==='open')}>
        <button type="button" onClick={()=>choose(onEdit)}><Pencil size={16} aria-hidden="true"/>Editar datos</button>
        <p>Acceso del equipo</p>
        {assignments.map(chart=><button key={chart.id} type="button" onClick={()=>choose(()=>onAssign(chart.id))}><ShieldCheck size={16} aria-hidden="true"/><span>Asignar acceso · {chart.name}</span></button>)}
      </div>
    </>:<button className="patient-edit-action" type="button" onClick={onEdit}><Pencil size={16} aria-hidden="true"/>Editar datos</button>}
  </div>
}

function IdentityDialog({initial,onClose,onSaved}:{initial:AdministrativePatient|null;onClose:()=>void;onSaved:()=>void}) {
  const {membership}=useClinic()
  const [identity,setIdentity]=useState(()=>initial?identityFromPatient(initial):blankIdentity()),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const update=(key:keyof PatientIdentity,value:string)=>setIdentity(current=>({...current,[key]:value}))
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await savePatientIdentity(membership.clinicId,initial,identity);onSaved()}catch(err){setError(errorMessage(err))}finally{setBusy(false)}}
  return <Modal title={initial?'Datos del paciente':'Agregar paciente'} onClose={()=>{if(!busy)onClose()}}><Form onSubmit={save}><fieldset className="settings-fields" disabled={busy}>
    <Field label="Apellido y nombre" required minLength={2} autoComplete="name" value={identity.fullName} onChange={value=>update('fullName',value)}/>
    <div className="field-grid settings-contact-grid"><Field label="DNI" inputMode="numeric" maxLength={16} hint="Opcional · de 6 a 10 dígitos" validationMessage={dniError(identity.dni)} value={identity.dni} onChange={value=>update('dni',value)}/><Field label="Historia clínica N.º" maxLength={40} placeholder="Automático al guardar" value={identity.historyNumber} onChange={value=>update('historyNumber',value)}/></div>
    <Field label="Fecha de nacimiento" type="date" max={today()} value={identity.birthDate} onChange={value=>update('birthDate',value)}/><Field label="Domicilio" value={identity.address} onChange={value=>update('address',value)}/>
    <div className="field-grid settings-contact-grid"><Field label="Teléfono" type="tel" value={identity.phone} onChange={value=>update('phone',value)}/><Field label="Celular" type="tel" value={identity.mobile} onChange={value=>update('mobile',value)}/></div>
    <Field label="Obra social" value={identity.insurance} onChange={value=>update('insurance',value)}/><Field label="Ocupación" value={identity.occupation} onChange={value=>update('occupation',value)}/>
    <Field label="Contacto de emergencia" value={identity.emergencyContact} onChange={value=>update('emergencyContact',value)}/><Field label="Teléfono de emergencia" type="tel" value={identity.emergencyPhone} onChange={value=>update('emergencyPhone',value)}/>
    </fieldset>{error&&<Notice>{error}</Notice>}<div className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy?'Guardando…':'Guardar datos'}</button></div></Form></Modal>
}
