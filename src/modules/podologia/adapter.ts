import { identityKeys, patientIdentity } from '../../core/types'
import type { ClinicalEnvelope } from '../../core/types'
import type { Clinical, Evolution, Patient, RecordDraft } from './model'

export type PodologyData = { initial: Omit<Patient, typeof identityKeys[number]>; clinical: Clinical; evolutions: Evolution[] }
export function splitPodologyRecord(record: RecordDraft): ClinicalEnvelope<PodologyData> {
  const initial = Object.fromEntries(Object.entries(record.patient).filter(([key]) => !(identityKeys as readonly string[]).includes(key))) as PodologyData['initial']
  return { specialtyId: 'podologia', schemaVersion: 1, identity: patientIdentity(record.patient), data: structuredClone({ initial, clinical: record.clinical, evolutions: record.evolutions }) }
}
export function joinPodologyRecord(envelope: ClinicalEnvelope<PodologyData>): RecordDraft {
  if (envelope.specialtyId !== 'podologia' || envelope.schemaVersion !== 1) throw new Error('UNSUPPORTED_CLINICAL_SCHEMA')
  return { patient: { ...structuredClone(envelope.data.initial), ...patientIdentity(envelope.identity) }, clinical: structuredClone(envelope.data.clinical), evolutions: structuredClone(envelope.data.evolutions) }
}
