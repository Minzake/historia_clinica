import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('@supabase/supabase-js', () => sdk)

const variableNames = [
  'VITE_SUPABASE_URL', 'VITE_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY', 'VITE_PUBLIC_SUPABASE_ANON_KEY',
]
const url = 'https://example.supabase.co'
const publicKey = 'sb_publishable_test_only'
const jwt = (role: string) => `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ role }))}.test`

beforeEach(() => {
  vi.resetModules()
  sdk.createClient.mockReset().mockReturnValue({ testClient: true })
  // Do not use the developer's real .env.local values in these tests.
  for (const name of variableNames) vi.stubEnv(name, '')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('Supabase environment compatibility', () => {
  it('accepts the VITE_PUBLIC variables provided by the Vercel integration', async () => {
    vi.stubEnv('VITE_PUBLIC_SUPABASE_URL', url)
    vi.stubEnv('VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publicKey)
    const { supabase } = await import('../src/lib/supabase')
    expect(supabase).not.toBeNull()
    expect(sdk.createClient).toHaveBeenCalledWith(url, publicKey, expect.any(Object))
  })
  it('keeps compatibility with the original variable names', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', url)
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', publicKey)
    await import('../src/lib/supabase')
    expect(sdk.createClient).toHaveBeenCalledWith(url, publicKey, expect.any(Object))
  })
  it('prefers a publishable key over a legacy anon key', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', url)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', jwt('anon'))
    vi.stubEnv('VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publicKey)
    await import('../src/lib/supabase')
    expect(sdk.createClient).toHaveBeenCalledWith(url, publicKey, expect.any(Object))
  })
  it('supports both names for legacy anon JWT keys', async () => {
    vi.stubEnv('VITE_PUBLIC_SUPABASE_URL', url)
    vi.stubEnv('VITE_PUBLIC_SUPABASE_ANON_KEY', jwt('anon'))
    await import('../src/lib/supabase')
    expect(sdk.createClient).toHaveBeenCalledWith(url, jwt('anon'), expect.any(Object))
    vi.resetModules()
    sdk.createClient.mockClear()
    vi.stubEnv('VITE_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', jwt('anon'))
    await import('../src/lib/supabase')
    expect(sdk.createClient).toHaveBeenCalledWith(url, jwt('anon'), expect.any(Object))
  })
  it('ignores empty aliases and trims the configured values', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '   ')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '   ')
    vi.stubEnv('VITE_PUBLIC_SUPABASE_URL', ` ${url} `)
    vi.stubEnv('VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ` ${publicKey} `)
    await import('../src/lib/supabase')
    expect(sdk.createClient).toHaveBeenCalledWith(url, publicKey, expect.any(Object))
  })
  it('gives the original aliases priority when both are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', url)
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', publicKey)
    vi.stubEnv('VITE_PUBLIC_SUPABASE_URL', 'https://other.supabase.co')
    vi.stubEnv('VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_other')
    await import('../src/lib/supabase')
    expect(sdk.createClient).toHaveBeenCalledWith(url, publicKey, expect.any(Object))
  })
  it.each(['sb_secret_test_only', jwt('service_role')])('rejects an administrative key through the new aliases', async (secret) => {
    vi.stubEnv('VITE_PUBLIC_SUPABASE_URL', url)
    vi.stubEnv('VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY', secret)
    const { supabase } = await import('../src/lib/supabase')
    expect(supabase).toBeNull()
    expect(sdk.createClient).not.toHaveBeenCalled()
  })
  it('does not fall back to private server credentials', async () => {
    vi.stubEnv('SUPABASE_URL', url)
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test_only')
    const { supabase } = await import('../src/lib/supabase')
    expect(supabase).toBeNull()
    expect(sdk.createClient).not.toHaveBeenCalled()
  })
})
