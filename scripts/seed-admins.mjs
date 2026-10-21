import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const schema = {
  clinics: 'id,settings,version,next_history_number',
  clinic_members: 'user_id,clinic_id,role,active',
  patients: 'id,clinic_id,full_name,full_name_search,dni,history_number,details,version,updated_at',
  clinical_records: 'patient_id,clinic_id,antecedents,vaccines,clinical_values',
  evolutions: 'id,patient_id,clinic_id,date,procedure,position,archived_at',
  clinical_record_versions: 'id,patient_id,clinic_id,version,snapshot,recorded_by,recorded_at',
  patient_accounts:'user_id,full_name,dni,phone',
  clinic_client_accounts:'clinic_id,user_id',
  booking_settings:'clinic_id,slug,enabled,provider_id,version',
  booking_hours:'clinic_id,weekday,opens,closes',
  appointments:'id,clinic_id,provider_id,client_user_id,starts_at,ends_at,status,version',
}

export class SetupError extends Error {
  constructor(code, message) { super(message); this.name = 'SetupError'; this.code = code }
}

export function parseOptions(args) {
  const options = { apply: false, invite: false, emails: [], redirectTo: '', clinicId: '' }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--apply') options.apply = true
    else if (flag === '--check') options.apply = false
    else if (flag === '--invite') options.invite = true
    else if (['--emails', '--redirect-url', '--clinic-id'].includes(flag)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new SetupError('ARGUMENTS', `Falta el valor de ${flag}.`)
      if (flag === '--emails') options.emails = value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
      if (flag === '--redirect-url') options.redirectTo = value
      if (flag === '--clinic-id') options.clinicId = value
    } else throw new SetupError('ARGUMENTS', 'Opción no reconocida. Usá --emails, --check, --apply, --invite, --redirect-url o --clinic-id.')
  }
  options.emails = [...new Set(options.emails)]
  if (!options.emails.length || options.emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new SetupError('EMAILS', 'Indicá los correos de los administradores con --emails "correo1,correo2".')
  }
  if (options.clinicId && !/^[0-9a-f-]{36}$/i.test(options.clinicId)) throw new SetupError('CLINIC_ID', 'El identificador de consultorio debe ser un UUID.')
  if (options.invite) {
    let redirect
    try { redirect = new URL(options.redirectTo) } catch { throw new SetupError('REDIRECT', 'Para invitar cuentas indicá --redirect-url https://tu-dominio/recuperar.') }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname)
    if ((redirect.protocol !== 'https:' && !(local && redirect.protocol === 'http:')) || redirect.pathname !== '/recuperar'
      || redirect.username || redirect.password || redirect.search || redirect.hash) {
      throw new SetupError('REDIRECT', 'La invitación requiere una URL HTTPS terminada en /recuperar (HTTP solo en localhost), sin credenciales ni parámetros.')
    }
  }
  return options
}

function failed(result, code, message) {
  if (result.error) throw new SetupError(code, message)
  return result.data
}

async function checkSchema(client) {
  for (const [table, columns] of Object.entries(schema)) {
    // Use GET + LIMIT 0: some gateways answer HEAD without validating the relation.
    // No patient rows are retrieved.
    failed(await client.from(table).select(columns).limit(0), 'SCHEMA',
      `Falta la tabla o estructura de ${table}. Aplicá primero la migración de supabase/migrations/. No se modificaron tablas.`)
  }
  // Clinical RPCs grant EXECUTE to authenticated users, not administrative API keys.
  // Their behavior must be verified after signing in; an admin REST probe is inconclusive.
}

async function findUsers(client, emails) {
  const found = new Map()
  for (let page = 1; page <= 1000; page += 1) {
    const data = failed(await client.auth.admin.listUsers({ page, perPage: 100 }), 'AUTH_READ', 'No se pudieron consultar las cuentas de Supabase Auth. Revisá la clave administrativa del servidor.')
    for (const user of data.users) if (emails.includes(user.email?.toLowerCase())) found.set(user.email.toLowerCase(), user)
    if (data.users.length < 100 || found.size === emails.length) return found
  }
  throw new SetupError('AUTH_LIMIT', 'No se pudo terminar de recorrer las cuentas. No se cambió ninguna asignación.')
}

function deterministicClinicId(projectUrl, emails) {
  const bytes = createHash('sha256').update(`consultorio-initial-seed-v1|${projectUrl}|${[...emails].sort().join(',')}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function seedAdmins(client, options, projectUrl) {
  await checkSchema(client)
  const users = await findUsers(client, options.emails)
  const missing = options.emails.filter((email) => !users.has(email))
  const ids = [...users.values()].map((user) => user.id)
  const memberships = ids.length ? failed(await client.from('clinic_members').select('user_id,clinic_id,role,active').in('user_id', ids), 'MEMBERSHIPS', 'No se pudieron comprobar las asignaciones existentes.') : []
  const assignedClinics = [...new Set(memberships.map((member) => member.clinic_id))]
  if (!options.apply) return {
    mode: 'check', schema: 'ready', ready: missing.length === 0 && assignedClinics.length === 1 && memberships.every((member) => member.role === 'owner'&&member.active!==false)
      && options.emails.every((email) => users.get(email)?.email_confirmed_at) && memberships.length === users.size,
    accounts: options.emails.map((email) => ({ email, exists: users.has(email), confirmed: Boolean(users.get(email)?.email_confirmed_at), role: memberships.find((member) => member.user_id === users.get(email)?.id)?.role || null,active:memberships.find((member)=>member.user_id===users.get(email)?.id)?.active??null })),
  }
  if (missing.length && !options.invite) throw new SetupError('MISSING_AUTH_USERS',
    `No existen en Supabase Auth: ${missing.join(', ')}. No se crearon cuentas ni se cambiaron contraseñas. Crealas desde Authentication o ejecutá con --invite y --redirect-url después de confirmar el envío.`)

  // Check existing assignments before sending invitations or creating anything.
  if(memberships.some((member)=>member.active===false))throw new SetupError('INACTIVE_MEMBERSHIP','Una cuenta tiene el acceso suspendido. El seeder no lo reactiva; revisalo desde Usuarios con otra cuenta administradora.')
  if (assignedClinics.length > 1 || (options.clinicId && assignedClinics.some((id) => id !== options.clinicId))) {
    throw new SetupError('CLINIC_CONFLICT', 'Las cuentas están asignadas a consultorios diferentes. No se movieron cuentas ni se enviaron invitaciones.')
  }
  let clinicId = options.clinicId || assignedClinics[0]
  let createClinic = false
  if (clinicId) {
    const clinic = failed(await client.from('clinics').select('id').eq('id', clinicId).maybeSingle(), 'CLINIC_READ', 'No se pudo comprobar el consultorio asignado.')
    if (!clinic) throw new SetupError('CLINIC_MISSING', 'El consultorio indicado no existe.')
  } else {
    const clinics = failed(await client.from('clinics').select('id').limit(2), 'CLINIC_READ', 'No se pudieron consultar los consultorios existentes.')
    if (clinics.length > 1) throw new SetupError('CLINIC_AMBIGUOUS', 'Hay varios consultorios y ninguna asignación para estas cuentas. Indicá --clinic-id; no se eligió uno automáticamente.')
    clinicId = clinics[0]?.id || deterministicClinicId(projectUrl, options.emails)
    createClinic = clinics.length === 0
  }

  for (const email of missing) {
    const data = failed(await client.auth.admin.inviteUserByEmail(email, { redirectTo: options.redirectTo }), 'INVITE_FAILED',
      `No se pudo invitar a ${email}. Revisá SMTP, los límites de correo y la URL permitida en Supabase. Si una invitación anterior se envió, su cuenta se conservará y podés reintentar sin duplicarla.`)
    if (!data.user) throw new SetupError('INVITE_FAILED', 'Supabase no devolvió la cuenta invitada. Reintentá la comprobación antes de continuar.')
    users.set(email, data.user)
  }
  if (createClinic) {
    const result = await client.from('clinics').insert({ id: clinicId, settings: { name: 'Consultorio de podología', professional: '', address: '', phone: '', email: '', license: '' } })
    if (result.error?.code !== '23505') failed(result, 'CLINIC_CREATE', 'No se pudo crear el consultorio. Las cuentas existentes no fueron modificadas.')
    // A concurrent run with the same deterministic ID may have created it already.
    const clinic = failed(await client.from('clinics').select('id').eq('id', clinicId).maybeSingle(), 'CLINIC_READ', 'No se pudo verificar el consultorio creado.')
    if (!clinic) throw new SetupError('CLINIC_CREATE', 'No se encontró el consultorio luego de intentar crearlo.')
  }
  const newMemberships = [...users.values()].filter((user) => !memberships.some((member) => member.user_id === user.id))
    .map((user) => ({ user_id: user.id, clinic_id: clinicId, role: 'owner' }))
  // Insert, never upsert: a concurrent assignment must not move a user to another clinic.
  if (newMemberships.length) failed(await client.from('clinic_members').insert(newMemberships), 'MEMBERSHIP_INSERT',
    'No se pudieron completar las asignaciones. No se sobrescribió ninguna membresía existente; volvé a comprobar el estado antes de reintentar.')
  for (const member of memberships.filter((member) => member.role !== 'owner')) {
    const updated = failed(await client.from('clinic_members').update({ role: 'owner' }).eq('user_id', member.user_id).eq('clinic_id', clinicId).select('user_id'),
      'MEMBERSHIP_UPDATE', 'No se pudo completar el permiso de administrador. No se movió la cuenta de consultorio.')
    if (updated.length !== 1) throw new SetupError('MEMBERSHIP_CONFLICT', 'La asignación cambió durante la ejecución. Comprobá el estado antes de reintentar.')
  }
  return {
    mode: 'apply', schema: 'ready', clinicId, createdClinic: createClinic,
    accounts: options.emails.map((email) => ({ email, role: 'owner', invitedNow: missing.includes(email), confirmed: Boolean(users.get(email)?.email_confirmed_at) })),
    passwordsChanged: false,
  }
}

async function main() {
  try {
    let args = process.argv.slice(2)
    if (args.includes('--if-requested')) {
      if (process.env.INITIALIZE_CONSULTORIO_ADMINS !== '1') return
      args = ['--apply', '--emails', process.env.SEED_ADMIN_EMAILS || '']
      if (process.env.SEED_SEND_INVITES === '1') args.push('--invite', '--redirect-url', process.env.SEED_INVITE_REDIRECT_URL || '')
    }
    const options = parseOptions(args)
    if (options.apply && options.invite) {
      let available = false
      try {
        const response = await fetch(options.redirectTo, { signal: AbortSignal.timeout(15000) })
        available = response.ok && new URL(response.url).origin === new URL(options.redirectTo).origin
      } catch { /* Do not send account links to an unavailable deployment. */ }
      if (!available) throw new SetupError('REDIRECT_NOT_READY', 'La pantalla /recuperar no está disponible en el dominio indicado. Desplegá primero la versión nueva en Vercel y habilitá esa URL en Supabase Auth. No se enviaron invitaciones.')
    }
    const url = process.env.VITE_SUPABASE_URL?.trim() || process.env.VITE_PUBLIC_SUPABASE_URL?.trim()
    const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !key) throw new SetupError('CONFIG', 'Faltan la URL del proyecto y SUPABASE_SECRET_KEY o SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor. Nunca uses prefijo VITE_ para la clave administrativa.')
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (request, init) => fetch(request, { ...init, signal: AbortSignal.timeout(20000) }) },
    })
    const result = await seedAdmins(client, options, url)
    console.log(JSON.stringify(result, null, 2))
    if (options.apply) console.log('Las cuentas comparten el consultorio. No se cambiaron contraseñas ni se crearon historias clínicas.')
  } catch (error) {
    // Never print raw SDK errors, environment values, connection strings or auth tokens.
    console.error(error instanceof SetupError ? `${error.code}: ${error.message}` : 'SETUP_FAILED: No se pudo completar la configuración. Revisá la conexión y las variables del servidor.')
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
