// @vitest-environment jsdom
import { cleanup, render as renderView, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthPage, SetupPage } from '../src/pages/Auth'

const auth = vi.hoisted(() => ({ signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(),signUp:vi.fn(),resend:vi.fn() }))
const render=(element:ReactElement)=>renderView(<MemoryRouter>{element}</MemoryRouter>)
vi.mock('../src/lib/supabase', () => ({ database: () => ({ auth }) }))
beforeEach(() => {
  vi.resetAllMocks()
  auth.signInWithPassword.mockResolvedValue({ error: null })
  auth.resetPasswordForEmail.mockResolvedValue({ error: null })
  auth.updateUser.mockResolvedValue({ error: null })
  auth.signUp.mockResolvedValue({data:{user:null,session:null},error:null})
  auth.resend.mockResolvedValue({error:null})
})
afterEach(cleanup)

describe('private login and password recovery', () => {
  it('authenticates through Supabase without a signup form', async () => {
    render(<AuthPage />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Correo electrónico'), 'profesional@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'a-secure-password')
    await user.click(screen.getByRole('button', { name: /Iniciar sesión/ }))
    await waitFor(() => expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'profesional@example.com', password: 'a-secure-password' }))
    expect(screen.queryByRole('button', { name: /registrarme/i })).toBeNull()
  })
  it('handles invalid credentials without exposing internal auth errors', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: 'Internal database details' } })
    render(<AuthPage />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Correo electrónico'), 'profesional@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'invalid-password')
    await user.click(screen.getByRole('button', { name: /Iniciar sesión/ }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('No pudimos iniciar sesión'))
    expect(screen.queryByText('Internal database details')).toBeNull()
  })
  it('requests a recovery link with the correct redirect and a non-enumerating message', async () => {
    render(<AuthPage />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }))
    await user.type(screen.getByLabelText('Correo electrónico'), 'profesional@example.com')
    await user.click(screen.getByRole('button', { name: /Enviar enlace/ }))
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('profesional@example.com', { redirectTo: `${window.location.origin}/recuperar` }))
    expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Si existe una cuenta'))
  })
  it('updates a recovered password only when confirmation matches', async () => {
    const onRecovered = vi.fn()
    render(<AuthPage recovery onRecovered={onRecovered} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Contraseña'), 'secure-new-password')
    await user.type(screen.getByLabelText('Repetí la contraseña'), 'another-password')
    await user.click(screen.getByRole('button', { name: /Guardar contraseña/ }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('coincidan'))
    expect(auth.updateUser).not.toHaveBeenCalled()
    await user.clear(screen.getByLabelText('Repetí la contraseña'))
    await user.type(screen.getByLabelText('Repetí la contraseña'), 'secure-new-password')
    await user.click(screen.getByRole('button', { name: /Guardar contraseña/ }))
    await waitFor(() => expect(onRecovered).toHaveBeenCalledOnce())
  })
  it('shows actionable setup instructions when database credentials are missing', () => {
    render(<SetupPage />)
    expect(screen.getByRole('heading', { name: 'Conectemos tu consultorio' })).toBeTruthy()
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeTruthy()
  })
  it('registers patients with DNI and optional phone but never assigns staff privileges',async()=>{
    render(<AuthPage register/>)
    const user=userEvent.setup()
    await user.type(screen.getByLabelText('Nombre y apellido'),'Paciente de prueba')
    await user.type(screen.getByLabelText('DNI'),'12.345.678')
    await user.type(screen.getByLabelText('Correo electrónico'),'paciente@example.com')
    await user.type(screen.getByLabelText('Contraseña'),'secure-patient-password')
    await user.type(screen.getByLabelText('Repetí la contraseña'),'secure-patient-password')
    await user.click(screen.getByRole('button',{name:/Crear mi cuenta/}))
    await waitFor(()=>expect(auth.signUp).toHaveBeenCalledOnce())
    expect(auth.signUp.mock.calls[0][0].options.data).toEqual({full_name:'Paciente de prueba',dni:'12345678',phone:''})
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(`${window.location.origin}/mis-turnos`)
    expect(await screen.findByRole('status')).toHaveProperty('textContent',expect.stringContaining('verificar la cuenta'))
  })
  it('can resend a pending email verification without revealing whether an account exists',async()=>{
    render(<AuthPage/>)
    const user=userEvent.setup()
    await user.click(screen.getByRole('button',{name:'No recibí el correo de verificación'}))
    await user.type(screen.getByLabelText('Correo electrónico'),'patient@example.com')
    await user.click(screen.getByRole('button',{name:/Enviar verificación/}))
    expect(auth.resend).toHaveBeenCalledWith({type:'signup',email:'patient@example.com',options:{emailRedirectTo:`${window.location.origin}/mis-turnos`}})
    expect(await screen.findByRole('status')).toHaveProperty('textContent',expect.stringContaining('Si la cuenta tiene una verificación pendiente'))
  })
})
