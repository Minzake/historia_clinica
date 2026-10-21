import { describe, expect, it, vi } from 'vitest'
import { applyMigration, databaseTargets, migrationBody } from '../scripts/migrate-db.mjs'

describe('safe initial database migration', () => {
  it('uses verified TLS, tries the pooler session port and avoids duplicate targets', () => {
    const url = 'postgresql://user:fake-password@aws-0.example.pooler.supabase.com:6543/postgres?sslmode=require'
    const targets = databaseTargets({ POSTGRES_URL: url, POSTGRES_PRISMA_URL: url })
    expect(targets).toHaveLength(2)
    expect(new URL(targets[0].connectionString).port).toBe('5432')
    expect(new URL(targets[1].connectionString).port).toBe('6543')
    expect(targets.every((target: { connectionString: string }) => new URL(target.connectionString).searchParams.get('sslmode') === 'verify-full')).toBe(true)
  })
  it('only removes the migration transaction wrapper, not PL/pgSQL bodies', () => {
    const sql = '-- migration\nbegin;\ncreate function test() returns void as $$\nbegin\n  perform 1;\nend;\n$$ language plpgsql;\ncommit;\n'
    const body = migrationBody(sql)
    expect(body).not.toMatch(/^begin;/m)
    expect(body).not.toContain('commit;')
    expect(body).toContain('begin\n  perform 1;\nend;')
  })
  it('rolls back and does not apply DDL when a partial schema already exists', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('from pg_tables') ? [{ tablename: 'clinics' }] : [] }))
    await expect(applyMigration({ query }, 'begin;\ncreate table should_not_run(id uuid);\ncommit;')).rejects.toThrow('PARTIAL_SCHEMA')
    expect(query).toHaveBeenLastCalledWith('rollback')
    expect(query.mock.calls.some(([sql]) => sql.includes('create table should_not_run'))).toBe(false)
  })
})
