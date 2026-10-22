import { execFileSync } from 'node:child_process'
import http from 'node:http'

const project = 'historia-clinica-local'

export function localContainerSpec(container) {
  if (container.Config?.Labels?.['com.supabase.cli.project'] !== project || !container.Name?.endsWith(`_${project}`) || container.HostConfig?.AutoRemove) throw new Error('LOCAL_CONTAINER_SCOPE_INVALID')
  const config = structuredClone(container.Config)
  const host = structuredClone(container.HostConfig)
  for (const bindings of Object.values(host.PortBindings || {})) for (const binding of bindings || []) binding.HostIp = '127.0.0.1'
  // Reuse every existing mount, including anonymous volumes. Never remove volumes.
  for (const mount of container.Mounts || []) {
    if (host.Binds?.some(bind => bind.includes(`:${mount.Destination}`)) || host.Mounts?.some(item => item.Target === mount.Destination) || host.Tmpfs?.[mount.Destination]) continue
    if (!['volume', 'bind'].includes(mount.Type)) throw new Error('LOCAL_MOUNT_UNSUPPORTED')
    host.Mounts ||= []
    host.Mounts.push({ Type: mount.Type, Source: mount.Type === 'volume' ? mount.Name : mount.Source, Target: mount.Destination, ReadOnly: !mount.RW })
  }
  const endpoints = Object.fromEntries(Object.entries(container.NetworkSettings.Networks).map(([name, network]) => [name, { Aliases: network.Aliases }]))
  return { ...config, HostConfig: host, NetworkingConfig: { EndpointsConfig: endpoints } }
}

export async function restrictLocalPorts() {
  const run = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const endpoint = run(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}']).trim()
  const socketPath = endpoint.startsWith('npipe://') ? endpoint.slice(8).replaceAll('/', '\\') : endpoint.startsWith('unix://') ? endpoint.slice(7) : null
  if (!socketPath) throw new Error('La restricción de puertos necesita un Docker local con socket o named pipe.')
  const request = (method, path, body) => new Promise((resolveRequest, reject) => {
    const payload = body ? JSON.stringify(body) : undefined
    const req = http.request({ socketPath, path, method, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, res => {
      let result = ''
      res.on('data', chunk => { result += chunk })
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Docker local respondió HTTP ${res.statusCode}.`))
        resolveRequest(result ? JSON.parse(result) : null)
      })
    })
    req.setTimeout(30000, () => req.destroy(new Error('Docker local no respondió.')))
    req.on('error', reject)
    req.end(payload)
  })
  const ids = run(['ps', '-aq', '--filter', `label=com.supabase.cli.project=${project}`]).trim().split(/\s+/).filter(Boolean)
  if (!ids.length) throw new Error('No encontramos los contenedores locales de este proyecto.')
  for (const container of JSON.parse(run(['inspect', ...ids]))) {
    const bindings = Object.values(container.HostConfig.PortBindings || {}).flat().filter(Boolean)
    if (!bindings.length || bindings.every(binding => binding.HostIp === '127.0.0.1')) continue
    const spec = localContainerSpec(container)
    const name = container.Name.slice(1)
    await request('POST', `/containers/${container.Id}/stop?t=10`)
    await request('DELETE', `/containers/${container.Id}?v=false`)
    try {
      const replacement = await request('POST', `/containers/create?name=${encodeURIComponent(name)}`, spec)
      await request('POST', `/containers/${replacement.Id}/start`)
    } catch (error) {
      // If creation itself failed, restore the original service using the same mounts.
      const existing = run(['ps', '-aq', '--filter', `name=^/${name}$`]).trim()
      if (!existing) {
        const original = { ...spec, HostConfig: container.HostConfig }
        const replacement = await request('POST', `/containers/create?name=${encodeURIComponent(name)}`, original)
        if (container.State.Running) await request('POST', `/containers/${replacement.Id}/start`)
      }
      throw error
    }
  }
  const currentIds = run(['ps', '-aq', '--filter', `label=com.supabase.cli.project=${project}`]).trim().split(/\s+/)
  const deadline = Date.now() + 90000
  let lastProgress = Date.now()
  while (true) {
    const containers = JSON.parse(run(['inspect', ...currentIds]))
    for (const container of containers) {
      if (Object.values(container.NetworkSettings.Ports || {}).flat().filter(Boolean).some(binding => binding.HostIp !== '127.0.0.1')) throw new Error('Docker publicó un puerto fuera de loopback. No se inició la aplicación.')
    }
    if (containers.every(container => container.State.Running && (!container.State.Health || container.State.Health.Status === 'healthy'))) return
    if (Date.now() > deadline) throw new Error('Los servicios locales no terminaron de iniciar. Se conservaron los volúmenes.')
    if (Date.now() - lastProgress > 15000) { console.log('Esperando a los servicios locales…'); lastProgress = Date.now() }
    await new Promise(resolveWait => setTimeout(resolveWait, 1000))
  }
}
