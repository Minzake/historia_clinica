export function notificationEmail(payload,appUrl) {
  const event={confirmed:'Turno confirmado',rescheduled:'Turno reprogramado',cancelled:'Turno cancelado'}[payload.event]||'Información de tu turno'
  const date=new Date(payload.starts_at)
  const formatted=date.toLocaleString('es-AR',{timeZone:payload.timezone||'America/Argentina/Buenos_Aires',dateStyle:'full',timeStyle:'short',hourCycle:'h23'})
  const text=[`Hola ${payload.name || ''},`,`${event} en ${payload.clinic || 'el consultorio'}.`,
    `Fecha y hora: ${formatted}.`,payload.address&&`Dirección: ${payload.address}.`,payload.phone&&`Consultas: ${payload.phone}.`,
    `Podés consultar tus turnos en ${appUrl}/mis-turnos.`, 'Este mensaje no contiene información clínica.'].filter(Boolean).join('\n\n')
  return {subject:event,text}
}
export async function dispatchNotifications({admin,actor,appointmentId,env,fetcher=fetch}) {
  if(!env.RESEND_API_KEY||!env.NOTIFICATIONS_FROM_EMAIL) return {configured:false,sent:0,failed:0}
  const appUrl=env.APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL?`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`:'')
  if(!appUrl) return {configured:false,sent:0,failed:0}
  const {data:jobs,error}=await admin.rpc('claim_appointment_notifications',{p_actor:actor,p_appointment:appointmentId||null,p_limit:10})
  if(error)throw new Error('NOTIFICATION_CLAIM')
  let sent=0,failed=0
  for(const job of jobs||[]) {
    let success=false,providerId=null,errorCode='DELIVERY_ERROR'
    try {
      const message=notificationEmail(job.payload,new URL(appUrl).origin)
      const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`appointment-${job.id}`},
        body:JSON.stringify({from:env.NOTIFICATIONS_FROM_EMAIL,to:[job.recipient],...message}),signal:AbortSignal.timeout(12000)})
      if(response.ok){const result=await response.json();success=true;providerId=typeof result.id==='string'?result.id:null}
      else errorCode=`PROVIDER_HTTP_${response.status}`
    }catch{/* Retry only via the outbox; never expose tokens or raw provider errors. */}
    const finish=await admin.rpc('finish_appointment_notification',{p_id:job.id,p_sent:success,p_provider_id:providerId,p_error:success?null:errorCode})
    if(finish.error)throw new Error('NOTIFICATION_FINISH')
    if(success)sent++;else failed++
  }
  return {configured:true,sent,failed}
}
