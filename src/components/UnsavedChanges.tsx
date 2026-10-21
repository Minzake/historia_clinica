import { useEffect } from 'react'
import { useBeforeUnload, useBlocker } from 'react-router-dom'
import { useClinic } from '../context'
import { Modal } from './ui'

export function UnsavedChanges({ dirty, saving = false }: { dirty: boolean; saving?: boolean }) {
  const { setUnsaved } = useClinic()
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    setUnsaved(dirty)
    return () => { setUnsaved(false) }
  }, [dirty, setUnsaved])
  useBeforeUnload((event) => { if (dirty) { event.preventDefault(); event.returnValue = '' } })
  return blocker.state === 'blocked' ? <Modal title="Hay cambios sin guardar" onClose={() => blocker.reset()}>
    <p>Si salís ahora, los cambios que no guardaste se perderán.</p>
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => blocker.reset()}>Seguir editando</button><button className="danger-button" type="button" disabled={saving} onClick={() => blocker.proceed()}>Salir sin guardar</button></div>
  </Modal> : null
}
