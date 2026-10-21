import { timingSafeEqual } from 'node:crypto'
import { adminClient,jsonBody,requestUser,respond,uuid } from '../server/common.mjs'
import { dispatchNotifications } from '../server/notifications.mjs'

export async function handleNotifications(req,res,env=process.env) {
  try {
    const admin=adminClient(env)
    let actor=null,appointmentId=null
    if(req.method==='GET') {
      const provided=Buffer.from(req.headers.authorization||''),expected=Buffer.from(`Bearer ${env.CRON_SECRET||''}`)
      if(!env.CRON_SECRET||provided.length!==expected.length||!timingSafeEqual(provided,expected))return respond(res,401,{error:'Acceso no autorizado.'})
    }else if(req.method==='POST') {
      actor=(await requestUser(req,admin)).id
      const body=await jsonBody(req)
      if(body.status_only===true)return respond(res,200,{configured:Boolean(env.RESEND_API_KEY&&env.NOTIFICATIONS_FROM_EMAIL&&(env.APP_URL||env.VERCEL_PROJECT_PRODUCTION_URL))})
      if(body.appointment_id!=null&&!uuid(body.appointment_id))return respond(res,400,{error:'Turno no válido.'})
      appointmentId=body.appointment_id
    }else return respond(res,405,{error:'Método no permitido.'})
    return respond(res,200,await dispatchNotifications({admin,actor,appointmentId,env}))
  }catch(error){return respond(res,error.message==='UNAUTHORIZED'?401:error.message==='INVALID_BODY'?400:503,{error:error.message==='INVALID_BODY'?'Solicitud no válida.':'No se pudieron procesar los avisos. Los turnos permanecen guardados y los correos se reintentarán.'})}
}
export default function handler(req,res){return handleNotifications(req,res)}
