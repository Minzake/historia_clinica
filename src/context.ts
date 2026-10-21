import { createContext, useContext } from 'react'
import type { Membership } from './lib/model'

export type WorkspaceContext = {
  membership: Membership; setMembership: (value: Membership) => void; setUnsaved: (value: boolean) => void; userId?:string
}
export const ClinicContext = createContext<WorkspaceContext | null>(null)
export function useClinic() {
  const value = useContext(ClinicContext)
  if (!value) throw new Error('Clinic context is missing')
  return value
}
