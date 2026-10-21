import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Plus, Search, Users } from 'lucide-react'
import { useClinic } from '../context'
import { listPatients } from '../lib/api'
import type { PatientSummary } from '../lib/model'
import { errorMessage } from '../lib/supabase'
import { Loading, Notice } from '../components/ui'
import { PatientList } from '../components/PatientList'
import { canCreateClinical, canReadClinical } from '../core/access'

export function Patients() {
  const {membership}=useClinic()
  return canReadClinical(membership)?<ClinicalPatients/>:<Notice>Tu cuenta no tiene acceso al archivo clínico. Podés gestionar los datos personales desde Pacientes.</Notice>
}
function ClinicalPatients() {
  const { membership } = useClinic()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || ''
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; patients: PatientSummary[]; count: number; error: string }>({ key: '', patients: [], count: 0, error: '' })
  const key = JSON.stringify([membership.clinicId, query, page, attempt])
  const loading = result.key !== key
  const { patients, count } = result
  const error = loading ? '' : result.error
  const pageSize = 12
  useEffect(() => {
    let active = true
    const timeout = window.setTimeout(() => {
      listPatients(membership.clinicId, query, page, pageSize).then((value) => {
        if (active) setResult({ key, ...value, error: '' })
      }).catch((err) => { if (active) setResult({ key, patients: [], count: 0, error: errorMessage(err) }) })
    }, 300)
    return () => { active = false; window.clearTimeout(timeout) }
  }, [membership.clinicId, query, page, key])
  return <>
    <div className="page-heading"><div><p className="eyebrow">PACIENTES · ARCHIVO CLÍNICO</p><h1>Historias clínicas</h1><p className="page-description">Encontrá la primera hoja y continuá el seguimiento de cada paciente.</p></div>{canCreateClinical(membership)&&<Link className="primary-button" to="/historias/nueva"><Plus size={17} />Nuevo paciente</Link>}</div>
    <section className="panel"><div className="list-toolbar"><label className="list-search"><Search size={18} /><span className="sr-only">Buscar por nombre, DNI o número de historia</span><input type="search" maxLength={100} value={query} placeholder="Nombre, DNI o n.º de historia clínica" onChange={(event) => { setPage(0); setParams(event.target.value ? { q: event.target.value } : {}, { replace: true }) }} /></label><span className="result-count" role="status">{loading ? 'Buscando…' : `${count} ${count === 1 ? 'paciente' : 'pacientes'}`}</span></div>
      {error ? <div className="panel-content"><Notice>{error}</Notice><button className="secondary-button" onClick={() => setAttempt(attempt + 1)}>Reintentar</button></div> : loading ? <Loading label="Buscando historias…" /> : patients.length ? <PatientList patients={patients} /> : <div className="empty-state"><Users size={30} /><h3>{query ? 'No encontramos coincidencias' : 'Todavía no hay pacientes'}</h3><p>{query ? 'Probá con otro nombre, DNI o número de historia.' : 'Creá una historia para empezar a registrar consultas.'}</p>{query ? <button className="secondary-button" onClick={() => { setPage(0); setParams({}) }}>Limpiar búsqueda</button> : <Link className="primary-button" to="/historias/nueva">Crear historia</Link>}</div>}
      {!loading && !error && count > pageSize && <div className="list-pagination"><span>Página {page + 1} de {Math.ceil(count / pageSize)}</span><div className="button-row"><button className="secondary-button" disabled={page === 0} onClick={() => setPage(page - 1)}><ArrowLeft size={14} />Anterior</button><button className="secondary-button" disabled={(page + 1) * pageSize >= count} onClick={() => setPage(page + 1)}>Siguiente<ArrowRight size={14} /></button></div></div>}
    </section>
  </>
}
