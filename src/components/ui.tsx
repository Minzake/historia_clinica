import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Download, LoaderCircle, X } from 'lucide-react'
import { downloadPdf } from '../lib/pdf'
import type { PdfKind } from '../lib/pdf'
import type { Clinic, RecordDraft } from '../lib/model'
import { errorMessage } from '../lib/supabase'

export { Field, Form, SelectField, TextAreaField } from './Form'

export function Notice({ children, kind = 'error' }: { children: ReactNode; kind?: 'error' | 'success' | 'info' }) {
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle size={22} className="spin" /><span>{label}</span></div>
}

export function Modal({ title, onClose, children,className='' }: { title: string; onClose: () => void; children: ReactNode;className?:string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement as HTMLElement | null
    dialog.showModal()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} className={`modal ${className}`} aria-label={title} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <div className="dialog-heading"><h2>{title}</h2><button className="close-button" type="button" aria-label="Cerrar" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>
}

export function PdfActions({ record, clinic, disabled = false,beforeDownload }: { record: RecordDraft; clinic: Clinic; disabled?: boolean;beforeDownload?:()=>Promise<RecordDraft> }) {
  const [kind, setKind] = useState<PdfKind>('complete')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function download() {
    setBusy(true); setError(''); setMessage('')
    try {
      const source=beforeDownload?await beforeDownload():record
      await downloadPdf(source, clinic, kind)
      setMessage('PDF generado. Revisá las descargas de tu navegador.')
    } catch (error) { setError(error instanceof Error && error.message === 'INVALID_RECORD' ? 'La ficha contiene datos inválidos. Volvé a abrirla o contactá al consultorio antes de descargarla.' : beforeDownload?errorMessage(error):'No se pudo generar el PDF. Intentá nuevamente. Si acabás de actualizar la web, recargá la página.') }
    finally { setBusy(false) }
  }
  return <div className="pdf-panel">
    <div><h3>Descargar planillas</h3><p>Formato de tabla, listo para imprimir. La firma se completa en papel.</p></div>
    <div className="pdf-controls"><label className="field"><span>Contenido del PDF</span><select value={kind} onChange={(event) => { setKind(event.target.value as PdfKind); setMessage('') }} disabled={busy}>
      <option value="complete">Historia completa</option><option value="initial">Primera hoja · ficha inicial</option><option value="evolutions">Evoluciones registradas</option><option value="blank-evolution">Evolución vacía · escritura a mano</option>
    </select></label><button className="download-button" type="button" disabled={disabled || busy} onClick={download}>{busy ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}{busy ? 'Generando…' : 'Descargar PDF'}</button></div>
    {error && <Notice>{error}</Notice>}{message && <Notice kind="success">{message}</Notice>}
  </div>
}
