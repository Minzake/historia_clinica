import { adminClient,applicationUrl,jsonBody,requestUser,respond,uuid } from '../server/common.mjs'

export async function handleTeam(req,res,env=process.env) {
  if(!['POST','PATCH'].includes(req.method)) return respond(res,405,{error:'Método no permitido.'})
  try {
    const admin=adminClient(env),user=await requestUser(req,admin),body=await jsonBody(req)
    if(!uuid(body.clinic_id)||!['owner','professional','reception'].includes(body.role)) return respond(res,400,{error:'Revisá el consultorio y los permisos solicitados.'})
    const member=await admin.from('clinic_members').select('role,active').eq('user_id',user.id).eq('clinic_id',body.clinic_id).maybeSingle()
    if(member.error||!member.data?.active||member.data.role!=='owner') return respond(res,403,{error:'Solo un administrador activo puede gestionar el equipo.'})
    let target=req.method==='PATCH'?body.user_id:undefined,invited=false
    if(req.method==='POST') {
      const email=typeof body.email==='string'?body.email.trim().toLowerCase():''
      if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond(res,400,{error:'Ingresá un correo válido.'})
      const authorization=await admin.rpc('authorize_team_invite',{p_actor:user.id,p_clinic_id:body.clinic_id})
      if(authorization.error) return respond(res,429,{error:'No se puede enviar otra invitación ahora. Revisá tus permisos o esperá una hora.'})
      const lookup=await admin.rpc('resolve_team_user',{p_actor:user.id,p_clinic_id:body.clinic_id,p_email:email})
      if(lookup.error)return respond(res,409,{error:'No se puede asignar esa cuenta. Revisá sus permisos y si ya pertenece a otro consultorio.'})
      target=lookup.data
      if(!target) {
        const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${applicationUrl(env)}/recuperar`})
        if(error||!data.user) return respond(res,502,{error:'No se pudo enviar la invitación. Revisá el servicio de correo y las URLs de Supabase.'})
        target=data.user.id;invited=true
      }
    }
    if(!uuid(target)|| (req.method==='PATCH'&&typeof body.active!=='boolean')) return respond(res,400,{error:'Solicitud no válida.'})
    const {error}=await admin.rpc('manage_team_member',{p_actor:user.id,p_target:target,p_role:body.role,p_active:req.method==='POST'?true:body.active,p_clinic_id:body.clinic_id})
    if(error) {
      const code=String(error.message||'')
      const message=code.includes('MEMBER_HAS_APPOINTMENTS')?'Reasigná o cancelá los próximos turnos de esa persona antes de desactivarla.'
        :code.includes('MEMBER_OTHER_CLINIC')?'La cuenta ya pertenece a otro consultorio; no se modificó su asignación.'
        :code.includes('LAST_OWNER')?'No se puede quitar al último administrador activo.':'No se pudo cambiar el permiso. No podés desactivar ni degradar tu propia cuenta.'
      return respond(res,409,{error:message})
    }
    return respond(res,200,{ok:true,invited})
  }catch(error){return respond(res,error.message==='UNAUTHORIZED'?401:error.message==='INVALID_BODY'?400:503,{error:error.message==='UNAUTHORIZED'?'Volvé a iniciar sesión.':'No se pudo gestionar el equipo. Revisá la configuración del servidor e intentá nuevamente.'})}
}
export default function handler(req,res){return handleTeam(req,res)}
