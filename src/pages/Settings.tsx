import { useState } from 'react'
import type { FormEvent } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { useClinic } from '../context'
import { saveClinic } from '../lib/api'
import { legacyClinic } from '../lib/model'
import type { Clinic } from '../lib/model'
import { errorMessage } from '../lib/supabase'
import { Field, Notice, Form,Loading } from '../components/ui'
import { UnsavedChanges } from '../components/UnsavedChanges'
import { validateClinic } from '../lib/validation'
import { useRemote } from '../hooks/useRemote'
import { getBranding,prepareBrandImage } from '../lib/branding'
import type { Branding } from '../lib/branding'
import { useBranding } from '../branding-context'
import { BrandImageField } from '../components/BrandImageField'
import './settings-branding.css'

export function Settings() {
  const {membership}=useClinic()
  const branding=useRemote(`settings-brand:${membership.clinicId}`,()=>getBranding(membership.clinicId))
  if(branding.loading)return <Loading label="Cargando configuración…"/>
  if(branding.error)return <Notice>{errorMessage(branding.error)} <button className="text-button" onClick={branding.reload}>Reintentar</button></Notice>
  return <SettingsForm key={membership.clinicId} initialBranding={branding.data}/>
}
function SettingsForm({initialBranding}:{initialBranding:Branding|null}) {
  const { membership, setMembership } = useClinic()
  const {refresh}=useBranding()
  const [draft, setDraft] = useState(membership.clinic)
  const [images,setImages]=useState({logo:initialBranding?.logo||'',favicon:initialBranding?.favicon||''})
  const [savedImages,setSavedImages]=useState(images),[processing,setProcessing]=useState(false)
  const [imageErrors,setImageErrors]=useState({logo:'',favicon:''})
  const [legacy] = useState(legacyClinic)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const canEdit = membership.role === 'owner'
  const dirty = canEdit && (JSON.stringify(draft) !== JSON.stringify(membership.clinic)||JSON.stringify(images)!==JSON.stringify(savedImages))
  const update = (key: keyof Clinic, value: string) => { setDraft((current) => ({ ...current, [key]: value })); setMessage('') }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    const validation = validateClinic(draft)
    if (validation) { setError(validation); return }
    setBusy(true)
    try { setMembership(await saveClinic(membership, draft,images));setSavedImages(images);refresh(); setMessage('Los datos del consultorio quedaron guardados.') }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  async function upload(kind:'logo'|'favicon',file:File){
    setProcessing(true);setMessage('');setImageErrors(current=>({...current,[kind]:''}))
    try{const image=await prepareBrandImage(file,kind);setImages(current=>({...current,[kind]:image}))}
    catch(error){setImageErrors(current=>({...current,[kind]:error instanceof Error?error.message:'No se pudo cargar la imagen.'}))}
    finally{setProcessing(false)}
  }
  return <><UnsavedChanges dirty={dirty || busy||processing} saving={busy||processing} /><div className="page-heading"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Tu consultorio</h1><p className="page-description">Datos del profesional e identidad visual del consultorio.</p></div></div>
    <Form className="panel settings-page" onSubmit={save}><div className="panel-heading"><Settings2 size={21} /><h2>Datos del profesional</h2></div><div className="panel-content">
      {!canEdit && <Notice kind="info">Solo el titular puede modificar la configuración del consultorio.</Notice>}
      {canEdit && legacy && !membership.clinic.name && !membership.clinic.professional && <Notice kind="info">Encontramos los datos de la versión anterior en este navegador. <button className="text-button" type="button" onClick={() => setDraft(legacy)}>Importarlos al formulario</button> y luego guardalos.</Notice>}
      <fieldset disabled={!canEdit || busy} className="settings-fields"><Field label="Nombre del consultorio" hint="Completá este nombre o el del profesional." validationMessage={!draft.name.trim()&&!draft.professional.trim()?"Completá el nombre del consultorio o del profesional.":""} value={draft.name} onChange={(v) => update('name', v)} /><Field label="Profesional" value={draft.professional} onChange={(v) => update('professional', v)} /><Field label="Matrícula profesional" value={draft.license} onChange={(v) => update('license', v)} /><Field label="Dirección" value={draft.address} onChange={(v) => update('address', v)} /><div className="field-grid settings-contact-grid"><Field label="Teléfono" type="tel" value={draft.phone} onChange={(v) => update('phone', v)} /><Field label="Correo electrónico" type="email" value={draft.email} onChange={(v) => update('email', v)} /></div></fieldset>
      <section className="settings-branding" aria-labelledby="branding-heading"><h2 id="branding-heading">Identidad visual</h2><p>Elegí imágenes PNG, JPG o WebP de hasta 5 MB. Las ajustamos automáticamente sin deformarlas.</p>
        {(['logo','favicon'] as const).map(kind=><BrandImageField key={kind} kind={kind} value={images[kind]} disabled={!canEdit||busy||processing} error={imageErrors[kind]} onFile={file=>void upload(kind,file)} onClear={()=>{setImages(current=>({...current,[kind]:''}));setMessage('');setImageErrors(current=>({...current,[kind]:''}))}}/>)}
        <div className="branding-browser-preview" aria-label="Vista previa de la pestaña"><img src={images.favicon||'/favicon.svg'} alt=""/><span>{draft.name||'Consultorio'}</span><small>Vista previa</small></div>
        <p className="settings-footnote">Se aplican al guardar y se comparten con el equipo. En reservas se usa la identidad del consultorio elegido. Si hay varios centros, el acceso general muestra la identidad predeterminada hasta elegir uno.</p>
        {processing&&<p role="status">Preparando imagen…</p>}
      </section>
      {error && <Notice>{error}</Notice>}{message && <Notice kind="success">{message}</Notice>}
      {canEdit && <div className="dialog-actions"><button className="primary-button" type="submit" disabled={busy || processing|| !dirty}><Save size={16} />{busy ? 'Guardando…' : 'Guardar datos'}</button></div>}
      <p className="settings-footnote">Los datos se guardan en la base de datos del consultorio. Las cuentas y sus permisos se administran en Usuarios; nunca compartas tu contraseña.</p>
    </div></Form>
  </>
}
