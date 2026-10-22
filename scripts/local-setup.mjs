import { execFileSync, spawn } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { applyMigration, applyIncrementalMigration } from './migrate-db.mjs'
import { localEnvironment } from './local-environment.mjs'

const project = 'historia-clinica-local'
const cli = process.platform === 'win32' ? 'supabase.exe' : 'supabase'
const root = fileURLToPath(new URL('../', import.meta.url))
const clinicId = '30000000-0000-4000-8000-000000000001'

function capture(command, args, timeout = 30000) {
  try { return execFileSync(command, args, { cwd: root, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch { throw new Error(`No se pudo ejecutar ${command} ${args[0]}. Revisá que Docker Desktop y Supabase CLI estén disponibles.`) }
}

async function startStack() {
  capture('docker', ['info', '--format', '{{.ServerVersion}}'])
  let network
  try { network = JSON.parse(execFileSync('docker', ['network', 'inspect', project], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0] }
  catch { capture('docker', ['network', 'create', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', project]) }
  if (network && network.Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1') throw new Error('La red local existente no está limitada a este equipo.')
  console.log('Iniciando Supabase local. La primera vez puede descargar imágenes de Docker.')
  await new Promise((resolveStart, reject) => {
    const child = spawn(cli, ['start', '--network-id', project, '--output', 'json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    // CLI status output includes local credentials; only report progress, never raw output.
    let diagnostic = ''
    child.stdout.resume()
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-5000) })
    const progress = setInterval(() => console.log('Preparando servicios locales de Supabase…'), 15000)
    child.on('error', () => { clearInterval(progress); reject(new Error('No se pudo iniciar Supabase CLI.')) })
    child.on('close', code => {
      clearInterval(progress)
      if (code) reject(new Error(`Supabase local no inició (${code}). Revisá Docker y los puertos 54321–54324.${/port.*already|already.*port/i.test(diagnostic) ? ' Hay un puerto ocupado.' : ''}`))
      else resolveStart()
    })
  })
}

async function prepare() {
  await startStack()
  const status = JSON.parse(capture(cli, ['status', '--output', 'json']))
  const env = localEnvironment(status)
  const db = new pg.Client({ connectionString: env.POSTGRES_URL, ssl: false, connectionTimeoutMillis: 10000 })
  await db.connect()
  try {
    const migrations = new URL('../supabase/migrations/', import.meta.url)
    for (const file of (await readdir(migrations)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
      const source = await readFile(new URL(file, migrations), 'utf8')
      const result = file.startsWith('202610210001_') ? await applyMigration(db, source) : await applyIncrementalMigration(db, file.replace(/\.sql$/, ''), source)
      console.log(`${file}: ${result.status}`)
    }
    await db.query('insert into public.clinics(id,settings) values($1,$2) on conflict(id) do nothing', [clinicId, JSON.stringify({ name: 'Consultorio local de pruebas', professional: 'Profesional de pruebas', address: '', phone: '', email: '', license: '' })])
    const hasMembers = (await db.query('select exists(select 1 from public.clinic_members where clinic_id=$1) as present', [clinicId])).rows[0].present
    if (!process.argv.includes('--no-demo-user') && !hasMembers) {
      const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (error) throw new Error('No se pudieron comprobar las cuentas locales.')
      let user = data.users.find(item => item.email === 'admin@consultorio.test')
      if (!user) {
        const created = await admin.auth.admin.createUser({ email: 'admin@consultorio.test', email_confirm: true })
        if (created.error || !created.data.user) throw new Error('No se pudo crear la cuenta de pruebas local.')
        user = created.data.user
      }
      await db.query("insert into public.clinic_members(clinic_id,user_id,role) values($1,$2,'owner') on conflict(clinic_id,user_id) do nothing", [clinicId, user.id])
      await db.query('begin')
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user.id])
        await db.query("select public.set_member_specialty_access($1,$2,'podologia',true,true,true,'all',true,'Profesional de pruebas','')", [clinicId, user.id])
        await db.query('commit')
      } catch (error) { await db.query('rollback'); throw error }
    }
  } finally { await db.end() }
  await writeFile(new URL('../.env.testing.local', import.meta.url), Object.entries(env).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 })
  console.log('Configuración local guardada en .env.testing.local (ignorado por Git).')
  console.log('Web: http://localhost:5173 · Studio: http://127.0.0.1:54323 · Correo local: http://127.0.0.1:54324')
  if (process.argv.includes('--serve')) {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--mode', 'testing', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' })
    child.on('close', code => { process.exitCode = code || 0 })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepare().catch(error => { console.error(`ENTORNO LOCAL: ${error.message}`); process.exitCode = 1 })
}
