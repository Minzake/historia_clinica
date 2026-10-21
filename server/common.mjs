import { createClient } from '@supabase/supabase-js'

export function adminClient(env) {
  const url=env.VITE_SUPABASE_URL || env.VITE_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const key=env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SERVER_NOT_CONFIGURED')
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(request,init)=>fetch(request,{...init,signal:AbortSignal.timeout(15000)})}})
}
export function respond(res,status,data) {
  res.statusCode=status
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.setHeader('Cache-Control','no-store')
  res.end(JSON.stringify(data))
}
export async function jsonBody(req) {
  const validate=(value)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('INVALID_BODY')
    try {if(Buffer.byteLength(JSON.stringify(value),'utf8')>16384)throw new Error('INVALID_BODY')}
    catch {throw new Error('INVALID_BODY')}
    return value
  }
  if (req.body!==undefined && typeof req.body==='object') return validate(req.body)
  if (req.body!==undefined && typeof req.body!=='string') throw new Error('INVALID_BODY')
  let body=typeof req.body==='string'?req.body:''
  if (!body) for await(const chunk of req) {body+=chunk; if(Buffer.byteLength(body,'utf8')>16384) throw new Error('INVALID_BODY')}
  if(Buffer.byteLength(body,'utf8')>16384) throw new Error('INVALID_BODY')
  try {return validate(body?JSON.parse(body):{})} catch {throw new Error('INVALID_BODY')}
}
export async function requestUser(req,admin) {
  const token=/^Bearer ([^\s]{20,8000})$/i.exec(req.headers.authorization || '')?.[1]
  if(!token) throw new Error('UNAUTHORIZED')
  const {data,error}=await admin.auth.getUser(token)
  if(error || !data.user?.email_confirmed_at) throw new Error('UNAUTHORIZED')
  return data.user
}
export function applicationUrl(env) {
  const raw=env.APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL?`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`:env.NODE_ENV!=='production'?'http://localhost:5173':'')
  const url=new URL(raw)
  if(url.protocol!=='https:' && !(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:')) throw new Error('APP_URL_REQUIRED')
  return url.origin
}
export const uuid=(value)=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
