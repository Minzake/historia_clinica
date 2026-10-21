import { describe, expect, it } from 'vitest'
import { passwordSetupRequested } from '../src/lib/auth-links'

describe('invitation and recovery callbacks', () => {
  it('opens password setup for both invitation and recovery links, including Site URL fallback', () => {
    expect(passwordSetupRequested('/', '#type=invite&access_token=fake')).toBe(true)
    expect(passwordSetupRequested('/', '#type=recovery&access_token=fake')).toBe(true)
    expect(passwordSetupRequested('/recuperar', '')).toBe(true)
  })
  it('does not request a new password for normal authenticated navigation', () => {
    expect(passwordSetupRequested('/', '')).toBe(false)
    expect(passwordSetupRequested('/historias', '#type=signup')).toBe(false)
  })
})
