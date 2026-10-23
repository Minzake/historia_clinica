import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loading, Notice } from '../components/ui'
import { resolveSpecialty } from './registry'
import { useClinic } from '../context'
import { specialtyAccess } from '../core/access'

const PodologyEditor = lazy(() => import('./podologia/Editor').then(module => ({ default: module.PodologyEditor })))
const OdontologyEditor = lazy(() => import('./odontologia/Editor').then(module=>({default:module.OdontologyEditor})))
export function SpecialtyEditor() {
  const [params] = useSearchParams()
  const {membership}=useClinic()
  const specialty=params.get('especialidad')||membership.specialties?.find(s=>s.canRead)?.specialtyId||'podologia'
  if(!specialtyAccess(membership,specialty)?.canRead)return <Notice>Tu cuenta no tiene acceso a historias clínicas de esta especialidad. Podés gestionar pacientes y agenda desde la navegación principal.</Notice>
  try { resolveSpecialty(specialty) }
  catch { return <Notice>Esta especialidad o versión de ficha todavía no está disponible en esta aplicación.</Notice> }
  return <Suspense fallback={<Loading label="Abriendo ficha…"/>}>{specialty==='odontologia'?<OdontologyEditor/>:<PodologyEditor/>}</Suspense>
}
