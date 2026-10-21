import { createClient } from '@supabase/supabase-js'

// Support both the original names and those supplied by the Vercel integration.
const url = import.meta.env.VITE_SUPABASE_URL?.trim() || import.meta.env.VITE_PUBLIC_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  || import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  || import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY?.trim()

// Never put a service_role / secret key in a VITE_ variable: Vite exposes these to the browser.
const isPublicKey = key?.startsWith('sb_publishable_') || (() => {
  try { return JSON.parse(atob((key?.split('.')[1] || '').replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' } catch { return false }
})()

function configuredClient() {
  if (!url || !key || !isPublicKey) return null
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) return null
    return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  } catch { return null }
}

export const supabase = configuredClient()

export function database() {
  if (!supabase) throw new Error('Falta configurar la conexión a Supabase.')
  return supabase
}

export function errorMessage(error: unknown): string {
  const item = error as { code?: string; message?: string; status?: number }
  if (item?.code === '23505') return 'Ya existe un paciente con ese DNI o número de historia clínica en el consultorio.'
  if (item?.message?.includes('CONFLICT')) return 'Otra sesión modificó esta ficha. Volvé a abrirla antes de editar; tus cambios actuales aún no se guardaron.'
  if (item?.message?.includes('NO_MEMBERSHIP')) return 'Tu cuenta no tiene un consultorio asignado. Contactá al administrador.'
  if (item?.message?.includes('QUESTIONNAIRE_INVALID')) return 'Revisá los antecedentes y las vacunas: hay preguntas repetidas, faltantes o modificadas.'
  if (item?.message?.includes('INVALID_EMAIL')) return 'Ingresá un correo válido para el consultorio o dejalo vacío.'
  if (item?.code === '42501' || item?.status === 401 || item?.status === 403) return 'No tenés permiso para esta operación o tu sesión venció. Volvé a iniciar sesión.'
  if (item?.code === 'PGRST205' || item?.code === 'PGRST202' || item?.code === '42P01') return 'Falta instalar la base de datos. Ejecutá la migración de Supabase indicada en el README.'
  if (item?.message?.includes('Failed to fetch') || item?.message?.includes('fetch failed') || item?.message?.includes('NetworkError')) return 'No se pudo conectar. Revisá tu conexión a internet e intentá nuevamente.'
  if (['23514', '22007', '22008', '22023', '22P02', '23502'].includes(item?.code || '')) return 'Hay datos no válidos. Revisá las fechas, valores y longitudes de los campos.'
  return 'No se pudo completar la operación. Intentá nuevamente; si persiste, contactá al administrador.'
}
