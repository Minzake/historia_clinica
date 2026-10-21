import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Download, FileText, History, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react'
import { useClinic } from '../context'
import { getRecord, getRevision, listRevisions, saveRecord } from '../lib/api'
import { ageAt, blankEvolution, blankRecord, bmi, formatDate, today, validateRecord, recordFieldErrors } from '../lib/model'
import type { Antecedent, Answer, Clinical, Evolution, Patient, RecordDraft, SavedRecord } from '../lib/model'
import { downloadPdf } from '../lib/pdf'
import { errorMessage } from '../lib/supabase'
import { Field, Loading, Modal, Notice, PdfActions, Form, TextAreaField } from '../components/ui'
import { UnsavedChanges } from '../components/UnsavedChanges'

function Answers({ label, value, onChange }: { label: string; value: Answer; onChange: (answer: Answer) => void }) {
  return <div className="status-control" role="group" aria-label={label}>
    <button type="button" className={value === 'yes' ? 'selected' : ''} aria-pressed={value === 'yes'} onClick={() => onChange(value === 'yes' ? 'unset' : 'yes')}>Sí</button>
    <button type="button" className={value === 'no' ? 'selected' : ''} aria-pressed={value === 'no'} onClick={() => onChange(value === 'no' ? 'unset' : 'no')}>No</button>
  </div>
}

function Antecedents({ label, items, onChange }: { label: string; items: Antecedent[]; onChange: (id: string, patch: Partial<Antecedent>) => void }) {
  return <div className="table-scroll antecedents-scroll"><table className="health-table" aria-label={label}>
    <thead><tr><th>{label}</th><th>Respuesta</th><th>Observaciones</th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><th scope="row">{item.label}</th><td><Answers label={`${item.label}: respuesta`} value={item.answer} onChange={(answer) => onChange(item.id, { answer })} /></td><td><input className="notes-input" maxLength={2000} aria-label={`Observaciones: ${item.label}`} value={item.notes} onChange={(event) => onChange(item.id, { notes: event.target.value })} /></td></tr>)}
    </tbody>
  </table></div>
}

function Notes({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <TextAreaField label={label} className="short-notes" rows={2} maxLength={2000} value={value} onChange={(event) => onChange(event.target.value)} />
}

export function PatientEditor() {
  const { patientId } = useParams()
  return <Editor key={patientId || 'new'} patientId={patientId} />
}

function Editor({ patientId }: { patientId?: string }) {
  const { membership } = useClinic()
  const [params, setParams] = useSearchParams()
  const page = params.get('hoja') === '2' ? 2 : 1
  const [draft, setDraft] = useState<RecordDraft>(blankRecord)
  const [baseline, setBaseline] = useState(() => JSON.stringify(blankRecord()))
  const [saved, setSaved] = useState<SavedRecord | null>(null)
  const [loading, setLoading] = useState(Boolean(patientId))
  const [loaded, setLoaded] = useState(!patientId)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [focusTarget, setFocusTarget] = useState<{ key: string } | null>(null)
  const focusedTarget = useRef<typeof focusTarget>(null)
  const feedback = useRef<HTMLDivElement>(null)
  const fieldErrors = useMemo(() => recordFieldErrors(draft), [draft])
  const fieldProps = (key: string) => ({ id: `record-${key}`, validationMessage: fieldErrors[key] || '', error: attempted ? fieldErrors[key] : undefined })
  useEffect(() => {
    if (!focusTarget || focusedTarget.current === focusTarget) return
    const control = document.getElementById(`record-${focusTarget.key}`)
    if (control) { control.focus(); focusedTarget.current = focusTarget }
  }, [focusTarget, page])
  useEffect(() => { if (errors.length && !Object.keys(fieldErrors).length) feedback.current?.focus() }, [errors, fieldErrors])
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const dirty = JSON.stringify(draft) !== baseline
  const { patient, clinical, evolutions } = draft

  useEffect(() => {
    if (!patientId) return
    let active = true
    getRecord(patientId).then((record) => {
      if (!active) return
      const value = { patient: record.patient, clinical: record.clinical, evolutions: record.evolutions }
      setDraft(value); setBaseline(JSON.stringify(value)); setSaved(record); setLoaded(true); setErrors([]); setMessage('')
    }).catch((err) => { if (active) setLoadError(errorMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [patientId, attempt])

  function updatePatient(key: Exclude<keyof Patient, 'antecedents' | 'vaccines'>, value: string) {
    setMessage(''); setErrors([])
    setDraft((current) => {
      const next = { ...current.patient, [key]: value }
      if ((key === 'birthDate' || key === 'date') && next.birthDate) next.age = ageAt(next.birthDate, next.date)
      return { ...current, patient: next }
    })
  }
  function updateClinical(key: keyof Clinical, value: string) { setMessage(''); setErrors([]); setDraft((current) => ({ ...current, clinical: { ...current.clinical, [key]: value } })) }
  function updateAntecedent(group: 'antecedents' | 'vaccines', id: string, patch: Partial<Antecedent>) {
    setMessage(''); setDraft((current) => ({ ...current, patient: { ...current.patient, [group]: current.patient[group].map((item) => item.id === id ? { ...item, ...patch } : item) } }))
  }
  function updateEvolution(id: string, patch: Partial<Evolution>) { setMessage(''); setErrors([]); setDraft((current) => ({ ...current, evolutions: current.evolutions.map((item) => item.id === id ? { ...item, ...patch } : item) })) }
  function addEvolution() { setMessage(''); setDraft((current) => ({ ...current, evolutions: [...current.evolutions, blankEvolution()] })) }
  function removeEvolution() { setMessage(''); setDraft((current) => ({ ...current, evolutions: current.evolutions.filter((item) => item.id !== removeId) })); setRemoveId(null) }
  function setPage(value: number) { setParams(value === 2 ? { hoja: '2' } : {}, { replace: true }) }
  function reload() { setLoading(true); setLoadError(''); setAttempt(attempt + 1) }
  async function save(event: FormEvent) {
    event.preventDefault(); setErrors([]); setMessage(''); setAttempted(true)
    const validation = validateRecord(draft)
    if (validation.length) {
      setErrors(validation)
      const key = Object.keys(fieldErrors)[0]
      if (key) { setPage(key.startsWith('patient.') ? 1 : 2); setFocusTarget({ key }) }
      return
    }
    setBusy(true)
    try {
      const record = await saveRecord(membership.clinicId, draft, saved?.id || null, saved?.version || 0)
      const value = { patient: record.patient, clinical: record.clinical, evolutions: record.evolutions }
      setDraft(value); setBaseline(JSON.stringify(value)); setSaved(record); setAttempted(false); setMessage('Historia clínica guardada correctamente.')
    } catch (err) { setErrors([errorMessage(err)]) }
    finally { setBusy(false) }
  }

  if (!patientId && saved) return <Navigate to={`/historias/${saved.id}`} replace />
  if (loading) return <Loading label="Abriendo historia clínica…" />
  if (!loaded) return <section className="panel panel-content"><Notice>{loadError}</Notice><div className="button-row"><button className="primary-button" onClick={reload}>Reintentar</button><Link className="secondary-button" to="/historias">Volver a historias</Link></div></section>

  return <>
    <UnsavedChanges dirty={dirty || busy} saving={busy} />
    <Link className="back-link" to="/historias"><ArrowLeft size={15} />Historias clínicas</Link>
    <div className="page-heading editor-heading"><div><p className="eyebrow">{saved ? `PACIENTE · ${patient.historyNumber}` : 'REGISTRO · NUEVO PACIENTE'}</p><h1>{saved ? patient.fullName : 'Nueva historia clínica'}</h1><p className="page-description">{saved ? `Último guardado: ${formatDate(saved.updatedAt)} · Versión ${saved.version}` : 'La ficha inicial se carga una vez. Después agregás cada consulta.'}</p></div>
      {saved && <button className="secondary-button" type="button" onClick={() => setHistoryOpen(true)}><History size={16} />Versiones anteriores</button>}
    </div>
    {loadError && <Notice>{loadError}</Notice>}
    <Form onSubmit={save} validateFields={false}>
      <div className="editor-layout">
        <nav className="sheet-navigation" aria-label="Hojas de historia clínica"><p className="nav-label">HISTORIA DEL PACIENTE</p>
          <button className={`sheet-tab ${page === 1 ? 'active' : ''}`} type="button" aria-label="Ficha inicial: datos y antecedentes" onClick={() => setPage(1)} aria-current={page === 1 ? 'step' : undefined}><span className="sheet-number" aria-hidden="true">01</span><span className="sheet-tab-copy"><strong>Ficha inicial</strong><small>Datos · antecedentes</small></span></button>
          <button className={`sheet-tab ${page === 2 ? 'active' : ''}`} type="button" aria-label="Evoluciones: valores y consultas" onClick={() => setPage(2)} aria-current={page === 2 ? 'step' : undefined}><span className="sheet-number" aria-hidden="true">02</span><span className="sheet-tab-copy"><strong>Evoluciones</strong><small>Valores · consultas</small></span></button>
          <div className="nav-footer"><FileText size={16} /><span>{saved ? 'Ficha guardada en el consultorio' : 'Todavía no guardada'}</span></div>
        </nav>
        <section className="form-sheet" aria-labelledby="sheet-title">
          <div className="sheet-heading"><div className="sheet-heading-number">0{page}<span>/ 02</span></div><div><p className="eyebrow">{page === 1 ? 'IDENTIFICACIÓN DEL PACIENTE' : 'SEGUIMIENTO PODOLÓGICO'}</p><h2 id="sheet-title">{page === 1 ? 'Datos y antecedentes' : 'Ficha de evolución'}</h2></div><span className="sheet-meta">HOJA {page}</span></div>
          {errors.length > 0 && <div className="form-feedback" ref={feedback} tabIndex={-1}><Notice><ul>{errors.map((error) => <li key={error}>{Object.entries(fieldErrors).find(([, text]) => text === error) ? <button className="text-button" type="button" onClick={() => { const key = Object.keys(fieldErrors).find(key => fieldErrors[key] === error)!; setPage(key.startsWith('patient.') ? 1 : 2); setFocusTarget({ key }) }}>{error}</button> : error}</li>)}</ul>{saved && <button className="text-button" type="button" onClick={() => { if (window.confirm('¿Volver a cargar la versión guardada? Se descartarán tus cambios actuales.')) reload() }}>Volver a cargar ficha guardada</button>}</Notice></div>}
          {message && <div className="form-feedback"><Notice kind="success">{message}</Notice></div>}
          <p className="form-required-note">{page === 1 ? 'Completá el apellido y nombre y la fecha de apertura. Los demás datos son opcionales.' : 'Cada consulta necesita una fecha y un procedimiento. Los valores habituales son opcionales.'}</p>
          <fieldset className="editor-fields" disabled={busy}>
          {page === 1 ? <>
            <section className="form-section"><div className="section-title-row"><h3>Datos personales</h3><span>FICHA INICIAL</span></div><div className="field-grid personal-grid">
              <Field label="Historia clínica N.º" maxLength={40} placeholder="Automático al guardar" {...fieldProps('patient.historyNumber')} value={patient.historyNumber} onChange={(v) => updatePatient('historyNumber', v)} />
              <Field label="Fecha de apertura" type="date" max={today()} {...fieldProps('patient.date')} value={patient.date} onChange={(v) => updatePatient('date', v)} required />
              <Field label="Apellido y nombre *" minLength={2} {...fieldProps('patient.fullName')} value={patient.fullName} onChange={(v) => updatePatient('fullName', v)} required />
              <Field label="Domicilio" {...fieldProps('patient.address')} value={patient.address} onChange={(v) => updatePatient('address', v)} />
              <Field label={patient.birthDate ? 'Edad al abrir la historia (automática)' : 'Edad'} {...fieldProps('patient.age')} inputMode="numeric" maxLength={3} value={patient.birthDate ? ageAt(patient.birthDate, patient.date) : patient.age} readOnly={Boolean(patient.birthDate)} onChange={(v) => updatePatient('age', v)} />
              <Field label="Fecha de nacimiento" type="date" max={patient.date || today()} {...fieldProps('patient.birthDate')} value={patient.birthDate} onChange={(v) => updatePatient('birthDate', v)} />
              <Field label="Teléfono" type="tel" {...fieldProps('patient.phone')} value={patient.phone} onChange={(v) => updatePatient('phone', v)} /><Field label="Celular" type="tel" {...fieldProps('patient.mobile')} value={patient.mobile} onChange={(v) => updatePatient('mobile', v)} />
              <Field label="Obra social" {...fieldProps('patient.insurance')} value={patient.insurance} onChange={(v) => updatePatient('insurance', v)} /><Field label="Ocupación" {...fieldProps('patient.occupation')} value={patient.occupation} onChange={(v) => updatePatient('occupation', v)} /><Field label="DNI" hint="Opcional · de 6 a 10 dígitos" inputMode="numeric" maxLength={16} {...fieldProps('patient.dni')} value={patient.dni} onChange={(v) => updatePatient('dni', v)} />
              <Field label="Contacto de emergencia" {...fieldProps('patient.emergencyContact')} value={patient.emergencyContact} onChange={(v) => updatePatient('emergencyContact', v)} /><Field label="Teléfono de emergencia" type="tel" {...fieldProps('patient.emergencyPhone')} value={patient.emergencyPhone} onChange={(v) => updatePatient('emergencyPhone', v)} />
            </div></section>
            <section className="form-section"><div className="section-title-row"><div><h3>Antecedentes de salud</h3><p className="section-subtitle">Una respuesta sin marcar significa «sin responder», no «No».</p></div></div><Antecedents label="Antecedente" items={patient.antecedents} onChange={(id, patch) => updateAntecedent('antecedents', id, patch)} /></section>
            <section className="form-section"><div className="section-title-row"><h3>Vacunas y tratamientos</h3></div><Antecedents label="Vacuna" items={patient.vaccines} onChange={(id, patch) => updateAntecedent('vaccines', id, patch)} /><div className="additional-fields"><div className="treatment-answer"><span>¿Está en tratamiento?</span><Answers label="¿Está en tratamiento?" value={patient.treatment} onChange={(answer) => updatePatient('treatment', answer)} /></div><Notes label="Tratamiento / profesional tratante" value={patient.treatmentNotes} onChange={(v) => updatePatient('treatmentNotes', v)} /><Notes label="Medicación que toma" value={patient.medication} onChange={(v) => updatePatient('medication', v)} /></div></section>
            <section className="form-section"><div className="section-title-row"><h3>Otros datos y consentimiento</h3></div><div className="field-grid habits-grid">
              <Field label="Deportes y frecuencia" {...fieldProps('patient.sports')} value={patient.sports} onChange={(v) => updatePatient('sports', v)} /><Field label="Alimentación" {...fieldProps('patient.diet')} value={patient.diet} onChange={(v) => updatePatient('diet', v)} /><Field label="Consumo de alcohol / cantidad" {...fieldProps('patient.alcohol')} value={patient.alcohol} onChange={(v) => updatePatient('alcohol', v)} /><Field label="Tabaquismo / cantidad" {...fieldProps('patient.smoking')} value={patient.smoking} onChange={(v) => updatePatient('smoking', v)} /><Field label="Tipo de calzado" {...fieldProps('patient.footwear')} value={patient.footwear} onChange={(v) => updatePatient('footwear', v)} /><Field label="Me contactó por" maxLength={80} {...fieldProps('patient.referredBy')} value={patient.referredBy} onChange={(v) => updatePatient('referredBy', v)} />
            </div><div className="consent-panel"><p>Autorización para fotografías de patologías podológicas destinadas al seguimiento, docencia y estadísticas.</p><Answers label="Autorización para fotografías" value={patient.photoConsent} onChange={(answer) => updatePatient('photoConsent', answer)} /><small>Registrá únicamente lo informado por el paciente. Esta respuesta no reemplaza el consentimiento firmado ni implica que se hayan tomado fotografías.</small></div></section>
          </> : <>
            <section className="form-section"><div className="section-title-row"><h3>Valores habituales</h3></div><div className="field-grid clinical-grid"><div className="patient-summary-field"><span>Paciente</span><strong>{patient.fullName || 'Sin completar'}</strong></div><div className="patient-summary-field"><span>N.º de historia</span><strong>{patient.historyNumber || 'Se asigna al guardar'}</strong></div><Field label="T.A." maxLength={40} value={clinical.pressure} onChange={(v) => updateClinical('pressure', v)} placeholder="Ej. 120/80 mmHg" /><Field label="Glucemia" maxLength={40} value={clinical.glucose} onChange={(v) => updateClinical('glucose', v)} placeholder="Valor y unidad" /><Field label="Peso (kg)" hint="Ej. 70,5 · mayor que 0, hasta 700" maxLength={10} inputMode="decimal" {...fieldProps('clinical.weight')} value={clinical.weight} onChange={(v) => updateClinical('weight', v)} /><Field label="Talla (cm)" hint="Ej. 165 · mayor que 0, hasta 300" maxLength={10} inputMode="decimal" {...fieldProps('clinical.height')} value={clinical.height} onChange={(v) => updateClinical('height', v)} /><div className="patient-summary-field bmi-field"><span>IMC (kg/m²)</span><strong>{bmi(clinical.weight, clinical.height) || '—'}</strong></div></div><div className="additional-fields"><Notes label="Observaciones / valores habituales" value={clinical.usual} onChange={(v) => updateClinical('usual', v)} /></div></section>
            <section className="form-section evolution-section"><div className="section-title-row evolution-title"><div><h3>Historial de evolución</h3><p className="section-subtitle">Una entrada por consulta. El PDF conserva este orden.</p></div><span>{evolutions.length} {evolutions.length === 1 ? 'consulta' : 'consultas'}</span></div>
              {evolutions.length === 0 ? <div className="evolution-empty"><FileText size={24} /><p>Todavía no hay evoluciones. Podés guardar la ficha inicial y agregar consultas después.</p></div> : <div className="evolution-entries">{evolutions.map((evolution, index) => <article className="evolution-card" key={evolution.id}>
                <div className="evolution-card-heading"><span className="evolution-index">CONSULTA {String(index + 1).padStart(2, '0')}</span><Field label={`Fecha de consulta ${index + 1}`} type="date" max={today()} min={patient.birthDate || undefined} {...fieldProps(`evolutions.${evolution.id}.date`)} value={evolution.date} onChange={(value) => updateEvolution(evolution.id, { date: value })} /><button className="remove-evolution-button" type="button" aria-label={`Quitar consulta ${index + 1}`} onClick={() => setRemoveId(evolution.id)}><Trash2 size={16} /></button></div>
                <TextAreaField label="Procedimiento / evaluación" rows={4} maxLength={20000} required {...fieldProps(`evolutions.${evolution.id}.procedure`)} value={evolution.procedure} onChange={(event) => updateEvolution(evolution.id, { procedure: event.target.value })} placeholder="Motivo de consulta, evaluación podológica, procedimiento realizado e indicaciones…" />
              </article>)}</div>}
              <div className="add-evolution-row"><button className="add-evolution-button" type="button" disabled={evolutions.length >= 500} onClick={addEvolution}><Plus size={16} />Agregar consulta</button></div>
            </section>
          </>}
          </fieldset>
          <div className="sheet-actions"><span className={`save-state ${dirty ? 'is-dirty' : ''}`}>{dirty ? <span className="edit-dot" /> : <Check size={14} />}{busy ? 'Guardando…' : dirty ? 'Cambios sin guardar' : saved ? 'Todos los cambios guardados' : 'Nueva ficha'}</span><div className="pager-actions"><button className="secondary-button" type="button" onClick={() => setPage(page === 1 ? 2 : 1)}>{page === 2 && <ArrowLeft size={15} />}{page === 1 ? 'Evoluciones' : 'Ficha inicial'}{page === 1 && <ArrowRight size={15} />}</button><button className="primary-button" type="submit" disabled={busy || (!dirty && Boolean(saved))}>{busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{busy ? 'Guardando…' : 'Guardar historia'}</button></div></div>
          <div className="editor-pdf">{(!saved || dirty) && <p className="section-subtitle">Guardá la historia antes de descargar sus planillas. Las planillas vacías también están disponibles desde Inicio.</p>}<PdfActions record={draft} clinic={membership.clinic} disabled={busy || dirty || !saved} /></div>
        </section>
      </div>
    </Form>
    {removeId && <Modal title="¿Quitar esta consulta?" onClose={() => setRemoveId(null)}><p>Se quitará de la ficha al guardar. Las versiones anteriores se conservan en el historial.</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setRemoveId(null)}>Cancelar</button><button className="danger-button" type="button" onClick={removeEvolution}>Quitar consulta</button></div></Modal>}
    {historyOpen && saved && <RecordHistory patientId={saved.id} onClose={() => setHistoryOpen(false)} />}
  </>
}

function RecordHistory({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { membership } = useClinic()
  const [revisions, setRevisions] = useState<Awaited<ReturnType<typeof listRevisions>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    listRevisions(patientId).then((value) => { if (active) setRevisions(value) })
      .catch((err) => { if (active) setError(errorMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [patientId])
  async function download(id: number) {
    setBusyId(id); setError('')
    try { const snapshot = await getRevision(patientId, id); await downloadPdf(snapshot, membership.clinic, 'complete') }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusyId(null) }
  }
  return <Modal title="Versiones guardadas" onClose={onClose}><p>Cada guardado conserva una copia completa de la ficha. Se muestran las últimas 30 versiones, solo para consulta y descarga.</p>{error && <Notice>{error}</Notice>}{loading ? <Loading /> : <ul className="revision-list">{revisions.map((revision) => <li key={revision.id}><div><strong>Versión {revision.version}</strong><span>{new Date(revision.recorded_at).toLocaleString('es-AR')}</span></div><button className="secondary-button" type="button" disabled={busyId !== null} onClick={() => download(revision.id)}><Download size={14} />{busyId === revision.id ? 'Generando…' : 'PDF'}</button></li>)}</ul>}</Modal>
}
