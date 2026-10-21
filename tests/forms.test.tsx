// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Field, Form, SelectField } from '../src/components/Form'
import { dniError } from '../src/lib/validation'

afterEach(cleanup)

function PatientForm({ save }: { save: () => void }) {
  const [name, setName] = useState(''), [dni, setDni] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState('')
  return <Form onSubmit={save}>
    <Field label="Nombre" required minLength={2} value={name} onChange={setName}/>
    <Field label="DNI" required validationMessage={dniError(dni, true)} hint="De 6 a 10 dígitos" value={dni} onChange={setDni}/>
    <Field label="Correo" type="email" required value={email} onChange={setEmail}/>
    <Field label="Celular" type="tel" value={phone} onChange={setPhone}/>
    <button type="submit">Guardar</button>
  </Form>
}

describe('accessible form correction', () => {
  it('prevents submission, identifies every missing field and focuses the first one', async () => {
    const save = vi.fn(), user = userEvent.setup()
    render(<PatientForm save={save}/>)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(save).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'))
    expect(screen.getByRole('alert').textContent).toContain('3 campos')
    const dni = screen.getByLabelText('DNI')
    expect(dni.getAttribute('aria-invalid')).toBe('true')
    expect(dni.getAttribute('aria-describedby')).toContain(`${dni.id}-error`)
    await user.click(screen.getByRole('button', { name: /^DNI:/ }))
    expect(document.activeElement).toBe(dni)
  })

  it('clears corrected errors while typing and accepts formatted DNI and phone numbers', async () => {
    const save = vi.fn(), user = userEvent.setup()
    render(<PatientForm save={save}/>)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await user.type(screen.getByLabelText('Nombre'), 'Ana Pérez')
    await user.type(screen.getByLabelText('DNI'), '12.345.678')
    await user.type(screen.getByLabelText('Correo'), 'ana@example.com')
    await user.type(screen.getByLabelText('Celular'), '+54 (11) 5555-1234')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getByLabelText('DNI').hasAttribute('aria-invalid')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(save).toHaveBeenCalledOnce()
  })

  it('shows errors on blur and rejects letters in a phone number and invalid emails', async () => {
    const save = vi.fn(), user = userEvent.setup()
    render(<PatientForm save={save}/>)
    await user.type(screen.getByLabelText('Correo'), 'ana@correo')
    await user.tab()
    expect(screen.getByLabelText('Correo').getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.type(screen.getByLabelText('Celular'), 'llamar mañana')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert').textContent).toContain('teléfono de 6 a 20 dígitos')
    expect(save).not.toHaveBeenCalled()
  })

  it('validates native selections, minimum values and duration increments', async () => {
    const save = vi.fn(), user = userEvent.setup()
    function Appointment() {
      const [duration, setDuration] = useState('16')
      return <Form onSubmit={save}><SelectField label="Profesional" required defaultValue=""><option value="">Elegir</option><option value="ana">Ana</option></SelectField><Field label="Duración" type="number" min={15} max={480} step={15} required value={duration} onChange={setDuration}/><button>Guardar</button></Form>
    }
    render(<Appointment/>)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Profesional'))
    expect(screen.getByLabelText('Profesional').getAttribute('aria-invalid')).toBe('true')
    await user.selectOptions(screen.getByLabelText('Profesional'), 'ana')
    await user.clear(screen.getByLabelText('Duración'))
    await user.type(screen.getByLabelText('Duración'), '0')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert').textContent).toContain('mínimo es 15')
    await user.clear(screen.getByLabelText('Duración'))
    await user.type(screen.getByLabelText('Duración'), '90')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(save).toHaveBeenCalledOnce()
  })

  it('updates password confirmation when the original password changes and preserves the value when revealed', async () => {
    const save = vi.fn(), user = userEvent.setup()
    function Passwords() {
      const [password, setPassword] = useState('long-password-one'), [confirmation, setConfirmation] = useState('long-password-two')
      return <Form onSubmit={save}><Field label="Contraseña" type="password" minLength={12} required value={password} onChange={setPassword}/><Field label="Confirmación" type="password" required value={confirmation} onChange={setConfirmation} validationMessage={password !== confirmation ? 'Las contraseñas deben coincidir.' : ''}/><button>Guardar</button></Form>
    }
    render(<Passwords/>)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Confirmación'))
    await user.click(screen.getByRole('button', { name: 'Mostrar contraseña', exact: true }))
    expect(screen.getByLabelText('Contraseña').getAttribute('type')).toBe('text')
    expect(screen.getByLabelText('Contraseña')).toHaveProperty('value', 'long-password-one')
    await user.clear(screen.getByLabelText('Contraseña'))
    await user.type(screen.getByLabelText('Contraseña'), 'long-password-two')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(save).toHaveBeenCalledOnce()
  })

  it('removes obsolete errors when an invalid optional row is deleted', async () => {
    const save = vi.fn(), user = userEvent.setup()
    function Rows() {
      const [row, setRow] = useState(true)
      return <Form onSubmit={save}>{row && <Field label="Consulta" required value="" readOnly={false}/>}<button type="button" onClick={() => setRow(false)}>Quitar consulta</button><button>Guardar</button></Form>
    }
    render(<Rows/>)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Quitar consulta' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(save).toHaveBeenCalledOnce()
  })
})
