import { Link } from 'react-router-dom'
import { ArrowUpRight, FileText } from 'lucide-react'
import { formatDate } from '../lib/model'
import type { PatientSummary } from '../lib/model'

export function PatientList({ patients }: { patients: PatientSummary[] }) {
  return <div className="table-scroll"><table className="patients-table history-table"><thead><tr><th>Paciente</th><th>N.º de historia</th><th>DNI</th><th>Actualización</th><th><span className="sr-only">Acciones</span></th></tr></thead>
    <tbody>{patients.map((patient) => <tr key={patient.id}>
      <td><Link className="patient-name-link" to={`/historias/${patient.id}`}><span className="patient-avatar" aria-hidden="true">{patient.full_name.trim().slice(0, 1).toLocaleUpperCase('es')}</span><strong>{patient.full_name}</strong></Link></td>
      <td data-label="N.º de historia"><span className="history-badge">{patient.history_number}</span></td><td data-label="DNI">{patient.dni || '—'}</td><td data-label="Actualización">{formatDate(patient.updated_at)}</td>
      <td><div className="table-actions"><Link to={`/historias/${patient.id}`} title={`Abrir primera hoja de ${patient.full_name}`}><FileText size={14} />Primera hoja</Link><Link to={`/historias/${patient.id}?hoja=2`} title={`Ver evoluciones de ${patient.full_name}`}>Evoluciones<ArrowUpRight size={13} /></Link></div></td>
    </tr>)}</tbody>
  </table></div>
}
