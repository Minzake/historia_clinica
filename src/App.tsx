import { useState } from 'react'
import type { jsPDF as JsPDFDocument } from 'jspdf'
import { ArrowLeft, ArrowRight, BriefcaseMedical, Check, Download, FileText, Settings2, X } from 'lucide-react'
import './App.css'

type Answer = 'unset' | 'yes' | 'no'
type Antecedent = { id: string; label: string; answer: Answer; notes: string }
type Patient = {
  historyNumber: string; date: string; fullName: string; address: string; age: string; birthDate: string
  phone: string; mobile: string; insurance: string; occupation: string; dni: string
  emergencyContact: string; emergencyPhone: string; antecedents: Antecedent[]
}
type Clinical = { usual: string; pressure: string; glucose: string; weight: string; height: string; visitDate: string; procedure: string }
type Clinic = { name: string; professional: string; address: string; phone: string; email: string; license: string }

const labels = ['Diabetes', 'VPP - NPP', 'Enfermedades cardíacas', 'Hipertensión', 'Hipotensión', 'Convulsiones', 'Asma', 'Alergias', 'VIH / Sida - Sífilis - Otras', 'Hepatitis', 'Tuberculosis', 'Infecciones', 'Fracturas / Esguinces', 'Luxaciones', 'Colesterol', 'Tiroides', 'Está anticoagulado', 'Otros (detallar)']
const settingsKey = 'historia-clinica-consultorio-v1'

function today() {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

function blankPatient(): Patient {
  return {
    historyNumber: '', date: today(), fullName: '', address: '', age: '', birthDate: '', phone: '', mobile: '',
    insurance: '', occupation: '', dni: '', emergencyContact: '', emergencyPhone: '',
    antecedents: labels.map((label, index) => ({ id: String(index), label, answer: 'unset', notes: '' })),
  }
}

function loadClinic(): Clinic {
  const empty = { name: '', professional: '', address: '', phone: '', email: '', license: '' }
  try {
    const saved = localStorage.getItem(settingsKey)
    return saved ? { ...empty, ...JSON.parse(saved) as Partial<Clinic> } : empty
  } catch {
    return empty
  }
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return <label className="field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>
}

function writeText(doc: JsPDFDocument, value: string, x: number, y: number, size = 7, bold = false) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal')
  doc.setFontSize(size)
  doc.text(value || '', x, y)
}

function box(doc: JsPDFDocument, label: string, value: string, x: number, y: number, width: number, height = 12) {
  doc.rect(x, y, width, height)
  writeText(doc, label, x + 2, y + 4, 6, true)
  if (value) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(doc.splitTextToSize(value, width - 4).slice(0, 2), x + 2, y + 9)
  }
}

async function buildPdf(patient: Patient, clinical: Clinical, clinic: Clinic) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const x = 13
  const width = 184
  const right = x + width
  doc.setDrawColor(28, 48, 47)
  doc.setTextColor(28, 48, 47)
  doc.setLineWidth(0.25)
  writeText(doc, clinic.name || 'Consultorio', x, 12, 9, true)
  writeText(doc, clinic.professional, x, 16, 7)
  writeText(doc, [clinic.address, clinic.phone, clinic.email].filter(Boolean).join('  ·  '), x, 20, 6)
  doc.line(x, 23, right, 23)
  writeText(doc, 'HISTORIA CLÍNICA', x, 30, 11, true)
  writeText(doc, `Nro.: ${patient.historyNumber || '________________'}`, right - 48, 29, 7, true)
  writeText(doc, `Fecha: ${patient.date || '____ / ____ / ______'}`, right - 48, 33, 7)
  if (clinic.license) writeText(doc, `Matrícula: ${clinic.license}`, right - 48, 37, 6)
  let y = 38
  box(doc, 'Apellido y nombre', patient.fullName, x, y, 108)
  box(doc, 'Domicilio', patient.address, x + 108, y, width - 108)
  y += 12
  const demographic: [string, string, number][] = [['Edad', patient.age, 25], ['Fecha de nacimiento', patient.birthDate, 38], ['Teléfono', patient.phone, 38], ['Celular', patient.mobile, 38], ['DNI', patient.dni, width - 139]]
  let cursor = x
  demographic.forEach(([label, value, cellWidth]) => { box(doc, label, value, cursor, y, cellWidth); cursor += cellWidth })
  y += 12
  box(doc, 'Obra social', patient.insurance, x, y, 72)
  box(doc, 'Ocupación', patient.occupation, x + 72, y, 67)
  box(doc, 'DNI', patient.dni, x + 139, y, width - 139)
  y += 12
  box(doc, 'Familiar de contacto en caso de emergencia', patient.emergencyContact, x, y, 132)
  box(doc, 'Teléfono', patient.emergencyPhone, x + 132, y, width - 132)
  y += 16
  doc.setFillColor(231, 238, 235)
  doc.rect(x, y, width, 7, 'F')
  doc.rect(x, y, width, 7)
  writeText(doc, 'ANTECEDENTES DE SALUD', x + 2, y + 4.7, 7, true)
  y += 7
  const labelWidth = 65
  const yesWidth = 14
  const noWidth = 14
  const notesX = x + labelWidth + yesWidth + noWidth
  doc.rect(x, y, width, 6)
  doc.line(x + labelWidth, y, x + labelWidth, y + 6)
  doc.line(x + labelWidth + yesWidth, y, x + labelWidth + yesWidth, y + 6)
  doc.line(notesX, y, notesX, y + 6)
  writeText(doc, 'Antecedente', x + 2, y + 4, 6, true)
  writeText(doc, 'Sí', x + labelWidth + 5, y + 4, 6, true)
  writeText(doc, 'No', x + labelWidth + yesWidth + 5, y + 4, 6, true)
  writeText(doc, 'Observaciones', notesX + 2, y + 4, 6, true)
  y += 6
  patient.antecedents.forEach((item) => {
    const rowHeight = 6.2
    doc.rect(x, y, width, rowHeight)
    doc.line(x + labelWidth, y, x + labelWidth, y + rowHeight)
    doc.line(x + labelWidth + yesWidth, y, x + labelWidth + yesWidth, y + rowHeight)
    doc.line(notesX, y, notesX, y + rowHeight)
    writeText(doc, item.label, x + 2, y + 4, 6)
    if (item.answer === 'yes') writeText(doc, 'X', x + labelWidth + 5, y + 4, 7, true)
    if (item.answer === 'no') writeText(doc, 'X', x + labelWidth + yesWidth + 5, y + 4, 7, true)
    writeText(doc, item.notes, notesX + 2, y + 4, 6)
    y += rowHeight
  })
  writeText(doc, 'La información de esta historia clínica es confidencial.', x, 286, 6)

  doc.addPage()
  writeText(doc, clinic.name || 'Consultorio', x, 15, 9, true)
  writeText(doc, 'FICHA DE EVOLUCIÓN', x, 25, 10, true)
  writeText(doc, 'Hoja: 1', right, 25, 7, true)
  const infoY = 36
  doc.rect(x, infoY, width, 39)
  writeText(doc, 'Paciente:', x + 2, infoY + 5, 6, true)
  writeText(doc, patient.fullName, x + 20, infoY + 5, 7)
  writeText(doc, 'Nro. de Historia Clínica:', x + 112, infoY + 5, 6, true)
  writeText(doc, patient.historyNumber, x + 151, infoY + 5, 7)
  doc.line(x, infoY + 8, right, infoY + 8)
  writeText(doc, 'Observaciones / valores habituales:', x + 2, infoY + 13, 6, true)
  writeText(doc, clinical.usual, x + 53, infoY + 13, 7)
  writeText(doc, 'T.A.:', x + 2, infoY + 22, 6, true)
  writeText(doc, clinical.pressure, x + 14, infoY + 22, 7)
  writeText(doc, 'Peso:', x + 93, infoY + 22, 6, true)
  writeText(doc, clinical.weight ? `${clinical.weight} kg` : '', x + 106, infoY + 22, 7)
  writeText(doc, 'Glucemia:', x + 2, infoY + 32, 6, true)
  writeText(doc, clinical.glucose, x + 20, infoY + 32, 7)
  writeText(doc, 'Talla:', x + 93, infoY + 32, 6, true)
  writeText(doc, clinical.height ? `${clinical.height} cm` : '', x + 106, infoY + 32, 7)
  const meters = Number(clinical.height) / 100
  const bmi = Number(clinical.weight) > 0 && meters > 0 ? (Number(clinical.weight) / meters ** 2).toFixed(1) : ''
  writeText(doc, 'IMC:', x + 145, infoY + 32, 6, true)
  writeText(doc, bmi, x + 157, infoY + 32, 7)
  const tableY = infoY + 46
  const tableHeight = 177
  const dateWidth = 24
  const signatureWidth = 42
  const procedureWidth = width - dateWidth - signatureWidth
  doc.rect(x, tableY, width, tableHeight)
  doc.line(x + dateWidth, tableY, x + dateWidth, tableY + tableHeight)
  doc.line(x + dateWidth + procedureWidth, tableY, x + dateWidth + procedureWidth, tableY + tableHeight)
  doc.line(x, tableY + 8, right, tableY + 8)
  writeText(doc, 'Fecha', x + 2, tableY + 5.2, 6, true)
  writeText(doc, 'Procedimiento', x + dateWidth + 2, tableY + 5.2, 6, true)
  writeText(doc, 'Firma del paciente', x + dateWidth + procedureWidth + 2, tableY + 5.2, 6, true)
  writeText(doc, clinical.visitDate, x + 2, tableY + 14, 7)
  if (clinical.procedure) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(doc.splitTextToSize(clinical.procedure, procedureWidth - 5), x + dateWidth + 2, tableY + 14)
  }
  doc.line(x + dateWidth + procedureWidth + 5, tableY + tableHeight - 12, right - 5, tableY + tableHeight - 12)
  writeText(doc, 'Aclaración', x + dateWidth + procedureWidth + 2, tableY + tableHeight - 5, 5.5)
  if (clinic.license) writeText(doc, `Matrícula: ${clinic.license}`, x, 284, 6)
  writeText(doc, 'La información de esta ficha es confidencial.', x, 289, 6)
  return doc
}

function App() {
  const [patient, setPatient] = useState(blankPatient)
  const [clinical, setClinical] = useState<Clinical>({ usual: '', pressure: '', glucose: '', weight: '', height: '', visitDate: today(), procedure: '' })
  const [clinic, setClinic] = useState(loadClinic)
  const [page, setPage] = useState<1 | 2>(1)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const updatePatient = (key: Exclude<keyof Patient, 'antecedents'>, value: string) => setPatient((current) => ({ ...current, [key]: value }))
  const updateClinical = (key: keyof Clinical, value: string) => setClinical((current) => ({ ...current, [key]: value }))
  const updateAntecedent = (id: string, patch: Partial<Antecedent>) => setPatient((current) => ({ ...current, antecedents: current.antecedents.map((item) => item.id === id ? { ...item, ...patch } : item) }))
  const saveClinic = (value: Clinic) => {
    setClinic(value)
    try { localStorage.setItem(settingsKey, JSON.stringify(value)) } catch { }
    setSettingsOpen(false)
  }
  const download = async () => {
    const slug = patient.fullName.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
    const doc = await buildPdf(patient, clinical, clinic)
    doc.save(`historia-clinica${slug ? `-${slug}` : ''}.pdf`)
    setDownloaded(true)
    window.setTimeout(() => setDownloaded(false), 2500)
  }
  const meters = Number(clinical.height) / 100
  const bmi = Number(clinical.weight) > 0 && meters > 0 ? (Number(clinical.weight) / meters ** 2).toFixed(1) : ''
  const clinicConfigured = Object.values(clinic).some((value) => value.trim().length > 0)

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#inicio" aria-label="Historia clínica, inicio"><span className="brand-mark"><BriefcaseMedical size={19} /></span><span>{clinic.name || 'Historia clínica'}</span></a><div className="topbar-actions"><span className="privacy-label"><span className="privacy-dot" /> Datos clínicos solo en esta sesión</span><span className={`clinic-status ${clinicConfigured ? 'is-loaded' : 'is-empty'}`} role="status" aria-live="polite" title={clinicConfigured ? 'Datos del consultorio guardados en este navegador' : 'Todavía no hay datos del consultorio guardados'}><span className="clinic-status-icon" aria-hidden="true">{clinicConfigured && <Check size={12} />}</span><span>{clinicConfigured ? 'Datos cargados' : 'Sin configurar'}</span></span><button className="icon-button settings-button" type="button" aria-label="Datos del consultorio" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /><span>Consultorio</span></button></div></header>
    <main id="inicio" className="workspace">
      <div className="page-heading"><div><p className="eyebrow">REGISTRO · NUEVA HISTORIA</p><h1>Historia clínica</h1></div><button className="download-button" type="button" onClick={download}>{downloaded ? <Check size={17} /> : <Download size={17} />}<span>{downloaded ? 'PDF descargado' : 'Descargar PDF'}</span></button></div>
      <div className="editor-layout">
        <nav className="sheet-navigation" aria-label="Hojas de historia clínica"><p className="nav-label">FORMULARIO</p><button className={`sheet-tab ${page === 1 ? 'active' : ''}`} type="button" onClick={() => setPage(1)} aria-current={page === 1 ? 'step' : undefined}><span className="sheet-number">01</span><span className="sheet-tab-copy"><strong>Datos y antecedentes</strong><small>Identificación · salud</small></span>{page === 1 && <span className="active-indicator" />}</button><button className={`sheet-tab ${page === 2 ? 'active' : ''}`} type="button" onClick={() => setPage(2)} aria-current={page === 2 ? 'step' : undefined}><span className="sheet-number">02</span><span className="sheet-tab-copy"><strong>Ficha de evolución</strong><small>Valores · procedimiento</small></span>{page === 2 && <span className="active-indicator" />}</button><div className="nav-footer"><FileText size={16} /><span>PDF de 2 hojas</span></div></nav>
        <section className="form-sheet" aria-labelledby="sheet-title">
          <div className="sheet-heading"><div className="sheet-heading-number">0{page}<span>/ 02</span></div><div><p className="eyebrow">{page === 1 ? 'IDENTIFICACIÓN DEL PACIENTE' : 'REGISTRO DE ATENCIÓN'}</p><h2 id="sheet-title">{page === 1 ? 'Datos y antecedentes' : 'Ficha de evolución'}</h2></div><span className="sheet-meta">HOJA {page}</span></div>
          {page === 1 ? <>
            <section className="form-section"><div className="section-title-row"><h3>Datos personales</h3><span>01 — 04</span></div><div className="field-grid personal-grid">
              <Field label="Historia clínica N.º" value={patient.historyNumber} onChange={(v) => updatePatient('historyNumber', v)} /><Field label="Fecha" type="date" value={patient.date} onChange={(v) => updatePatient('date', v)} />
              <Field label="Apellido y nombre" value={patient.fullName} onChange={(v) => updatePatient('fullName', v)} /><Field label="Domicilio" value={patient.address} onChange={(v) => updatePatient('address', v)} />
              <Field label="Edad" value={patient.age} onChange={(v) => updatePatient('age', v)} /><Field label="Fecha de nacimiento" type="date" value={patient.birthDate} onChange={(v) => updatePatient('birthDate', v)} />
              <Field label="Teléfono" value={patient.phone} onChange={(v) => updatePatient('phone', v)} /><Field label="Celular" value={patient.mobile} onChange={(v) => updatePatient('mobile', v)} />
              <Field label="Obra social" value={patient.insurance} onChange={(v) => updatePatient('insurance', v)} /><Field label="Ocupación" value={patient.occupation} onChange={(v) => updatePatient('occupation', v)} /><Field label="DNI" value={patient.dni} onChange={(v) => updatePatient('dni', v)} />
              <Field label="Contacto de emergencia" value={patient.emergencyContact} onChange={(v) => updatePatient('emergencyContact', v)} /><Field label="Teléfono de emergencia" value={patient.emergencyPhone} onChange={(v) => updatePatient('emergencyPhone', v)} />
            </div></section>
            <section className="form-section antecedents-section"><div className="section-title-row"><div><h3>Antecedentes de salud</h3><p className="section-subtitle">Indicá sí o no y agregá observaciones cuando haga falta.</p></div><span>02 — 04</span></div><div className="antecedent-table" role="table" aria-label="Antecedentes de salud"><div className="antecedent-header" role="row"><span role="columnheader">Antecedente</span><span role="columnheader" className="answer-heading">Respuesta</span><span role="columnheader">Observaciones</span></div>{patient.antecedents.map((item) => <div className="antecedent-row" role="row" key={item.id}><span className="antecedent-name" role="rowheader">{item.label}</span><div className="status-control" role="group" aria-label={`${item.label}: respuesta`}><button type="button" className={item.answer === 'yes' ? 'selected' : ''} aria-pressed={item.answer === 'yes'} onClick={() => updateAntecedent(item.id, { answer: item.answer === 'yes' ? 'unset' : 'yes' })}>Sí</button><button type="button" className={item.answer === 'no' ? 'selected' : ''} aria-pressed={item.answer === 'no'} onClick={() => updateAntecedent(item.id, { answer: item.answer === 'no' ? 'unset' : 'no' })}>No</button></div><input className="notes-input" aria-label={`Observaciones: ${item.label}`} value={item.notes} onChange={(event) => updateAntecedent(item.id, { notes: event.target.value })} /></div>)}</div></section>
          </> : <>
            <section className="form-section"><div className="section-title-row"><h3>Valores habituales</h3><span>03 — 04</span></div><div className="field-grid clinical-grid"><div className="patient-summary-field"><span>Paciente</span><strong>{patient.fullName || 'Sin completar'}</strong></div><div className="patient-summary-field"><span>N.º de historia clínica</span><strong>{patient.historyNumber || '—'}</strong></div><Field label="Observaciones / valores habituales" value={clinical.usual} onChange={(v) => updateClinical('usual', v)} /><Field label="T.A." value={clinical.pressure} onChange={(v) => updateClinical('pressure', v)} placeholder="Ej. 120/80" /><Field label="Glucemia" value={clinical.glucose} onChange={(v) => updateClinical('glucose', v)} /><Field label="Peso (kg)" value={clinical.weight} onChange={(v) => updateClinical('weight', v)} /><Field label="Talla (cm)" value={clinical.height} onChange={(v) => updateClinical('height', v)} /><div className="patient-summary-field bmi-field"><span>IMC</span><strong>{bmi || '—'}</strong></div></div></section>
            <section className="form-section evolution-section"><div className="section-title-row"><div><h3>Evolución</h3><p className="section-subtitle">Una ficha por atención en esta descarga.</p></div><span>04 — 04</span></div><div className="field-grid evolution-grid"><Field label="Fecha" type="date" value={clinical.visitDate} onChange={(v) => updateClinical('visitDate', v)} /><label className="field procedure-field"><span>Procedimiento / evolución</span><textarea value={clinical.procedure} onChange={(event) => updateClinical('procedure', event.target.value)} rows={8} /></label><div className="signature-note"><span>Firma del paciente</span><div className="signature-line" /><small>Espacio reservado en el PDF para firma manuscrita.</small></div></div></section>
          </>}
          <div className="sheet-actions"><span className="edit-state"><span className="edit-dot" /> Edición en curso</span><div className="pager-actions"><button className="secondary-button" type="button" onClick={() => setPage(1)} disabled={page === 1}><ArrowLeft size={16} /> Anterior</button><button className="primary-button" type="button" onClick={() => setPage(2)} disabled={page === 2}>Siguiente <ArrowRight size={16} /></button></div></div>
        </section>
      </div>
    </main>
    {settingsOpen && <SettingsDialog initial={clinic} onClose={() => setSettingsOpen(false)} onSave={saveClinic} />}
  </div>
}

function SettingsDialog({ initial, onClose, onSave }: { initial: Clinic; onClose: () => void; onSave: (settings: Clinic) => void }) {
  const [draft, setDraft] = useState(initial)
  const update = (key: keyof Clinic, value: string) => setDraft((current) => ({ ...current, [key]: value }))
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div className="dialog-heading"><div className="dialog-icon"><Settings2 size={18} /></div><div><p className="eyebrow">PREFERENCIAS</p><h2 id="settings-title">Datos del consultorio</h2></div><button className="close-button" type="button" onClick={onClose} aria-label="Cerrar configuración"><X size={18} /></button></div>
    <div className="settings-fields"><Field label="Nombre del consultorio" value={draft.name} onChange={(v) => update('name', v)} placeholder="Se puede definir más adelante" /><Field label="Profesional" value={draft.professional} onChange={(v) => update('professional', v)} /><Field label="Dirección" value={draft.address} onChange={(v) => update('address', v)} /><div className="field-grid settings-contact-grid"><Field label="Teléfono" value={draft.phone} onChange={(v) => update('phone', v)} /><Field label="Correo electrónico" type="email" value={draft.email} onChange={(v) => update('email', v)} /></div><Field label="Matrícula profesional" value={draft.license} onChange={(v) => update('license', v)} /></div>
    <p className="settings-footnote">Estos datos se guardan solo en este navegador y se imprimen en el PDF. Los datos de pacientes no se guardan.</p><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="button" onClick={() => onSave(draft)}>Guardar datos</button></div>
  </section></div>
}

export default App
