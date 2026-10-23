import { Link } from 'react-router-dom'
import { ArrowUpRight, FileText } from 'lucide-react'
import { formatDate } from '../lib/model'
import type { PatientSummary } from '../lib/model'
import { chartUrl } from '../core/specialties'

export function PatientList({ patients }: { patients: PatientSummary[] }) {
  return <div className="table-scroll"><table className="patients-table history-table"><thead><tr><th>Paciente</th><th>N.º de historia</th><th>DNI</th><th>Actualización</th><th><span className="sr-only">Acciones</span></th></tr></thead>
    <tbody>{patients.map((patient) => {const links=patient.chart_links||[{specialtyId:'podologia',name:'Podología',action:'open' as const}];const primary=links.find(l=>l.action==='open')||links[0];const url=primary?chartUrl(patient.id,primary.specialtyId,primary.action==='create'):'/pacientes';return <tr key={patient.id}>
      <td><Link className="patient-name-link" to={url}><span className="patient-avatar" aria-hidden="true">{patient.full_name.trim().slice(0, 1).toLocaleUpperCase('es')}</span><strong>{patient.full_name}</strong></Link></td>
      <td data-label="N.º de historia"><span className="history-badge">{patient.history_number}</span></td><td data-label="DNI">{patient.dni || '—'}</td><td data-label="Actualización">{formatDate(patient.updated_at)}</td>
      <td><div className="table-actions">{links.length===1&&links[0].specialtyId==='podologia'&&links[0].action==='open'?<><Link to={url} title={`Abrir primera hoja de ${patient.full_name}`}><FileText size={14} />Primera hoja</Link><Link to={`${url}?hoja=2`} title={`Ver evoluciones de ${patient.full_name}`}>Evoluciones<ArrowUpRight size={13}/></Link></>:links.map(link=><Link key={link.specialtyId} to={chartUrl(patient.id,link.specialtyId,link.action==='create')}><FileText size={14}/>{link.action==='create'?'Crear ficha · ':''}{link.name}</Link>)}</div></td>
    </tr>})}</tbody>
  </table></div>
}
