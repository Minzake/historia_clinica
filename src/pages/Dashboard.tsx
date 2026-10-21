import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight,CalendarDays,Clock, ClipboardList, FileDown, Plus, Search, Users } from 'lucide-react'
import { useClinic } from '../context'
import { getDashboard } from '../lib/api'
import { blankRecord } from '../lib/model'
import { errorMessage } from '../lib/supabase'
import { Loading, Modal, Notice, PdfActions } from '../components/ui'
import { PatientList } from '../components/PatientList'

export function Dashboard() {
  const { membership } = useClinic()
  const [data, setData] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [templates, setTemplates] = useState(false)
  const [dateLabel] = useState(() => new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).toLocaleUpperCase('es'))
  const [blank] = useState(() => { const value = blankRecord(); value.patient.date = ''; return value })
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    getDashboard(membership.clinicId).then((value) => { if (active) setData(value) })
      .catch((err) => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [membership.clinicId, attempt])
  function search(event: FormEvent) { event.preventDefault(); navigate(`/historias?q=${encodeURIComponent(query.trim())}`) }
  return <>
    <div className="page-heading"><div><p className="eyebrow">{dateLabel}</p><h1>Tu consultorio, al día.</h1><p className="page-description">Un espacio para acompañar a cada paciente.</p></div><Link className="primary-button" to="/historias/nueva"><Plus size={17} />Nuevo paciente</Link></div>
    {!membership.clinic.name && !membership.clinic.professional && <Notice kind="info">Antes de imprimir, completá los datos del profesional en <Link to="/consultorio">Consultorio</Link>.</Notice>}
    <form className="dashboard-search" role="search" onSubmit={search}><Search size={21} aria-hidden="true" /><label className="sr-only" htmlFor="dashboard-query">Buscar paciente por nombre, DNI o historia clínica</label><input id="dashboard-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Buscá un paciente por nombre, DNI o n.º de historia…" /><button className="primary-button" type="submit">Buscar<ArrowRight size={15} /></button></form>
    <div className="dashboard-shortcuts"><Link to="/agenda"><CalendarDays size={18}/><span>Agenda y turnos</span><ArrowRight size={15}/></Link>{membership.role==='owner'&&<><Link to="/agenda/configuracion"><Clock size={18}/><span>Horarios de reserva web</span><ArrowRight size={15}/></Link><Link to="/equipo"><Users size={18}/><span>Usuarios y equipo</span><ArrowRight size={15}/></Link></>}</div>
    {error && <Notice>{error} <button className="text-button" onClick={() => { setError(''); setData(null); setAttempt(attempt + 1) }}>Reintentar</button></Notice>}
    <div className="stats-grid"><div className="stat-card"><span className="stat-icon"><Users size={21} /></span><div><span>Historias clínicas</span><strong>{data?.count ?? '—'}</strong></div></div><div className="stat-card"><span className="stat-icon"><ClipboardList size={21} /></span><div><span>Evoluciones guardadas</span><strong>{data?.evolutions ?? '—'}</strong></div></div><button className="stat-card template-card" type="button" onClick={() => setTemplates(true)}><span className="stat-icon"><FileDown size={21} /></span><div><span>Para completar en papel</span><strong>Planillas PDF<ArrowRight size={17} /></strong></div></button></div>
    <section className="panel"><div className="panel-heading"><div><p className="eyebrow">HISTORIAS CLÍNICAS</p><h2>Últimas fichas actualizadas</h2></div><Link className="text-link" to="/historias">Ver todas<ArrowRight size={15} /></Link></div>
      {!data && !error ? <Loading /> : data?.patients.length ? <PatientList patients={data.patients} /> : !error && <div className="empty-state"><Users size={30} /><h3>Empezá con tu primer paciente</h3><p>Su ficha inicial y cada evolución quedarán guardadas en el consultorio.</p><Link className="primary-button" to="/historias/nueva"><Plus size={16} />Crear historia clínica</Link></div>}
    </section>
    {templates && <Modal title="Planillas para imprimir" onClose={() => setTemplates(false)}><p>Descargá la ficha inicial o la tabla de evolución sin completar. Para exportar datos de un paciente, abrí su historia.</p><PdfActions record={blank} clinic={membership.clinic} /></Modal>}
  </>
}
