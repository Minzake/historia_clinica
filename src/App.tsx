import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createBrowserRouter, Link, NavLink, Navigate, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays,FileText, House, LogOut, Settings2, ShieldCheck,Users } from 'lucide-react'
import { supabase, database, errorMessage } from './lib/supabase'
import { getMembership } from './lib/api'
import { passwordSetupRequested } from './lib/auth-links'
import type { Membership } from './lib/model'
import { ClinicContext } from './context'
import { Loading, Notice } from './components/ui'
import { AuthPage, SetupPage } from './pages/Auth'
import { Dashboard } from './pages/Dashboard'
import { Patients } from './pages/Patients'
import { PatientEditor } from './pages/PatientEditor'
import { Settings } from './pages/Settings'
import { Agenda } from './pages/Agenda'
import { BookingSettings } from './pages/BookingSettings'
import { Team } from './pages/Team'
import { Booking } from './pages/Booking'
import { ClientPortal } from './pages/ClientPortal'
import './App.css'

const recoveryRequested = passwordSetupRequested(window.location.pathname, window.location.hash)

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [recovery, setRecovery] = useState(recoveryRequested)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const {pathname}=useLocation()
  useEffect(() => {
    if (!supabase) return
    let active = true
    let eventReceived = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, value) => {
      eventReceived = true
      if (!active) return
      setSession(value); setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') { setRecovery(false); navigate('/', { replace: true }) }
    })
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (!active || eventReceived) return
      if (authError) setError('No se pudo recuperar tu sesión. Volvé a iniciar sesión.')
      setSession(data.session); setLoading(false)
    }).catch(() => { if (active) { setError('No se pudo conectar al servicio de acceso.'); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [navigate])
  if (!supabase) return <SetupPage />
  if (loading) return <Loading label="Verificando sesión…" />
  if (session&&recovery) return <AuthPage recovery onRecovered={() => { setRecovery(false); navigate('/', { replace: true }) }} />
  if(session&&!session.user.email_confirmed_at)return <main className="setup-page"><h1>Verificá tu correo</h1><Notice kind="info">Abrí el enlace de verificación o invitación que recibiste antes de continuar.</Notice><button className="secondary-button" onClick={()=>database().auth.signOut({scope:'local'})}>Cerrar sesión</button></main>
  if(pathname==='/reservar'||pathname.startsWith('/reservar/'))return <Booking key={session?.user.id||'guest'} session={session} slug={pathname.split('/')[2]||''}/>
  if (!session) return <>{error && <Notice>{error}</Notice>}<AuthPage key={pathname==='/registro'?'register':'login'} register={pathname==='/registro'} /></>
  if(pathname==='/mis-turnos')return <ClientPortal key={session.user.id} session={session}/>
  return <Workspace key={session.user.id} session={session} />
}

function Workspace({ session }: { session: Session }) {
  const [membership, setMembership] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [signingOut, setSigningOut] = useState(false)
  const unsaved = useRef(false)
  const setUnsaved = useCallback((value: boolean) => { unsaved.current = value }, [])
  useEffect(() => {
    let active = true
    getMembership(session.user.id).then((value) => { if (active) setMembership(value) })
      .catch((err) => { if (active) setError(errorMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session.user.id, attempt])
  async function signOut() {
    if (unsaved.current && !window.confirm('Hay cambios sin guardar. ¿Querés cerrar sesión y descartarlos?')) return
    setSigningOut(true); setError('')
    try { const { error: err } = await database().auth.signOut({ scope: 'local' }); if (err) throw err }
    catch (err) { setError(errorMessage(err)); setSigningOut(false) }
  }
  if (loading) return <Loading label="Abriendo consultorio…" />
  if (!membership&&error) return <main className="setup-page"><h1>Tu acceso al consultorio</h1><Notice>{error}</Notice><div className="button-row"><button className="primary-button" onClick={() => { setLoading(true); setError(''); setAttempt(attempt + 1) }}>Reintentar</button><button className="secondary-button" disabled={signingOut} onClick={signOut}>Cerrar sesión</button></div></main>
  if(!membership)return <ClientPortal session={session}/>
  return <ClinicContext.Provider value={{ membership, setMembership, setUnsaved,userId:session.user.id }}>
    <div className="app-shell"><header className="topbar"><Link className="brand" to="/"><span className="brand-mark"><img src="/logo.svg" alt="" /></span><span>{membership.clinic.name || 'Consultorio de podología'}</span></Link>
      <div className="topbar-actions"><span className="privacy-label"><ShieldCheck size={15} />Acceso privado</span><span className="account-email" title={session.user.email}>{session.user.email}</span><button className="icon-button" type="button" disabled={signingOut} onClick={signOut}><LogOut size={16} /><span>{signingOut ? 'Saliendo…' : 'Salir'}</span></button></div>
    </header>
    <nav className="main-navigation" aria-label="Navegación principal"><NavLink to="/" end><House size={17} />Inicio</NavLink><NavLink to="/agenda"><CalendarDays size={17}/>Agenda</NavLink><NavLink to="/historias"><FileText size={17} />Historias clínicas</NavLink>{membership.role==='owner'&&<NavLink to="/equipo"><Users size={17}/>Usuarios</NavLink>}<NavLink to="/consultorio"><Settings2 size={17} />Consultorio</NavLink><span>GESTIÓN · CONSULTORIO</span></nav>
    <main className="workspace">{error && <Notice>{error}</Notice>}<Outlet /></main>
    <footer className="app-footer">Consultorio de podología · Información clínica confidencial</footer>
    </div>
  </ClinicContext.Provider>
}

function NotFound() {
  return <section className="empty-state"><h1>No encontramos esa página</h1><Link className="primary-button" to="/">Volver al inicio</Link></section>
}

function RouteError() {
  return <main className="setup-page"><h1>No se pudo mostrar esta pantalla</h1><p>Recargá la aplicación. Si estabas editando, los cambios no guardados pueden haberse perdido.</p><a className="primary-button" href="/">Volver al inicio</a></main>
}

const router = createBrowserRouter([{
  element: <App />, errorElement: <RouteError />,
  children: [
    { index: true, element: <Dashboard /> },
    { path: 'historias', element: <Patients /> },
    { path: 'historias/nueva', element: <PatientEditor key="new" /> },
    { path: 'historias/:patientId', element: <PatientEditor /> },
    { path: 'consultorio', element: <Settings /> },
    { path: 'agenda', element: <Agenda /> },
    { path: 'agenda/configuracion', element: <BookingSettings /> },
    { path: 'equipo', element: <Team /> },
    { path: 'reservar/:slug?', element: <></> },
    { path: 'mis-turnos', element: <></> },
    { path: 'registro', element: <Navigate to="/" replace/> },
    { path: 'recuperar', element: <Dashboard /> },
    { path: '*', element: <NotFound /> },
  ],
}])

export default function Root() { return <RouterProvider router={router} /> }
