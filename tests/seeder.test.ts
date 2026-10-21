import { describe, expect, it } from 'vitest'
import { parseOptions, seedAdmins } from '../scripts/seed-admins.mjs'

const emails = ['admin@example.com', 'duena@example.com']
const users = emails.map((email, index) => ({ id: `user-${index}`, email, email_confirmed_at: '2026-10-21T00:00:00Z' }))
const options = { apply: true, invite: false, emails, clinicId: '', redirectTo: '' }

function backend(initial: { users?: typeof users; clinics?: Record<string, unknown>[]; memberships?: Record<string, unknown>[] } = {}) {
  const state = {
    users: structuredClone(initial.users ?? users),
    clinics: structuredClone(initial.clinics ?? []),
    clinic_members: structuredClone(initial.memberships ?? []),
    invitations: [] as string[],
  }
  const client = {
    auth: { admin: {
      listUsers: async () => ({ data: { users: state.users }, error: null }),
      inviteUserByEmail: async (email: string, settings: { redirectTo: string }) => {
        state.invitations.push(email)
        expect(settings.redirectTo).toBe('https://example.com/recuperar')
        const user = { id: `invited-${email}`, email, email_confirmed_at: '' }
        state.users.push(user)
        return { data: { user }, error: null }
      },
    } },
    from: (table: string) => {
      let head = false
      let single = false
      let limit = Infinity
      let operation = 'read'
      let values: Record<string, unknown>[] = []
      const filters: ((row: Record<string, unknown>) => boolean)[] = []
      const query = {
        select: (_columns: string, config?: { head?: boolean }) => { head = Boolean(config?.head); return query },
        limit: (value: number) => { limit = value; return query },
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query },
        in: (key: string, choices: unknown[]) => { filters.push((row) => choices.includes(row[key])); return query },
        maybeSingle: () => { single = true; return query },
        insert: (input: Record<string, unknown> | Record<string, unknown>[]) => { operation = 'insert'; values = Array.isArray(input) ? input : [input]; return query },
        update: (input: Record<string, unknown>) => { operation = 'update'; values = [input]; return query },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          if (head || limit === 0) return Promise.resolve({ data: head ? null : [], error: null }).then(resolve, reject)
          const rows = state[table as 'clinics' | 'clinic_members']
          if (!rows) throw new Error('Unexpected data query')
          if (operation === 'insert') {
            const key = table === 'clinics' ? 'id' : 'user_id'
            if (values.some((input) => rows.some((row) => row[key] === input[key]))) return Promise.resolve({ data: null, error: { code: '23505' } }).then(resolve, reject)
            rows.push(...structuredClone(values))
          }
          const matching = rows.filter((row) => filters.every((match) => match(row))).slice(0, limit)
          if (operation === 'update') for (const row of matching) Object.assign(row, values[0])
          return Promise.resolve({ data: single ? matching[0] || null : matching, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }
  return { state, client }
}

describe('administrator seeder', () => {
  it('checks without changing accounts, clinics, roles or passwords', async () => {
    const { client, state } = backend({ users: [] })
    const result = await seedAdmins(client, { ...options, apply: false }, 'https://example.supabase.co')
    expect(result.ready).toBe(false)
    expect(result.accounts.every((account: { exists: boolean }) => !account.exists)).toBe(true)
    expect(state.clinics).toHaveLength(0)
    expect(state.clinic_members).toHaveLength(0)
    expect(state.invitations).toHaveLength(0)
  })
  it('stops when Auth users are missing and invitations were not explicitly requested', async () => {
    const { client, state } = backend({ users: [] })
    await expect(seedAdmins(client, options, 'https://example.supabase.co')).rejects.toMatchObject({ code: 'MISSING_AUTH_USERS' })
    expect(state.clinics).toHaveLength(0)
    expect(state.invitations).toHaveLength(0)
  })
  it('assigns both owners to one clinic and can run again without duplicates', async () => {
    const { client, state } = backend()
    const first = await seedAdmins(client, options, 'https://example.supabase.co')
    const second = await seedAdmins(client, options, 'https://example.supabase.co')
    expect(first.clinicId).toBe(second.clinicId)
    expect(state.clinics).toHaveLength(1)
    expect(state.clinic_members).toHaveLength(2)
    expect(state.clinic_members.every((member) => member.role === 'owner' && member.clinic_id === first.clinicId)).toBe(true)
    expect(state.invitations).toHaveLength(0)
    expect(first.passwordsChanged).toBe(false)
  })
  it('preserves existing clinic settings and only upgrades the requested member role', async () => {
    const clinic = { id: 'clinic-1', settings: { name: 'Configuración existente' } }
    const { client, state } = backend({ clinics: [clinic], memberships: [{ user_id: users[0].id, clinic_id: 'clinic-1', role: 'professional' }] })
    await seedAdmins(client, options, 'https://example.supabase.co')
    expect(state.clinics).toEqual([clinic])
    expect(state.clinic_members.every((member) => member.role === 'owner')).toBe(true)
  })
  it('never moves accounts from different clinics', async () => {
    const { client, state } = backend({ memberships: users.map((user, index) => ({ user_id: user.id, clinic_id: `clinic-${index}`, role: 'owner' })) })
    await expect(seedAdmins(client, options, 'https://example.supabase.co')).rejects.toMatchObject({ code: 'CLINIC_CONFLICT' })
    expect(state.clinic_members[0].clinic_id).toBe('clinic-0')
    expect(state.invitations).toHaveLength(0)
  })
  it('does not choose an arbitrary clinic when multiple clinics exist', async () => {
    const { client, state } = backend({ clinics: [{ id: 'one' }, { id: 'two' }] })
    await expect(seedAdmins(client, options, 'https://example.supabase.co')).rejects.toMatchObject({ code: 'CLINIC_AMBIGUOUS' })
    expect(state.clinic_members).toHaveLength(0)
  })
  it('only invites missing accounts when requested, without modifying existing credentials', async () => {
    const { client, state } = backend({ users: [users[0]] })
    const result = await seedAdmins(client, { ...options, invite: true, redirectTo: 'https://example.com/recuperar' }, 'https://example.supabase.co')
    expect(state.invitations).toEqual([emails[1]])
    expect(state.clinic_members).toHaveLength(2)
    expect(result.passwordsChanged).toBe(false)
    expect(result.accounts[0].invitedNow).toBe(false)
    expect(result.accounts[1].invitedNow).toBe(true)
  })
  it('validates invite destinations and normalizes duplicate email arguments', () => {
    expect(parseOptions(['--check', '--emails', 'ADMIN@example.com, admin@example.com']).emails).toEqual(['admin@example.com'])
    expect(() => parseOptions(['--apply', '--invite', '--emails', emails.join(',')])).toThrow(/redirect-url/)
    expect(() => parseOptions(['--apply', '--invite', '--emails', emails.join(','), '--redirect-url', 'http://example.com/recuperar'])).toThrow(/HTTPS/)
    expect(parseOptions(['--apply', '--invite', '--emails', emails.join(','), '--redirect-url', 'https://example.com/recuperar']).invite).toBe(true)
  })
})
