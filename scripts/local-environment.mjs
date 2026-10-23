const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])

function requireLocalUrl(value, protocols, port) {
  let url
  try { url = new URL(value) } catch { throw new Error('LOCAL_ENVIRONMENT_INVALID') }
  if (!loopback.has(url.hostname) || !protocols.includes(url.protocol) || url.port !== String(port)) throw new Error('LOCAL_ENVIRONMENT_REMOTE_TARGET')
  return url
}

export function assertLocalEnvironment(env) {
  for (const key of ['VITE_SUPABASE_URL', 'VITE_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) requireLocalUrl(env[key], ['http:'], 54321)
  for (const key of ['POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL']) requireLocalUrl(env[key], ['postgres:', 'postgresql:'], 54322)
  requireLocalUrl(env.APP_URL, ['http:'], 5173)
  if (env.RESEND_API_KEY || env.NOTIFICATIONS_FROM_EMAIL || env.CRON_SECRET) throw new Error('LOCAL_EXTERNAL_DELIVERY_ENABLED')
}

export function localEnvironment(status) {
  const api = requireLocalUrl(status.API_URL, ['http:'], 54321)
  const database = requireLocalUrl(status.DB_URL, ['postgres:', 'postgresql:'], 54322)
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('LOCAL_KEYS_MISSING')
  const env = {
    VITE_SUPABASE_URL: api.origin, VITE_PUBLIC_SUPABASE_URL: api.origin, SUPABASE_URL: api.origin,
    VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY, VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    VITE_SUPABASE_ANON_KEY: status.ANON_KEY, VITE_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY, SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    POSTGRES_URL: database.href, POSTGRES_URL_NON_POOLING: database.href, POSTGRES_PRISMA_URL: database.href,
    POSTGRES_HOST: database.hostname, POSTGRES_USER: decodeURIComponent(database.username),
    POSTGRES_PASSWORD: decodeURIComponent(database.password), POSTGRES_DATABASE: database.pathname.slice(1),
    APP_URL: 'http://localhost:5173', VITE_APP_ENVIRONMENT: 'local',
    RESEND_API_KEY: '', NOTIFICATIONS_FROM_EMAIL: '', CRON_SECRET: '', SUPABASE_JWT_SECRET: '',
  }
  assertLocalEnvironment(env)
  return env
}
