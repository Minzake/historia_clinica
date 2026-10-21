import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loading, Notice } from '../components/ui'
import { resolveSpecialty } from './registry'
import { useClinic } from '../context'
import { canReadClinical } from '../core/access'

const PodologyEditor = lazy(() => import('./podologia/Editor').then(module => ({ default: module.PodologyEditor })))
export function SpecialtyEditor() {
  const [params] = useSearchParams()
  const {membership}=useClinic()
  if(!canReadClinical(membership))return <Notice>Tu cuenta no tiene acceso a historias clínicas. Podés gestionar pacientes y agenda desde la navegación principal.</Notice>
  try { resolveSpecialty(params.get('especialidad') || 'podologia') }
  catch { return <Notice>Esta especialidad o versión de ficha todavía no está disponible en esta aplicación.</Notice> }
  return <Suspense fallback={<Loading label="Abriendo ficha…"/>}><PodologyEditor/></Suspense>
}
