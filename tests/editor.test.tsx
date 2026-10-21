// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClinicContext } from '../src/context'
import { PatientEditor } from '../src/pages/PatientEditor'
import { blankClinic, blankRecord } from '../src/lib/model'
import type { SavedRecord } from '../src/lib/model'

const api = vi.hoisted(() => ({ getRecord: vi.fn(), saveRecord: vi.fn(), listRevisions: vi.fn(), getRevision: vi.fn() }))
const pdf = vi.hoisted(() => ({ downloadPdf: vi.fn() }))
vi.mock('../src/lib/api', () => api)
vi.mock('../src/lib/pdf', () => pdf)

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})

function savedRecord(): SavedRecord {
  const value = blankRecord()
  value.patient.fullName = 'María Paciente'
  value.patient.historyNumber = 'HC-000001'
  return { ...value, id: '30000000-0000-4000-8000-000000000001', version: 1, updatedAt: new Date().toISOString() }
}

function openEditor(path = '/historias/30000000-0000-4000-8000-000000000001') {
  const router = createMemoryRouter([{
    element: <ClinicContext.Provider value={{ membership: { clinicId: 'clinic', role: 'owner', clinic: blankClinic(), version: 1 }, setMembership: vi.fn(), setUnsaved: vi.fn() }}><Outlet /></ClinicContext.Provider>,
    children: [{ path: '/historias/nueva', element: <PatientEditor /> }, { path: '/historias/:patientId', element: <PatientEditor /> }, { path: '/historias', element: <h1>Listado de pacientes</h1> }],
  }], { initialEntries: [path] })
  return { ...render(<RouterProvider router={router} />), router }
}

beforeEach(() => {
  vi.resetAllMocks()
  api.getRecord.mockImplementation(async () => savedRecord())
  api.saveRecord.mockImplementation(async (_clinic, record, id, version) => ({ ...structuredClone(record), id: id || savedRecord().id, version: version + 1, updatedAt: new Date().toISOString() }))
  api.listRevisions.mockResolvedValue([])
  pdf.downloadPdf.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('saved initial sheets and evolutions', () => {
  it('opens a saved initial sheet and keeps edits while switching sheets', async () => {
    openEditor()
    const user = userEvent.setup()
    const input = await screen.findByLabelText('Apellido y nombre *')
    expect(input).toHaveProperty('value', 'María Paciente')
    await user.type(screen.getByLabelText('Domicilio'), 'Dirección de prueba')
    await user.click(screen.getByRole('button', { name: 'Evoluciones: valores y consultas' }))
    await user.click(screen.getByRole('button', { name: 'Agregar consulta' }))
    await user.type(screen.getByLabelText('Procedimiento / evaluación'), 'Control podológico')
    await user.click(screen.getByRole('button', { name: 'Ficha inicial: datos y antecedentes' }))
    expect(screen.getByLabelText('Domicilio')).toHaveProperty('value', 'Dirección de prueba')
    await user.click(screen.getByRole('button', { name: 'Guardar historia' }))
    await waitFor(() => expect(api.saveRecord).toHaveBeenCalledOnce())
    expect(api.saveRecord.mock.calls[0][2]).toBe(savedRecord().id)
    expect(api.saveRecord.mock.calls[0][3]).toBe(1)
    expect(api.saveRecord.mock.calls[0][1].evolutions[0].procedure).toBe('Control podológico')
    expect(await screen.findByText('Historia clínica guardada correctamente.')).toBeTruthy()
  })
  it('blocks accidental navigation until unsaved changes are explicitly discarded', async () => {
    openEditor()
    const user = userEvent.setup()
    await screen.findByLabelText('Apellido y nombre *')
    await user.type(screen.getByLabelText('Domicilio'), 'Cambios sin guardar')
    await user.click(screen.getByRole('link', { name: 'Historias clínicas' }))
    expect(await screen.findByRole('dialog', { name: 'Hay cambios sin guardar' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(screen.getByLabelText('Domicilio')).toHaveProperty('value', 'Cambios sin guardar')
    await user.click(screen.getByRole('link', { name: 'Historias clínicas' }))
    await user.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    expect(await screen.findByRole('heading', { name: 'Listado de pacientes' })).toBeTruthy()
  })
  it('exports saved data and disables exports as soon as the record becomes dirty', async () => {
    openEditor()
    const user = userEvent.setup()
    await screen.findByLabelText('Apellido y nombre *')
    const download = screen.getByRole('button', { name: 'Descargar PDF' })
    expect(download).toHaveProperty('disabled', false)
    await user.selectOptions(screen.getByLabelText('Contenido del PDF'), 'initial')
    await user.click(download)
    await waitFor(() => expect(pdf.downloadPdf).toHaveBeenCalledOnce())
    expect(pdf.downloadPdf.mock.calls[0][2]).toBe('initial')
    await user.type(screen.getByLabelText('Domicilio'), 'Otro domicilio')
    expect(download).toHaveProperty('disabled', true)
  })
  it('requires a name before creating a new initial sheet', async () => {
    openEditor('/historias/nueva')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar historia' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Completá el apellido y nombre'))
    expect(api.saveRecord).not.toHaveBeenCalled()
  })
  it('does not claim a successful save on a network failure and preserves the draft', async () => {
    api.saveRecord.mockRejectedValue(new Error('Failed to fetch'))
    openEditor()
    const user = userEvent.setup()
    await screen.findByLabelText('Apellido y nombre *')
    await user.type(screen.getByLabelText('Domicilio'), 'Conservar este dato')
    await user.click(screen.getByRole('button', { name: 'Guardar historia' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Revisá tu conexión'))
    expect(screen.getByLabelText('Domicilio')).toHaveProperty('value', 'Conservar este dato')
    expect(screen.getByText('Cambios sin guardar')).toBeTruthy()
  })
})
