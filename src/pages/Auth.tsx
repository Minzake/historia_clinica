import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { database } from '../lib/supabase'
import { Field, Notice, Form } from '../components/ui'
import { dniError,normalizeDni,validateClientProfile,validEmail } from '../lib/validation'
import { bookingReturn } from '../lib/booking-navigation'

export function AuthPage({ recovery = false, register = false, onRecovered }: { recovery?: boolean; register?: boolean; onRecovered?: () => void }) {
  const destination=bookingReturn(window.location.search)
  const authQuery=destination?`?${new URLSearchParams({volver:destination,consultorio:destination.split('?')[0].split('/')[2]||''})}`:''
  const [forgot, setForgot] = useState(false)
  const [verification,setVerification]=useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [fullName,setFullName]=useState(''),[dni,setDni]=useState(''),[phone,setPhone]=useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    try {
      if (!recovery && !validEmail(email.trim())) { setError('Ingresá un correo válido.'); return }
      if (recovery) {
        if (password.length < 12 || password !== confirmation) {
          setError('Usá al menos 12 caracteres y verificá que ambas contraseñas coincidan.'); return
        }
        const result = await database().auth.updateUser({ password })
        if (result.error) { setError('No se pudo cambiar la contraseña. El enlace puede haber vencido; solicitá uno nuevo.'); return }
        onRecovered?.()
      } else if(verification) {
        const result=await database().auth.resend({type:'signup',email:email.trim(),options:{emailRedirectTo:`${window.location.origin}/mis-turnos`}})
        if(result.error){setError('No se pudo enviar la verificación. Esperá unos minutos y revisá el correo ingresado.');return}
        setMessage('Si la cuenta tiene una verificación pendiente, recibirás el enlace en tu correo.')
      } else if (forgot) {
        const result = await database().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/recuperar` })
        if (result.error) { setError('No se pudo enviar la solicitud. Esperá unos minutos y volvé a intentar.'); return }
        setMessage('Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.')
      } else if(register) {
        if(password.length<12||password!==confirmation){setError('Usá al menos 12 caracteres y verificá que ambas contraseñas coincidan.');return}
        const normalizedDni=normalizeDni(dni)
        const validation=validateClientProfile(fullName,dni,phone)
        if(validation){setError(validation);return}
        const slug=new URLSearchParams(window.location.search).get('consultorio')||''
        const destination=/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)?{booking_slug:slug}:{}
        const result=await database().auth.signUp({email:email.trim(),password,options:{emailRedirectTo:`${window.location.origin}/mis-turnos`,data:{full_name:fullName.trim(),dni:normalizedDni,phone:phone.trim(),...destination}}})
        if(result.error){setError('No se pudo completar el registro. Revisá tus datos e intentá nuevamente más tarde. Si ya tenés cuenta, recuperá tu contraseña.');return}
        setPassword('');setConfirmation('');setMessage('Revisá tu correo para verificar la cuenta. Después podrás completar tus datos y reservar turnos. Si ya tenías una cuenta, usá la recuperación de contraseña.')
      } else {
        const result = await database().auth.signInWithPassword({ email: email.trim(), password })
        if (result.error) setError('No pudimos iniciar sesión. Revisá el correo y la contraseña, o intentá nuevamente más tarde.')
      }
    } catch { setError('No se pudo conectar. Revisá tu conexión a internet.') }
    finally { setBusy(false) }
  }

  return <main className="auth-layout">
    <section className="auth-intro"><div className="auth-brand"><span className="brand-mark"><img src="/logo.svg" alt="" /></span>Consultorio · Podología</div>
      <div><p className="eyebrow">TU CONSULTORIO, EN UN SOLO LUGAR</p><h1>Más tiempo para<br />cuidar cada paso.</h1><p>Pacientes, historias clínicas y seguimiento de tus consultas, organizados y siempre a mano.</p></div>
      <div className="auth-privacy"><ShieldCheck size={20} /><span>Turnos para pacientes · Gestión privada del consultorio.</span></div>
    </section>
    <section className="auth-form-area"><Form key={`${recovery}-${register}-${forgot}-${verification}`} className="auth-form" onSubmit={submit}>
      <span className="auth-lock"><LockKeyhole size={23} /></span><p className="eyebrow">BIENVENIDO/A</p>
      <h2>{recovery ? 'Nueva contraseña' : verification?'Verificá tu cuenta':forgot ? 'Recuperar acceso' : register ? 'Creá tu cuenta de paciente' : 'Ingresá a tu consultorio'}</h2>
      <p className="auth-description">{recovery ? 'Elegí una contraseña segura para tu cuenta.' : verification?'Reenviá el enlace de confirmación de tu email.':forgot ? 'Te enviaremos un enlace a tu correo.' : register ? 'Usá tu DNI y un email que puedas verificar. El celular es opcional.' : 'Ingresá con tu correo y contraseña. El acceso depende de los permisos de tu cuenta.'}</p>
      {register&&!forgot&&!verification&&!recovery&&<><Field label="Nombre y apellido" required minLength={2} value={fullName} onChange={setFullName} autoComplete="name" disabled={busy}/><Field label="DNI" hint="De 6 a 10 dígitos; podés usar puntos." validationMessage={dniError(dni,true)} required inputMode="numeric" maxLength={16} value={dni} onChange={setDni} disabled={busy}/><Field label="Celular (opcional)" type="tel" maxLength={40} value={phone} onChange={setPhone} autoComplete="tel" disabled={busy}/></>}
      {!recovery && <Field label="Correo electrónico" type="email" autoComplete="username" required value={email} onChange={setEmail} placeholder="nombre@consultorio.com" disabled={busy} />}
      {((!forgot&&!verification) || recovery) && <Field label="Contraseña" hint={recovery||register ? "De 12 a 128 caracteres. Podés pegar una contraseña de tu gestor." : undefined} type="password" autoComplete={recovery||register ? 'new-password' : 'current-password'} required minLength={recovery||register ? 12 : undefined} maxLength={128} value={password} onChange={setPassword} disabled={busy} />}
      {(recovery||(register&&!forgot&&!verification)) && <Field label="Repetí la contraseña" validationMessage={confirmation && password!==confirmation ? "Verificá que ambas contraseñas coincidan." : ""} type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={setConfirmation} disabled={busy} />}
      {error && <Notice>{error}</Notice>}{message && <Notice kind="success">{message}</Notice>}
      <button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? 'Procesando…' : recovery ? 'Guardar contraseña' : verification?'Enviar verificación':forgot ? 'Enviar enlace' : register ? 'Crear mi cuenta' : 'Iniciar sesión'}<ArrowRight size={17} /></button>
      {!recovery && <button className="text-button" type="button" disabled={busy} onClick={() => { setForgot(verification?false:!forgot);setVerification(false); setError(''); setMessage(''); setPassword('');setConfirmation('') }}>{(forgot||verification) && <ArrowLeft size={14} />}{forgot||verification ? 'Volver al inicio de sesión' : '¿Olvidaste tu contraseña?'}</button>}
      {!recovery&&!verification&&!forgot&&<button className="text-button" type="button" disabled={busy} onClick={()=>{setVerification(true);setError('');setMessage('');setPassword('');setConfirmation('')}}>No recibí el correo de verificación</button>}
      {!recovery&&<div className="auth-extra-links"><Link to={`${register?'/':'/registro'}${authQuery}`}>{register?'Ya tengo cuenta · Ingresar':'Soy paciente · Crear cuenta'}</Link><Link to={destination||'/reservar'}>{destination?'Volver al horario elegido':'Ver horarios y reservar'}</Link></div>}
      {recovery && <button className="text-button" type="button" disabled={busy} onClick={async () => { await database().auth.signOut({ scope: 'local' }); window.location.assign('/') }}>Cancelar y volver al login</button>}
      <p className="auth-footnote">Información clínica confidencial. Si usás un dispositivo compartido, cerrá la sesión al terminar.</p>
    </Form></section>
  </main>
}

export function SetupPage() {
  return <main className="setup-page"><span className="brand-mark"><img src="/logo.svg" alt="" /></span><p className="eyebrow">CONFIGURACIÓN INICIAL</p><h1>Conectemos tu consultorio</h1>
    <p>La aplicación está lista para conectarse a Supabase. No se habilita el acceso a pacientes hasta completar la configuración.</p>
    <ol><li>Creá un proyecto en Supabase y ejecutá la migración de <code>supabase/migrations/</code>.</li><li>Creá el usuario y asignalo al consultorio siguiendo el <code>README.md</code>.</li><li>Agregá <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> en Vercel y volvé a desplegar.</li></ol>
    <Notice kind="info">Usá únicamente la clave pública. Nunca una clave <code>service_role</code> ni <code>sb_secret_…</code> en el navegador.</Notice>
  </main>
}
