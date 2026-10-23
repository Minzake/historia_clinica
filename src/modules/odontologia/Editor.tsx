import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link,Navigate,useParams,useSearchParams } from 'react-router-dom'
import { ArrowLeft,Download,Plus,Save } from 'lucide-react'
import { useClinic } from '../../context'
import { specialtyAccess } from '../../core/access'
import { getPatientIdentity,identityFromPatient } from '../../core/patients'
import type { AdministrativePatient } from '../../core/patients'
import { today,formatDate } from '../../core/format'
import { Field,Form,Loading,Notice,SelectField,TextAreaField } from '../../components/ui'
import { UnsavedChanges } from '../../components/UnsavedChanges'
import { ChartAccessDialog } from '../../components/ChartAccessDialog'
import { useRemote } from '../../hooks/useRemote'
import { errorMessage } from '../../lib/supabase'
import { blankDentalRecord,blankOdontogram,teeth,validateDentalRecord,validateOdontogram } from './model'
import type { DentalRecord,SavedDentalRecord,Treatment } from './model'
import { dentalVersions,getDentalRecord,getDentalRevision,saveDentalRecord } from './api'
import { downloadDentalPdf } from './pdf'
import { OdontogramBoard } from './Odontogram'
import './odontologia.css'

const editable=(record:DentalRecord):DentalRecord=>structuredClone({patient:record.patient,clinical:record.clinical,evolutions:record.evolutions})
export function OdontologyEditor() {
  const {membership}=useClinic(),{patientId}=useParams(),[params]=useSearchParams(),identityId=params.get('paciente')||undefined
  const resource=useRemote(`dental:${membership.clinicId}:${patientId||identityId||'new'}`,async():Promise<{record:SavedDentalRecord|null;identity:AdministrativePatient|null}>=>patientId?{record:await getDentalRecord(membership.clinicId,patientId),identity:null}:identityId?{record:null,identity:await getPatientIdentity(membership.clinicId,identityId)}:{record:null,identity:null})
  if(resource.loading)return <Loading label="Abriendo ficha odontológica…"/>
  if(resource.error)return <><Notice>{errorMessage(resource.error)}</Notice><button className="secondary-button" onClick={resource.reload}>Reintentar</button></>
  return resource.data&&<DentalForm key={`${membership.clinicId}:${patientId||identityId||'new'}`} initial={resource.data.record} identity={resource.data.identity} routePatientId={patientId}/>
}
function DentalForm({initial,identity,routePatientId}:{initial:SavedDentalRecord|null;identity:AdministrativePatient|null;routePatientId?:string}) {
  const {membership}=useClinic(),[params]=useSearchParams(),access=specialtyAccess(membership,'odontologia')
  const [saved,setSaved]=useState(initial)
  const [draft,setDraft]=useState<DentalRecord>(()=>{if(initial)return editable(initial);const value=blankDentalRecord();if(identity)value.patient={...value.patient,...identityFromPatient(identity)};return value})
  const [baseline,setBaseline]=useState(()=>JSON.stringify(draft)),[control,setControl]=useState(blankOdontogram)
  const [activeControl,setActiveControl]=useState(initial?.clinical.odontograms.at(-1)?.id||'new')
  const [tab,setTab]=useState(params.get('seccion')==='odontograma'?'odontogram':'initial')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[exporting,setExporting]=useState(false),[assign,setAssign]=useState(false)
  const canWrite=Boolean(access?.canWrite)&&(saved?.canWrite??true),canExport=Boolean(access?.canExport&&saved?.canExport)
  const pending=Boolean(control.marks.length||control.notes.trim()),dirty=JSON.stringify(draft)!==baseline||pending
  const versions=useRemote(`dental-versions:${membership.clinicId}:${saved?.id}:${saved?.version}:${canExport}`,()=>saved&&canExport?dentalVersions(membership.clinicId,saved.id):Promise.resolve([]))
  const selected=draft.clinical.odontograms.find(o=>o.id===activeControl)||control
  function patient(key:keyof DentalRecord['patient'],value:string){setDraft(current=>({...current,patient:{...current.patient,[key]:value}}));setMessage('')}
  async function save(event:FormEvent) {
    event.preventDefault();setError('');setMessage('')
    if(!canWrite)return
    const value=editable(draft)
    if(pending){const invalid=validateOdontogram(control,value.patient.birthDate);if(invalid){setError(invalid);setTab('odontogram');return}value.clinical.odontograms.push(control)}
    const invalid=validateDentalRecord(value)
    if(invalid){setError(invalid);setTab(/odontograma|marcas|caras|pieza/.test(invalid)?'odontogram':/consulta|tratamiento|realización|procedimiento/.test(invalid)?'plan':'initial');return}
    setBusy(true)
    try {
      const result=await saveDentalRecord(membership.clinicId,value,saved,identity?.id,identity?.version||0)
      const next=editable(result);setSaved(result);setDraft(next);setBaseline(JSON.stringify(next));setControl(blankOdontogram());if(pending)setActiveControl(result.clinical.odontograms.at(-1)!.id)
      setMessage(pending?'Historia y control odontológico guardados. Este control queda en modo lectura.':'Historia odontológica guardada.');versions.reload()
    }catch(err){setError((err as {message?:string}).message?.includes('ODONTOGRAM_IMMUTABLE')?'Un control guardado no se puede reemplazar. Recargá la ficha y creá un control nuevo.':errorMessage(err))}finally{setBusy(false)}
  }
  async function exportPdf(versionId?:number) {
    if(!saved||!canExport||exporting)return
    setExporting(true);setError('')
    try{const record=versionId?await getDentalRevision(membership.clinicId,saved.id,versionId):await getDentalRecord(membership.clinicId,saved.id,true);if(!versionId&&record.version!==saved.version)throw new Error('CONFLICT');await downloadDentalPdf(record,membership.clinic)}catch(err){setError(errorMessage(err))}finally{setExporting(false)}
  }
  function treatment(id:string,patch:Partial<Treatment>){setDraft(current=>({...current,clinical:{...current.clinical,treatmentPlan:current.clinical.treatmentPlan.map(t=>t.id===id?{...t,...patch}:t)}}));setMessage('')}
  if(!routePatientId&&saved)return <Navigate replace to={`/historias/${saved.id}?especialidad=odontologia&seccion=odontograma`}/>
  return <div className="dental-editor"><UnsavedChanges dirty={dirty||busy} saving={busy}/><Link className="back-link" to="/historias"><ArrowLeft size={15}/>Historias clínicas</Link>
    <div className="page-heading"><div><p className="eyebrow">ODONTOLOGÍA · {saved?draft.patient.historyNumber:'NUEVA FICHA'}</p><h1>{saved?draft.patient.fullName:'Nueva ficha odontológica'}</h1><p className="page-description">Antecedentes, odontogramas, plan de tratamiento y seguimiento por paciente.</p></div><div className="button-row">{saved?.chartId&&membership.role==='owner'&&<button className="secondary-button" disabled={dirty||busy} onClick={()=>setAssign(true)}>Asignar acceso</button>}{canExport&&<button className="secondary-button" disabled={dirty||busy||exporting} onClick={()=>void exportPdf()}><Download size={16}/>{exporting?'Generando…':'Descargar ficha odontológica'}</button>}</div></div>
    {message&&<Notice kind="success">{message}</Notice>}{error&&<Notice>{error}</Notice>}{!canWrite&&<Notice kind="info">Podés consultar esta ficha. Tu cuenta no tiene permiso para modificarla.</Notice>}
    <div className="dental-tabs" role="tablist" aria-label="Secciones de odontología">{[{id:'initial',label:'Ficha y antecedentes'},{id:'odontogram',label:'Odontograma'},{id:'plan',label:'Plan y evolución'},...(canExport?[{id:'versions',label:'Versiones y PDF'}]:[])].map(item=><button key={item.id} type="button" id={`dental-tab-${item.id}`} role="tab" aria-selected={tab===item.id} aria-controls={`dental-panel-${item.id}`} onClick={()=>setTab(item.id)}>{item.label}</button>)}</div>
    <Form onSubmit={save}><section className="panel panel-content" id={`dental-panel-${tab}`} role="tabpanel" aria-labelledby={`dental-tab-${tab}`}>
      {tab==='initial'&&<fieldset disabled={!canWrite||busy} className="settings-fields"><h2>Identificación del paciente</h2><p className="section-subtitle">Estos datos se comparten con su identidad administrativa; los antecedentes clínicos son propios de odontología.</p><div className="field-grid settings-contact-grid"><Field label="Apellido y nombre" required minLength={2} maxLength={200} value={draft.patient.fullName} onChange={v=>patient('fullName',v)}/><Field label="DNI" maxLength={16} inputMode="numeric" value={draft.patient.dni} onChange={v=>patient('dni',v)}/><Field label="Fecha de nacimiento" type="date" max={draft.patient.date||today()} value={draft.patient.birthDate} onChange={v=>patient('birthDate',v)}/><Field label="Celular" type="tel" maxLength={40} value={draft.patient.mobile} onChange={v=>patient('mobile',v)}/><Field label="Fecha de apertura odontológica" required type="date" min={draft.patient.birthDate||undefined} max={today()} value={draft.patient.date} onChange={v=>patient('date',v)}/><Field label="Historia clínica N.º" maxLength={40} placeholder="Automático al guardar" value={draft.patient.historyNumber} onChange={v=>patient('historyNumber',v)}/></div><h2>Antecedentes y consulta</h2>{([{key:'reason',label:'Motivo de consulta'},{key:'allergies',label:'Alergias'},{key:'medication',label:'Medicación actual'},{key:'medicalNotes',label:'Antecedentes de salud relevantes'},{key:'dentalNotes',label:'Antecedentes y evaluación odontológica'}] as const).map(field=><TextAreaField key={field.key} label={field.label} rows={3} maxLength={2000} value={draft.patient[field.key]} onChange={e=>patient(field.key,e.target.value)}/>)}</fieldset>}
      {tab==='odontogram'&&<><div className="dental-control-navigation"><SelectField label="Control odontológico" value={activeControl} onChange={e=>setActiveControl(e.target.value)}>{canWrite&&<option value="new">{pending?'Control nuevo · sin guardar':'Nuevo control · sin evaluar'}</option>}{draft.clinical.odontograms.map((o,index)=><option key={o.id} value={o.id}>{o.date} · Control {index+1} · {o.authorName||'Equipo'}</option>)}</SelectField>{canWrite&&<button className="secondary-button" type="button" disabled={busy||draft.clinical.odontograms.length>=100} onClick={()=>setActiveControl('new')}><Plus size={15}/>{pending?'Volver al control sin guardar':'Nuevo control'}</button>}{pending&&canWrite&&<button className="text-button" type="button" disabled={busy} onClick={()=>{if(window.confirm('¿Descartar las marcas y notas del control sin guardar?')){setControl(blankOdontogram());setActiveControl('new')}}}>Descartar control sin guardar</button>}</div>
        {activeControl!=='new'&&<Notice kind="info">Control guardado · solo lectura. Sus marcas, fecha y autor se conservan. Creá un control nuevo para registrar cambios.</Notice>}
        <OdontogramBoard key={`${selected.id}:${activeControl==='new'}`} value={selected} onChange={canWrite&&activeControl==='new'?setControl:undefined} birthDate={draft.patient.birthDate} disabled={busy}/>
      </>}
      {tab==='plan'&&<fieldset disabled={!canWrite||busy} className="settings-fields"><h2>Plan de tratamiento</h2><p className="section-subtitle">Una indicación no se considera realizada por pintar una pieza. Registrá su estado y fecha de realización.</p>{draft.clinical.treatmentPlan.map((t,index)=><article className="dental-entry" key={t.id}><div className="dental-entry-heading"><h3>Tratamiento {index+1}</h3><button className="text-button" type="button" onClick={()=>{if(window.confirm('¿Quitar este tratamiento del plan actual? Las versiones guardadas se conservan.'))setDraft(current=>({...current,clinical:{...current.clinical,treatmentPlan:current.clinical.treatmentPlan.filter(item=>item.id!==t.id)}}))}}>Quitar tratamiento</button></div><div className="field-grid"><SelectField label={`Pieza del tratamiento ${index+1}`} value={t.tooth||''} onChange={e=>treatment(t.id,{tooth:e.target.value?Number(e.target.value):null})}><option value="">General / varias piezas</option>{teeth.map(tooth=><option key={tooth} value={tooth}>{tooth}</option>)}</SelectField><Field label={`Fecha de indicación ${index+1}`} type="date" required min={draft.patient.birthDate||undefined} max={today()} value={t.date} onChange={date=>treatment(t.id,{date})}/><SelectField label={`Estado del tratamiento ${index+1}`} value={t.status} onChange={e=>treatment(t.id,{status:e.target.value as Treatment['status'],completedDate:e.target.value==='completed'?(t.completedDate||today()):''})}><option value="pending">Pendiente</option><option value="in_progress">En curso</option><option value="completed">Realizado</option></SelectField>{t.status==='completed'&&<Field label={`Fecha de realización ${index+1}`} type="date" required min={t.date} max={today()} value={t.completedDate} onChange={completedDate=>treatment(t.id,{completedDate})}/>}</div><TextAreaField label={`Procedimiento indicado ${index+1}`} required maxLength={2000} rows={3} value={t.description} onChange={e=>treatment(t.id,{description:e.target.value})}/></article>)}{canWrite&&<button className="secondary-button" type="button" disabled={draft.clinical.treatmentPlan.length>=500} onClick={()=>setDraft(current=>({...current,clinical:{...current.clinical,treatmentPlan:[...current.clinical.treatmentPlan,{id:crypto.randomUUID(),tooth:null,description:'',status:'pending',date:today(),completedDate:''}]}}))}><Plus size={15}/>Agregar tratamiento</button>}
        <h2>Evoluciones y consultas</h2>{draft.evolutions.map((e,index)=><article className="dental-entry" key={e.id}><div className="dental-entry-heading"><h3>Consulta {index+1}</h3><button className="text-button" type="button" onClick={()=>{if(window.confirm('¿Quitar esta consulta del registro actual? Las versiones anteriores se conservan.'))setDraft(current=>({...current,evolutions:current.evolutions.filter(item=>item.id!==e.id)}))}}>Quitar consulta</button></div><Field label={`Fecha de consulta ${index+1}`} required type="date" min={draft.patient.birthDate||undefined} max={today()} value={e.date} onChange={date=>setDraft(current=>({...current,evolutions:current.evolutions.map(item=>item.id===e.id?{...item,date}:item)}))}/><TextAreaField label={`Evaluación y procedimiento ${index+1}`} required rows={4} maxLength={20000} value={e.procedure} onChange={event=>setDraft(current=>({...current,evolutions:current.evolutions.map(item=>item.id===e.id?{...item,procedure:event.target.value}:item)}))}/></article>)}{canWrite&&<button className="secondary-button" type="button" disabled={draft.evolutions.length>=500} onClick={()=>setDraft(current=>({...current,evolutions:[...current.evolutions,{id:crypto.randomUUID(),date:today(),procedure:''}]}))}><Plus size={15}/>Agregar consulta</button>}</fieldset>}
      {tab==='versions'&&canExport&&<><h2>Versiones guardadas</h2><p className="section-subtitle">Cada guardado conserva la ficha completa. Se muestran las últimas 30 versiones autorizadas para descargar.</p>{versions.loading?<Loading/>:versions.error?<Notice>{errorMessage(versions.error)}</Notice>:versions.data?.map(v=><article className="history-item" key={v.id}><div><strong>Versión {v.version}</strong><p>{formatDate(v.recorded_at)}</p></div><button className="secondary-button" type="button" disabled={exporting} onClick={()=>void exportPdf(v.id)}>Descargar PDF versión {v.version}</button></article>)}</>}
    </section>
    <div className="dental-footer"><span className="section-subtitle">{busy?'Guardando…':dirty?'Cambios sin guardar':saved?`Versión ${saved.version} guardada`:'Nueva ficha'}{pending&&activeControl!=='new'?' · Hay un control nuevo sin guardar':''}</span>{canWrite&&<button className="primary-button" type="submit" disabled={busy||(!dirty&&Boolean(saved))}><Save size={16}/>{busy?'Guardando…':pending?'Guardar historia y control':'Guardar historia'}</button>}</div></Form>
    {assign&&saved?.chartId&&<ChartAccessDialog chartId={saved.chartId} onClose={()=>setAssign(false)} onSaved={()=>{setAssign(false);setMessage('Acceso a la ficha actualizado.')}}/>}
  </div>
}
