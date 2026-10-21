import { useState } from 'react'
import { useClinic } from '../context'
import { database } from '../lib/supabase'
import { bookingError,grantChartAccess } from '../lib/booking'
import { useRemote } from '../hooks/useRemote'
import { Form,Loading,Modal,Notice,SelectField } from './ui'

type AccessRow={user_id:string;email:string;scope:'all'|'assigned';allow_write:boolean;allow_export:boolean;can_read:boolean;can_write:boolean;can_export:boolean}
export function ChartAccessDialog({chartId,onClose,onSaved}:{chartId:string;onClose:()=>void;onSaved:()=>void}) {
  const {membership}=useClinic()
  const members=useRemote(`chart-access:${membership.clinicId}:${chartId}`,async()=>{const {data,error}=await database().rpc('list_chart_access',{p_clinic_id:membership.clinicId,p_chart_id:chartId});if(error)throw error;return data as AccessRow[]})
  const [selected,setSelected]=useState<AccessRow|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function save(){if(!selected)return;setBusy(true);setError('');try{await grantChartAccess(membership.clinicId,chartId,selected.user_id,selected.can_read,selected.can_write,selected.can_export);onSaved()}catch(err){setError(bookingError(err))}finally{setBusy(false)}}
  return <Modal title="Asignar acceso a esta ficha" onClose={()=>{if(!busy)onClose()}}><p>Elegí un integrante con acceso clínico habilitado en esta especialidad. Los permisos generales se administran desde Usuarios.</p>
    {members.loading?<Loading/>:members.error?<Notice>{bookingError(members.error)}</Notice>:<Form onSubmit={event=>{event.preventDefault();void save()}}><fieldset className="settings-fields" disabled={busy}><SelectField label="Integrante del equipo" required value={selected?.user_id||''} onChange={event=>setSelected(members.data?.find(member=>member.user_id===event.target.value)||null)}><option value="">Seleccionar integrante</option>{members.data?.map(member=><option key={member.user_id} value={member.user_id}>{member.email}{member.scope==='all'?' · Todas las fichas de la especialidad':''}</option>)}</SelectField>
    {selected?.scope==='all'?<Notice kind="info">Esta persona ya tiene acceso por especialidad. Para limitarlo a fichas asignadas, cambiá su alcance desde Usuarios.</Notice>:selected&&<><label className="toggle-field"><input type="checkbox" checked={selected.can_read} onChange={event=>setSelected({...selected,can_read:event.target.checked,can_write:event.target.checked&&selected.can_write,can_export:event.target.checked&&selected.can_export})}/><span>Consultar esta ficha</span></label><label className="toggle-field"><input type="checkbox" checked={selected.can_write} disabled={!selected.can_read||!selected.allow_write} onChange={event=>setSelected({...selected,can_write:event.target.checked})}/><span>Registrar consultas</span></label><label className="toggle-field"><input type="checkbox" checked={selected.can_export} disabled={!selected.can_read||!selected.allow_export} onChange={event=>setSelected({...selected,can_export:event.target.checked})}/><span>Descargar PDF y versiones</span></label></>}
    </fieldset>{error&&<Notice>{error}</Notice>}<div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Volver</button><button className="primary-button" disabled={busy||!selected||selected.scope==='all'}>{busy?'Guardando…':'Guardar asignación'}</button></div></Form>}
  </Modal>
}
