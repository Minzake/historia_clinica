import { useState } from 'react'
import type { FormEvent } from 'react'
import { Save, Settings2 } from 'lucide-react'
import { useClinic } from '../context'
import { saveClinic } from '../lib/api'
import { legacyClinic } from '../lib/model'
import type { Clinic } from '../lib/model'
import { errorMessage } from '../lib/supabase'
import { Field, Notice } from '../components/ui'
import { UnsavedChanges } from '../components/UnsavedChanges'
import { validateClinic } from '../lib/validation'

export function Settings() {
  const { membership, setMembership } = useClinic()
  const [draft, setDraft] = useState(membership.clinic)
  const [legacy] = useState(legacyClinic)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const canEdit = membership.role === 'owner'
  const dirty = canEdit && JSON.stringify(draft) !== JSON.stringify(membership.clinic)
  const update = (key: keyof Clinic, value: string) => { setDraft((current) => ({ ...current, [key]: value })); setMessage('') }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    const validation = validateClinic(draft)
    if (validation) { setError(validation); return }
    setBusy(true)
    try { setMembership(await saveClinic(membership, draft)); setMessage('Los datos del consultorio quedaron guardados.') }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }
  return <><UnsavedChanges dirty={dirty || busy} saving={busy} /><div className="page-heading"><div><p className="eyebrow">CONFIGURACIÓN</p><h1>Tu consultorio</h1><p className="page-description">Estos datos se comparten con el equipo y aparecen en las planillas.</p></div></div>
    <form className="panel settings-page" onSubmit={save}><div className="panel-heading"><Settings2 size={21} /><h2>Datos del profesional</h2></div><div className="panel-content">
      {!canEdit && <Notice kind="info">Solo el titular puede modificar la configuración del consultorio.</Notice>}
      {canEdit && legacy && !membership.clinic.name && !membership.clinic.professional && <Notice kind="info">Encontramos los datos de la versión anterior en este navegador. <button className="text-button" type="button" onClick={() => setDraft(legacy)}>Importarlos al formulario</button> y luego guardalos.</Notice>}
      <fieldset disabled={!canEdit || busy} className="settings-fields"><Field label="Nombre del consultorio" value={draft.name} onChange={(v) => update('name', v)} /><Field label="Profesional" value={draft.professional} onChange={(v) => update('professional', v)} /><Field label="Matrícula profesional" value={draft.license} onChange={(v) => update('license', v)} /><Field label="Dirección" value={draft.address} onChange={(v) => update('address', v)} /><div className="field-grid settings-contact-grid"><Field label="Teléfono" type="tel" value={draft.phone} onChange={(v) => update('phone', v)} /><Field label="Correo electrónico" type="email" value={draft.email} onChange={(v) => update('email', v)} /></div></fieldset>
      {error && <Notice>{error}</Notice>}{message && <Notice kind="success">{message}</Notice>}
      {canEdit && <div className="dialog-actions"><button className="primary-button" type="submit" disabled={busy || !dirty}><Save size={16} />{busy ? 'Guardando…' : 'Guardar datos'}</button></div>}
      <p className="settings-footnote">Los datos se guardan en la base de datos del consultorio. Las cuentas y sus permisos se administran desde Supabase; nunca compartas tu contraseña.</p>
    </div></form>
  </>
}
