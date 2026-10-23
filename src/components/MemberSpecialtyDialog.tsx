import { useEffect,useState } from 'react'
import type { FormEvent } from 'react'
import { useClinic } from '../context'
import { bookingError,setSpecialtyAccess } from '../lib/booking'
import type { TeamMember } from '../lib/booking'
import type { SpecialtyAccess } from '../core/types'
import { Field,Form,Modal,Notice,SelectField } from './ui'
import { installedSpecialties } from '../core/specialties'

export function MemberSpecialtyDialog({member,onClose,onSaved}:{member:TeamMember;onClose:()=>void;onSaved:()=>void}) {
  const [specialty,setSpecialty]=useState('podologia'),[changed,setChanged]=useState(false),[busy,setBusy]=useState(false)
  const close=()=>{if(!busy&&(!changed||window.confirm('Hay cambios de acceso sin guardar. ¿Querés descartarlos?')))onClose()}
  return <Modal title="Acceso clínico y perfil profesional" onClose={close}><p>{member.email}</p><SelectField label="Especialidad del acceso" disabled={busy} value={specialty} onChange={e=>{if(changed&&!window.confirm('¿Descartar los cambios sin guardar y cambiar de especialidad?'))return;setChanged(false);setSpecialty(e.target.value)}}>{installedSpecialties.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</SelectField><AccessFields key={specialty} specialty={specialty} member={member} onClose={close} onSaved={onSaved} onDirty={setChanged} onBusy={setBusy}/></Modal>
}
function AccessFields({member,specialty,onClose,onSaved,onDirty,onBusy}:{member:TeamMember;specialty:string;onClose:()=>void;onSaved:()=>void;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}) {
  const {membership,refreshAccess}=useClinic()
  const label=installedSpecialties.find(s=>s.id===specialty)!.name,profile=member.practitioner_specialties?.find(s=>s.specialty_id===specialty)
  const [access,setAccess]=useState<SpecialtyAccess>(()=>member.specialties?.find(item=>item.specialtyId===specialty)||{specialtyId:specialty,name:label,canRead:false,canWrite:false,canExport:false,scope:'assigned'})
  const [practitioner,setPractitioner]=useState(profile?.active??(specialty==='podologia'?member.practitioner||false:false)),[name,setName]=useState(member.display_name||''),[license,setLicense]=useState(profile?.license||(specialty==='podologia'?member.license||'':''))
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const [baseline]=useState(()=>JSON.stringify({access,practitioner,name,license}))
  const dirty=JSON.stringify({access,practitioner,name,license})!==baseline
  useEffect(()=>onDirty(dirty),[dirty,onDirty]);useEffect(()=>onBusy(busy),[busy,onBusy])
  async function save(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await setSpecialtyAccess(membership.clinicId,member.user_id,access,practitioner,name,license);await refreshAccess?.();onSaved()}catch(err){setError(bookingError(err))}finally{setBusy(false)}}
  return <Form onSubmit={save}><fieldset className="settings-fields" disabled={busy}>
    {specialty==='odontologia'&&!member.specialties?.some(s=>s.specialtyId===specialty)&&<Notice kind="info">Guardar acceso clínico o atención en odontología habilita esta especialidad para el consultorio. Los permisos de podología se mantienen separados.</Notice>}
    <label className="toggle-field"><input type="checkbox" checked={access.canRead} onChange={event=>setAccess(current=>({...current,canRead:event.target.checked,canWrite:event.target.checked&&current.canWrite,canExport:event.target.checked&&current.canExport}))}/><span>Consultar fichas clínicas</span></label>
    <label className="toggle-field"><input type="checkbox" checked={access.canWrite} disabled={!access.canRead} onChange={event=>setAccess(current=>({...current,canWrite:event.target.checked}))}/><span>Crear fichas y registrar consultas</span></label>
    <label className="toggle-field"><input type="checkbox" checked={access.canExport} disabled={!access.canRead} onChange={event=>setAccess(current=>({...current,canExport:event.target.checked}))}/><span>Descargar PDF y versiones anteriores</span></label>
    <SelectField label="Alcance de las fichas" value={access.scope} disabled={!access.canRead} onChange={event=>setAccess(current=>({...current,scope:event.target.value as SpecialtyAccess['scope']}))}><option value="assigned">Solo fichas asignadas o creadas por esta persona</option><option value="all">Todas las fichas de {label.toLocaleLowerCase('es')} del consultorio</option></SelectField>
    <label className="toggle-field"><input type="checkbox" checked={practitioner} onChange={event=>setPractitioner(event.target.checked)}/><span>Esta persona atiende consultas de {label.toLocaleLowerCase('es')}</span></label>
    <Field label="Nombre público profesional" value={name} onChange={setName} maxLength={120}/><Field label={`Matrícula de ${label.toLocaleLowerCase('es')}`} value={license} onChange={setLicense}/>
    <p className="section-subtitle">Administrar el consultorio y consultar historias son permisos separados. La matrícula cargada debe verificarse por el consultorio.</p>
    </fieldset>{error&&<Notice>{error}</Notice>}<div className="dialog-actions"><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy?'Guardando…':'Guardar acceso'}</button></div></Form>
}
