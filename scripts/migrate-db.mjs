import { readFile, readdir } from 'node:fs/promises'
import { createHash, X509Certificate } from 'node:crypto'
import { rootCertificates } from 'node:tls'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = '202610210001_consultorio'
const tables = ['clinics', 'clinic_members', 'patients', 'clinical_records', 'evolutions', 'clinical_record_versions']
const functions = ['private.is_member(uuid)', 'public.get_patient_record(uuid)', 'public.save_patient_record(uuid,uuid,integer,jsonb)', 'public.save_clinic_settings(uuid,integer,jsonb)']
const caUrl = 'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt'
const caFingerprint = '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA'

async function trustedCertificate() {
  const response = await fetch(caUrl, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error('DATABASE_CA_DOWNLOAD_FAILED')
  const pem = await response.text()
  const certificate = new X509Certificate(pem)
  if (certificate.fingerprint256 !== caFingerprint || Date.parse(certificate.validTo) <= Date.now()) throw new Error('DATABASE_CA_INVALID')
  return pem
}

export function databaseTargets(env) {
  const targets = []
  const seen = new Set()
  for (const name of ['POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL']) {
    if (!env[name]?.trim()) continue
    const value = new URL(env[name].trim())
    if (!['postgres:', 'postgresql:'].includes(value.protocol)) throw new Error('INVALID_DATABASE_URL')
    // Use certificate validation, including host verification. Never disable TLS validation.
    value.searchParams.set('sslmode', 'verify-full')
    const candidates = []
    if (value.hostname.includes('pooler.') && value.port !== '5432') {
      const session = new URL(value)
      session.port = '5432'
      candidates.push(session)
    }
    candidates.push(value)
    for (const candidate of candidates) if (!seen.has(candidate.href)) {
      seen.add(candidate.href)
      targets.push({ source: name, connectionString: candidate.href })
    }
  }
  return targets
}

export function migrationBody(source) {
  // The migration owns a transaction when run manually; the runner owns it here.
  return source.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '')
}

export async function applyMigration(client, source) {
  const checksum = createHash('sha256').update(source).digest('hex')
  await client.query('begin')
  try {
    await client.query("select pg_advisory_xact_lock(hashtext('consultorio-initial-migration-v1'))")
    const existing = await client.query("select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])", [tables])
    if (existing.rows.length !== 0 && existing.rows.length !== tables.length) throw new Error('PARTIAL_SCHEMA')
    const created = existing.rows.length === 0
    if (created) await client.query(migrationBody(source))
    const secured = await client.query("select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[]) and rowsecurity", [tables])
    if (secured.rows.length !== tables.length) throw new Error('RLS_MISSING')
    for (const signature of functions) {
      const result = await client.query('select to_regprocedure($1) is not null as present', [signature])
      if (!result.rows[0]?.present) throw new Error('INCOMPLETE_FUNCTIONS')
    }
    for (const table of tables) {
      const access = await client.query("select has_table_privilege('authenticated', $1, 'INSERT') or has_table_privilege('authenticated', $1, 'UPDATE') or has_table_privilege('authenticated', $1, 'DELETE') as direct_writes", [`public.${table}`])
      if (access.rows[0]?.direct_writes) throw new Error('UNSAFE_DIRECT_WRITES')
    }
    await client.query('create table if not exists private.app_migrations(version text primary key, checksum text not null, applied_at timestamptz not null default now())')
    await client.query('revoke all on private.app_migrations from public, anon, authenticated')
    const previous = await client.query('select checksum from private.app_migrations where version = $1', [version])
    if (previous.rows[0] && previous.rows[0].checksum !== checksum) throw new Error('MIGRATION_CHECKSUM_CHANGED')
    await client.query('insert into private.app_migrations(version,checksum) values($1,$2) on conflict (version) do nothing', [version, checksum])
    await client.query("notify pgrst, 'reload schema'")
    await client.query('commit')
    return { migration: version, status: created ? 'applied' : 'already-installed', rowLevelSecurity: true }
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

export async function applyIncrementalMigration(client, migrationVersion, source) {
  const checksum = createHash('sha256').update(source).digest('hex')
  await client.query('begin')
  try {
    await client.query("select pg_advisory_xact_lock(hashtext('consultorio-schema-migrations-v1'))")
    const previous = await client.query('select checksum from private.app_migrations where version=$1', [migrationVersion])
    if (previous.rows[0]) {
      if (previous.rows[0].checksum !== checksum) throw new Error('MIGRATION_CHECKSUM_CHANGED')
      await client.query('commit')
      return { migration: migrationVersion, status: 'already-installed' }
    }
    await client.query(migrationBody(source))
    await client.query('insert into private.app_migrations(version,checksum) values($1,$2)', [migrationVersion, checksum])
    await client.query("notify pgrst, 'reload schema'")
    await client.query('commit')
    return { migration: migrationVersion, status: 'applied' }
  } catch (error) { await client.query('rollback'); throw error }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--if-requested') && process.env.INITIALIZE_CONSULTORIO_DB !== '1') return
  if (!args.includes('--apply') && !args.includes('--if-requested')) {
    console.error('DATABASE_MIGRATION: Usá --apply o INITIALIZE_CONSULTORIO_DB=1 durante una compilación autorizada.')
    process.exitCode = 1
    return
  }
  let client
  try {
    const { default: pg } = await import('pg')
    const targets = databaseTargets(process.env)
    if (!targets.length) throw new Error('MISSING_DATABASE_CONFIGURATION')
    const ca = await trustedCertificate()
    for (const target of targets) {
      const connection = new URL(target.connectionString)
      // pg's connection-string SSL options would overwrite the explicit trusted CA.
      for (const name of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) connection.searchParams.delete(name)
      const candidate = new pg.Client({ connectionString: connection.href, ssl: { rejectUnauthorized: true, ca: [...rootCertificates, ca] }, connectionTimeoutMillis: 10000, statement_timeout: 60000 })
      candidate.on('error', () => {})
      try { await candidate.connect(); client = candidate; break }
      catch (error) {
        // Report only non-sensitive classifications, never connection strings or raw errors.
        console.log(JSON.stringify({ databaseConnection: 'failed', source: target.source, code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'CONNECTION_ERROR' }))
        await candidate.end().catch(() => {})
      }
    }
    if (!client) throw new Error('DATABASE_UNREACHABLE')
    const source = await readFile(new URL('../supabase/migrations/202610210001_consultorio.sql', import.meta.url), 'utf8')
    console.log(JSON.stringify(await applyMigration(client, source)))
    const directory = new URL('../supabase/migrations/', import.meta.url)
    for (const file of (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name) && name !== `${version}.sql`).sort()) {
      console.log(JSON.stringify(await applyIncrementalMigration(client, file.replace(/\.sql$/, ''), await readFile(new URL(file, directory), 'utf8'))))
    }
  } catch (error) {
    const known = ['PARTIAL_SCHEMA', 'RLS_MISSING', 'INCOMPLETE_FUNCTIONS', 'UNSAFE_DIRECT_WRITES', 'MIGRATION_CHECKSUM_CHANGED', 'MISSING_DATABASE_CONFIGURATION', 'DATABASE_UNREACHABLE', 'INVALID_DATABASE_URL', 'DATABASE_CA_DOWNLOAD_FAILED', 'DATABASE_CA_INVALID']
    const reason = known.includes(error.message) ? error.message : /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'MIGRATION_FAILED'
    console.error(`DATABASE_MIGRATION: ${reason}. Se revirtió la transacción; no se borraron tablas ni datos.`)
    process.exitCode = 1
  } finally { await client?.end().catch(() => {}) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
