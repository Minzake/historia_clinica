import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Anonymous, read-only smoke checks. POSTs intentionally have no token and must be rejected.
export async function checkDeployment(base,fetcher=fetch) {
  const origin=new URL(base).origin
  const checks=[['/registro','GET',200],['/reservar','GET',200],['/api/team','POST',401],['/api/notifications','POST',401]]
  const results=[]
  for(const [path,method,expected] of checks) {
    const response=await fetcher(origin+path,{method,headers:method==='POST'?{'Content-Type':'application/json'}:undefined,body:method==='POST'?'{}':undefined,signal:AbortSignal.timeout(20000)})
    if(response.status!==expected || (method==='POST'&&!response.headers.get('content-type')?.includes('application/json')))throw new Error(`CHECK_FAILED:${path}`)
    results.push({path,status:response.status})
  }
  return results
}
async function main() {
  if(process.argv.includes('--if-requested')&&process.env.VERIFY_LIVE_APP!=='1')return
  try {
    const base=process.env.APP_URL||process.argv.find((value)=>value.startsWith('https://'))
    if(!base)throw new Error('MISSING_URL')
    console.log(JSON.stringify({deploymentChecks:await checkDeployment(base)}))
  }catch{console.error('DEPLOYMENT_CHECK: No se pudo verificar el dominio o una ruta no respondió con el estado esperado. No se crearon cuentas ni turnos.');process.exitCode=1}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main()
