import { describe, expect, it } from 'vitest'
import { localContainerSpec } from '../scripts/local-ports.mjs'

function container() {
  return {
    Name: '/supabase_db_historia-clinica-local',
    Config: { Labels: { 'com.supabase.cli.project': 'historia-clinica-local' }, Env: ['LOCAL_SETTING=test'] },
    HostConfig: { AutoRemove: false, PortBindings: { '5432/tcp': [{ HostIp: '', HostPort: '54322' }] }, Binds: ['supabase_db_historia-clinica-local:/var/lib/postgresql/data'] },
    Mounts: [{ Type: 'volume', Name: 'supabase_db_historia-clinica-local', Destination: '/var/lib/postgresql/data', RW: true }],
    NetworkSettings: { Networks: { 'historia-clinica-local': { Aliases: ['supabase_db_historia-clinica-local'] } } },
  }
}

describe('local container port restriction', () => {
  it('keeps the database volume, environment and DNS alias while binding only to loopback', () => {
    const original = container(), spec = localContainerSpec(original)
    expect(spec.HostConfig.PortBindings['5432/tcp'][0]).toEqual({ HostIp: '127.0.0.1', HostPort: '54322' })
    expect(spec.HostConfig.Binds).toEqual(original.HostConfig.Binds)
    expect(spec.Env).toEqual(original.Config.Env)
    expect(spec.NetworkingConfig.EndpointsConfig['historia-clinica-local'].Aliases).toEqual(['supabase_db_historia-clinica-local'])
    expect(original.HostConfig.PortBindings['5432/tcp'][0].HostIp).toBe('')
  })
  it('reuses an anonymous volume rather than creating an empty replacement', () => {
    const original = container()
    original.HostConfig.Binds = []
    expect(localContainerSpec(original).HostConfig.Mounts).toContainEqual({ Type: 'volume', Source: 'supabase_db_historia-clinica-local', Target: '/var/lib/postgresql/data', ReadOnly: false })
  })
  it('refuses to modify another project or a container that removes its own volumes', () => {
    const original = container()
    original.Config.Labels['com.supabase.cli.project'] = 'another-project'
    expect(() => localContainerSpec(original)).toThrow('LOCAL_CONTAINER_SCOPE_INVALID')
    const automatic = container(); automatic.HostConfig.AutoRemove = true
    expect(() => localContainerSpec(automatic)).toThrow('LOCAL_CONTAINER_SCOPE_INVALID')
  })
})
