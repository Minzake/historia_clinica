import { useState } from 'react'
import type { FormEvent } from 'react'
import { useClinic } from '../context'
import { bookingError,setSpecialtyAccess } from '../lib/booking'
import type { TeamMember } from '../lib/booking'
import type { SpecialtyAccess } from '../core/types'
import { Field,Form,Modal,Notice,SelectField } from './ui'

export function MemberSpecialtyDialog({member,onClose,onSaved}:{member:TeamMember;onClose:()=>void;onSaved:()=>void}) {
  const {membership,refreshAccess}=useClinic()
  const [access,setAccess]=useState<SpecialtyAccess>(()=>member.specialties?.find(item=>item.specialtyId==='podologia')||{specialtyId:'podologia',name:'Podología',canRead:false,canWrite:false,canExport:false,scope:'assigned'})
  const [practitioner,setPractitioner]=useState(member.practitioner||false),[name,setName]=useState(member.display_name||''),[license,setLicense]=useState(member.license||'')
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await setSpecialtyAccess(membership.clinicId,member.user_id,access,practitioner,name,license);await refreshAccess?.();onSaved()}catch(err){setError(bookingError(err))}finally{setBusy(false)}}
  return <Modal title="Acceso clínico y perfil profesional" onClose={()=>{if(!busy)onClose()}}><p>{member.email} · Podología</p><Form onSubmit={save}><fieldset className="settings-fields" disabled={busy}>
    <label className="toggle-field"><input type="checkbox" checked={access.canRead} onChange={event=>setAccess(current=>({...current,canRead:event.target.checked,canWrite:event.target.checked&&current.canWrite,canExport:event.target.checked&&current.canExport}))}/><span>Consultar fichas clínicas</span></label>
    <label className="toggle-field"><input type="checkbox" checked={access.canWrite} disabled={!access.canRead} onChange={event=>setAccess(current=>({...current,canWrite:event.target.checked}))}/><span>Crear fichas y registrar consultas</span></label>
    <label className="toggle-field"><input type="checkbox" checked={access.canExport} disabled={!access.canRead} onChange={event=>setAccess(current=>({...current,canExport:event.target.checked}))}/><span>Descargar PDF y versiones anteriores</span></label>
    <SelectField label="Alcance de las fichas" value={access.scope} disabled={!access.canRead} onChange={event=>setAccess(current=>({...current,scope:event.target.value as SpecialtyAccess['scope']}))}><option value="assigned">Solo fichas asignadas o creadas por esta persona</option><option value="all">Todas las fichas de podología del consultorio</option></SelectField>
    <label className="toggle-field"><input type="checkbox" checked={practitioner} onChange={event=>setPractitioner(event.target.checked)}/><span>Esta persona atiende consultas</span></label>
    <Field label="Nombre público profesional" value={name} onChange={setName} maxLength={120}/><Field label="Matrícula de podología" value={license} onChange={setLicense}/>
    <p className="section-subtitle">Administrar el consultorio y consultar historias son permisos separados. La matrícula cargada debe verificarse por el consultorio.</p>
    </fieldset>{error&&<Notice>{error}</Notice>}<div className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy?'Guardando…':'Guardar acceso'}</button></div></Form></Modal>
}
