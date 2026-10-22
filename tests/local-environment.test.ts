import { describe, expect, it } from 'vitest'
import { assertLocalEnvironment, localEnvironment } from '../scripts/local-environment.mjs'

const status = { API_URL: 'http://127.0.0.1:54321', DB_URL: 'postgresql://postgres:local-password@127.0.0.1:54322/postgres', ANON_KEY: 'local-public-key', SERVICE_ROLE_KEY: 'local-server-key' }

describe('local test environment isolation', () => {
  it('builds all client and server aliases from the local stack without external mail credentials', () => {
    const env = localEnvironment(status)
    expect(env.VITE_SUPABASE_URL).toBe(status.API_URL)
    expect(env.SUPABASE_SECRET_KEY).toBe(status.SERVICE_ROLE_KEY)
    expect(env.POSTGRES_URL_NON_POOLING).toBe(status.DB_URL)
    expect(env.RESEND_API_KEY).toBe('')
    expect(env.VITE_APP_ENVIRONMENT).toBe('local')
    expect(() => assertLocalEnvironment(env)).not.toThrow()
  })
  it.each(['VITE_SUPABASE_URL', 'VITE_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'])('rejects a remote API even if other aliases remain local: %s', key => {
    expect(() => assertLocalEnvironment({ ...localEnvironment(status), [key]: 'https://production.supabase.co' })).toThrow('LOCAL_ENVIRONMENT_REMOTE_TARGET')
  })
  it.each(['POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL'])('rejects a remote database alias: %s', key => {
    expect(() => assertLocalEnvironment({ ...localEnvironment(status), [key]: 'postgresql://user:password@production.example:5432/postgres' })).toThrow('LOCAL_ENVIRONMENT_REMOTE_TARGET')
  })
  it('rejects another local database port and hostnames that merely contain localhost', () => {
    expect(() => localEnvironment({ ...status, DB_URL: status.DB_URL.replace('54322', '5432') })).toThrow('LOCAL_ENVIRONMENT_REMOTE_TARGET')
    expect(() => localEnvironment({ ...status, API_URL: 'http://localhost.example:54321' })).toThrow('LOCAL_ENVIRONMENT_REMOTE_TARGET')
  })
  it('blocks inherited real email delivery settings in the local mode', () => {
    expect(() => assertLocalEnvironment({ ...localEnvironment(status), RESEND_API_KEY: 'remote-secret' })).toThrow('LOCAL_EXTERNAL_DELIVERY_ENABLED')
  })
})
