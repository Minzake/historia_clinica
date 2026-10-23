import { useState } from 'react'
import type { FormEvent } from 'react'
import { Mail,ShieldCheck,Users } from 'lucide-react'
import { useClinic } from '../context'
import { bookingError,getTeam,searchRegisteredPatients,serverRequest } from '../lib/booking'
import type { TeamMember } from '../lib/booking'
import { useRemote } from '../hooks/useRemote'
import { Field,Loading,Modal,Notice, Form, SelectField } from '../components/ui'
import type { MemberRole } from '../core/types'
import { MemberSpecialtyDialog } from '../components/MemberSpecialtyDialog'

export function Team() {
  const {membership}=useClinic()
  return membership.role==='owner'?<TeamManager/>:<Notice>Solo los administradores pueden gestionar el equipo.</Notice>
}
function TeamManager() {
  const {membership}=useClinic()
  const team=useRemote(`team:${membership.clinicId}`,()=>getTeam(membership.clinicId))
  const [email,setEmail]=useState(''),[role,setRole]=useState<MemberRole>('professional')
  const [specialtyMember,setSpecialtyMember]=useState<TeamMember|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const [pending,setPending]=useState<{member:TeamMember;role:MemberRole;active:boolean}|null>(null)
  async function invite(event:FormEvent) {
    event.preventDefault();setBusy(true);setError('');setMessage('')
    try {
      const result=await serverRequest('/api/team',{clinic_id:membership.clinicId,email,role})
      setMessage(result.invited?'Invitación enviada. La persona debe abrir el correo y elegir su contraseña.':'La cuenta existente quedó asignada al consultorio. Su contraseña no se modificó.')
      setEmail('');team.reload()
    }catch(err){setError(bookingError(err))}finally{setBusy(false)}
  }
  async function update() {
    if(!pending)return
    setBusy(true);setError('');setMessage('')
    try {await serverRequest('/api/team',{clinic_id:membership.clinicId,user_id:pending.member.user_id,role:pending.role,active:pending.active},'PATCH');setPending(null);setMessage('Permisos actualizados.');team.reload()}
    catch(err){setError(bookingError(err))}finally{setBusy(false)}
  }
  return <><div className="page-heading"><div><p className="eyebrow">ADMINISTRACIÓN</p><h1>Usuarios y equipo</h1><p className="page-description">Acceso al consultorio por invitación. Los pacientes se registran por separado.</p></div><ShieldCheck size={30}/></div>
    {error&&<Notice>{error}</Notice>}{message&&<Notice kind="success">{message}</Notice>}
    <section className="panel"><div className="panel-heading"><h2>Invitar al equipo</h2><Mail size={20}/></div><Form className="panel-content team-invite" onSubmit={invite}><Field label="Email de la persona" type="email" required maxLength={254} value={email} onChange={setEmail} disabled={busy}/><SelectField label="Permiso" value={role} onChange={(event)=>setRole(event.target.value as typeof role)} disabled={busy}><option value="professional">Profesional · fichas asignadas y agenda</option><option value="owner">Administrador · equipo y configuración</option><option value="reception">Recepción · pacientes y agenda</option></SelectField><button type="submit" className="primary-button" disabled={busy}>{busy?'Procesando…':'Invitar o asignar'}</button></Form><p className="panel-footnote">Nunca se envían contraseñas. El acceso clínico se configura por separado. Los profesionales nuevos acceden a las fichas que crean o que les asignen.</p></section>
    <section className="panel team-list"><div className="panel-heading"><h2>Equipo del consultorio</h2><button className="text-button" onClick={team.reload}>Actualizar</button></div>{team.loading?<Loading/>:team.error?<div className="panel-content"><Notice>{bookingError(team.error)}</Notice></div>:<div className="table-scroll"><table className="patients-table"><thead><tr><th>Cuenta</th><th>Permiso</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{team.data?.map((member)=><tr key={member.user_id}><td><strong>{member.email}</strong>{member.is_self&&<small className="self-label">Tu cuenta</small>}</td><td><select aria-label={`Permiso de ${member.email}`} value={member.role} disabled={busy||member.is_self} onChange={(event)=>setPending({member,role:event.target.value as MemberRole,active:member.active})}><option value="owner">Administrador</option><option value="professional">Profesional</option><option value="reception">Recepción</option></select></td><td><span className={`status-badge ${member.active?'confirmed':'cancelled'}`}>{member.active?member.confirmed?'Activo':'Invitación pendiente':'Acceso suspendido'}</span></td><td><div className="table-actions">{member.role!=='reception'&&<button className="text-button" disabled={busy||!member.active} onClick={()=>setSpecialtyMember(member)}>Acceso clínico</button>}<button className="text-button" disabled={busy||member.is_self} onClick={()=>setPending({member,role:member.role,active:!member.active})}>{member.active?'Suspender acceso':'Reactivar'}</button></div></td></tr>)}</tbody></table></div>}</section>
    <Notice kind="info"><Users size={15}/> Los pacientes no forman parte de este equipo. Registrarse en la web nunca concede permisos profesionales o administrativos. Suspender acceso no elimina historias ni turnos.</Notice>
    <RegisteredPatients/>
    {specialtyMember&&<MemberSpecialtyDialog member={specialtyMember} onClose={()=>setSpecialtyMember(null)} onSaved={()=>{setSpecialtyMember(null);setMessage('Acceso clínico actualizado.');team.reload()}}/>}
    {pending&&<Modal title="Confirmar cambio de permisos" onClose={()=>{if(!busy)setPending(null)}}><p>{pending.member.email}</p><p>{!pending.active?'La cuenta perderá el acceso a los datos del consultorio, pero no se borrará.':pending.role==='owner'?'Esta cuenta podrá administrar el equipo y el consultorio. Sus accesos clínicos se configuran por separado.':pending.role==='reception'?'Esta cuenta gestionará pacientes y agenda, sin acceso a historias clínicas.':'Esta cuenta tendrá agenda y acceso a sus fichas autorizadas.'}</p>{error&&<Notice>{error}</Notice>}<div className="dialog-actions"><button className="secondary-button" disabled={busy} onClick={()=>setPending(null)}>Cancelar</button><button className="primary-button" disabled={busy} onClick={update}>{busy?'Guardando…':'Confirmar cambio'}</button></div></Modal>}
  </>
}

function RegisteredPatients() {
  const {membership}=useClinic()
  const [query,setQuery]=useState(''),[search,setSearch]=useState('')
  const contacts=useRemote(`registered-directory:${membership.clinicId}:${search}`,()=>searchRegisteredPatients(membership.clinicId,search))
  return <section className="panel team-list"><div className="panel-heading"><div><p className="eyebrow">CUENTAS DE PACIENTES</p><h2>Pacientes registrados del consultorio</h2></div></div><Form className="list-toolbar" onSubmit={(event)=>{event.preventDefault();setSearch(query)}}><Field label="Buscar por nombre, DNI o email" value={query} onChange={setQuery}/><button className="secondary-button" type="submit">Buscar pacientes</button></Form>{contacts.loading?<Loading/>:contacts.error?<div className="panel-content"><Notice>{bookingError(contacts.error)}</Notice></div>:!contacts.data?.length?<div className="empty-state"><p>No hay cuentas verificadas que coincidan. Esta lista no incluye registros de otros consultorios.</p></div>:<div className="table-scroll"><table className="patients-table"><thead><tr><th>Nombre y apellido</th><th>DNI</th><th>Email verificado</th><th>Celular</th></tr></thead><tbody>{contacts.data.map((account)=><tr key={account.user_id}><td>{account.full_name}</td><td>{account.dni}</td><td>{account.email}</td><td>{account.phone||'—'}</td></tr>)}</tbody></table></div>}<p className="panel-footnote">Se muestran hasta 50 coincidencias. Son datos de cuenta y contacto; no se vincula ni se comparte una historia clínica automáticamente.</p></section>
}
