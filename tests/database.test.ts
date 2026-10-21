import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { blankEvolution, blankRecord, today } from '../src/lib/model'
import type { RecordDraft, SavedRecord } from '../src/lib/model'
import { applyMigration } from '../scripts/migrate-db.mjs'

const owner = '10000000-0000-4000-8000-000000000001'
const professional = '10000000-0000-4000-8000-000000000002'
const other = '10000000-0000-4000-8000-000000000003'
const unassigned = '10000000-0000-4000-8000-000000000004'
const clinic = '20000000-0000-4000-8000-000000000001'
const otherClinic = '20000000-0000-4000-8000-000000000002'
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `)
  await db.exec(readFileSync(new URL('../supabase/migrations/202610210001_consultorio.sql', import.meta.url), 'utf8'))
  await db.exec(`
    insert into auth.users(id) values ('${owner}'),('${professional}'),('${other}'),('${unassigned}');
    insert into public.clinics(id) values ('${clinic}'),('${otherClinic}');
    insert into public.clinic_members(user_id,clinic_id,role) values
      ('${owner}','${clinic}','owner'),('${professional}','${clinic}','professional'),('${other}','${otherClinic}','owner');
  `)
}, 60000)
afterAll(async () => { await db?.close() })

async function asUser<T>(id: string, run: () => Promise<T>): Promise<T> {
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  try { return await run() } finally { await db.exec('reset role') }
}

function draft(dni = '') {
  const record = blankRecord()
  record.patient.fullName = 'Paciente de prueba'
  record.patient.dni = dni
  return record
}
async function save(record: RecordDraft, id: string | null = null, version = 0, clinicId = clinic) {
  const result = await db.query<{ record: SavedRecord }>('select public.save_patient_record($1,$2,$3,$4::jsonb) as record', [clinicId, id, version, JSON.stringify(record)])
  return result.rows[0].record
}

describe('Supabase PostgreSQL migration and access policies', () => {
  it('can verify an installed migration and record it without changing data', async () => {
    const source = readFileSync(new URL('../supabase/migrations/202610210001_consultorio.sql', import.meta.url), 'utf8')
    const client = { query: (sql: string, params?: unknown[]) => db.query(sql, params) }
    expect((await applyMigration(client, source)).status).toBe('already-installed')
    expect((await applyMigration(client, source)).status).toBe('already-installed')
    expect((await db.query('select * from private.app_migrations')).rows).toHaveLength(1)
  })
  it('denies anonymous reads and RPC execution', async () => {
    await db.exec('set role anon')
    try {
      await expect(db.query('select * from public.patients')).rejects.toMatchObject({ code: '42501' })
      await expect(save(draft())).rejects.toMatchObject({ code: '42501' })
    } finally { await db.exec('reset role') }
  })
  it('creates the patient, clinical record and version atomically with automatic numbering', async () => {
    await asUser(owner, async () => {
      const saved = await save(draft('12345678'))
      expect(saved.patient.historyNumber).toMatch(/^HC-\d{6}$/)
      expect(saved.version).toBe(1)
      expect(saved.patient.dni).toBe('12345678')
      expect(saved.patient.date).toBe(today())
      const versions = await db.query('select * from public.clinical_record_versions where patient_id = $1', [saved.id])
      expect(versions.rows).toHaveLength(1)
    })
  })
  it('permits a professional of the same clinic to read and save a patient', async () => {
    const saved = await asUser(owner, () => save(draft()))
    await asUser(professional, async () => {
      const read = await db.query<{ record: SavedRecord }>('select public.get_patient_record($1) as record', [saved.id])
      expect(read.rows[0].record.id).toBe(saved.id)
      const updated = await save({ ...saved, clinical: { ...saved.clinical, weight: '70,5' } }, saved.id, 1)
      expect(updated.version).toBe(2)
    })
  })
  it('denies unassigned accounts even when they know a clinic identifier', async () => {
    await asUser(unassigned, async () => {
      expect((await db.query('select * from public.patients')).rows).toEqual([])
      await expect(save(draft())).rejects.toMatchObject({ code: '42501' })
      await expect(db.query('insert into public.clinic_members(user_id,clinic_id,role) values ($1,$2,$3)', [unassigned, clinic, 'owner'])).rejects.toMatchObject({ code: '42501' })
    })
  })
  it('isolates patients, snapshots, evolutions and RPC calls between clinics', async () => {
    const record = draft()
    record.evolutions = [{ ...blankEvolution(), procedure: 'Consulta privada' }]
    const saved = await asUser(owner, () => save(record))
    await asUser(other, async () => {
      for (const table of ['patients', 'clinical_records', 'evolutions', 'clinical_record_versions']) {
        expect((await db.query(`select * from public.${table} where clinic_id = $1`, [clinic])).rows).toEqual([])
      }
      await expect(db.query('select public.get_patient_record($1)', [saved.id])).rejects.toMatchObject({ code: '42501' })
      await expect(save(record, saved.id, 1, otherClinic)).rejects.toMatchObject({ code: '42501' })
      await expect(save(record, null, 0, clinic)).rejects.toMatchObject({ code: '42501' })
      // An evolution UUID from another patient cannot be stolen by an otherwise valid insert.
      await expect(save(record, null, 0, otherClinic)).rejects.toMatchObject({ code: '42501' })
    })
  })
  it('prevents direct writes and editing or deleting the immutable version history', async () => {
    await asUser(owner, async () => {
      await expect(db.query("update public.patients set full_name = 'Alterado'")).rejects.toMatchObject({ code: '42501' })
      await expect(db.query('delete from public.clinical_record_versions')).rejects.toMatchObject({ code: '42501' })
      await expect(db.query("update public.clinical_record_versions set snapshot = '{}'::jsonb")).rejects.toMatchObject({ code: '42501' })
    })
  })
  it('rejects stale versions without overwriting the other session', async () => {
    const saved = await asUser(owner, () => save(draft()))
    await asUser(owner, async () => {
      const updated = await save({ ...saved, patient: { ...saved.patient, fullName: 'Nombre actualizado' } }, saved.id, 1)
      expect(updated.version).toBe(2)
      await expect(save(saved, saved.id, 1)).rejects.toMatchObject({ message: 'CONFLICT' })
      const current = await db.query<{ record: SavedRecord }>('select public.get_patient_record($1) as record', [saved.id])
      expect(current.rows[0].record.patient.fullName).toBe('Nombre actualizado')
      expect((await db.query('select version from public.clinical_record_versions where patient_id = $1', [saved.id])).rows).toHaveLength(2)
    })
  })
  it('preserves removed evolutions and their original snapshot', async () => {
    const record = draft()
    record.evolutions = [{ ...blankEvolution(), procedure: 'Procedimiento original' }]
    const saved = await asUser(owner, () => save(record))
    await asUser(owner, async () => {
      const updated = await save({ ...saved, evolutions: [] }, saved.id, saved.version)
      expect(updated.evolutions).toEqual([])
      const old = await db.query<{ snapshot: SavedRecord }>('select snapshot from public.clinical_record_versions where patient_id = $1 and version = 1', [saved.id])
      expect(old.rows[0].snapshot.evolutions[0].procedure).toBe('Procedimiento original')
      expect((await db.query('select archived_at from public.evolutions where patient_id = $1', [saved.id])).rows[0].archived_at).not.toBeNull()
    })
  })
  it('rolls back duplicate identifiers and malformed health values', async () => {
    await asUser(owner, async () => {
      const before = (await db.query('select * from public.patients')).rows.length
      await expect(save(draft('12345678'))).rejects.toMatchObject({ code: '23505' })
      const invalid = draft()
      invalid.clinical.weight = 'Infinity'
      await expect(save(invalid)).rejects.toMatchObject({ code: '22023' })
      invalid.clinical.weight = ''
      invalid.patient.date = '2026-02-31'
      await expect(save(invalid)).rejects.toMatchObject({ code: '22008' })
      expect((await db.query('select * from public.patients')).rows).toHaveLength(before)
    })
  })
  it('requires the owner role and the correct version to change clinic settings', async () => {
    const settings = { name: 'Podología', professional: '', address: '', phone: '', email: '', license: '' }
    await asUser(professional, async () => {
      await expect(db.query('select public.save_clinic_settings($1,1,$2::jsonb)', [clinic, JSON.stringify(settings)])).rejects.toMatchObject({ code: '42501' })
    })
    await asUser(owner, async () => {
      const result = await db.query<{ result: { version: number } }>('select public.save_clinic_settings($1,1,$2::jsonb) as result', [clinic, JSON.stringify(settings)])
      expect(result.rows[0].result.version).toBe(2)
      await expect(db.query('select public.save_clinic_settings($1,1,$2::jsonb)', [clinic, JSON.stringify(settings)])).rejects.toMatchObject({ message: 'CONFLICT' })
    })
  })
})
