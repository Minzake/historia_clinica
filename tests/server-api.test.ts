import { beforeEach,describe,expect,it,vi } from 'vitest'
import { handleTeam } from '../api/team.mjs'
import { handleNotifications } from '../api/notifications.mjs'
import { dispatchNotifications,notificationEmail } from '../server/notifications.mjs'

const mocks=vi.hoisted(()=>({createClient:vi.fn()}))
vi.mock('@supabase/supabase-js',()=>mocks)
const actor='10000000-0000-4000-8000-000000000001',target='10000000-0000-4000-8000-000000000002',clinic='20000000-0000-4000-8000-000000000001'
const env={VITE_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test_only',APP_URL:'https://example.com'}
function response(){return {statusCode:0,body:'',setHeader:vi.fn(),end(value:string){this.body=value}}}
function request(body:unknown={},method='POST'){return {method,body,headers:{authorization:'Bearer fake-valid-token-for-tests-only'}}}
function admin(role='owner') {
  const query={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(async()=>({data:{role,active:true},error:null}))}
  query.select.mockReturnValue(query);query.eq.mockReturnValue(query)
  return {from:vi.fn(()=>query),auth:{getUser:vi.fn(async()=>({data:{user:{id:actor,email_confirmed_at:'2026-10-21'}},error:null})),admin:{listUsers:vi.fn(async()=>({data:{users:[]},error:null})),inviteUserByEmail:vi.fn(async()=>({data:{user:{id:target}},error:null}))}},rpc:vi.fn(async()=>({data:null,error:null}))}
}
beforeEach(()=>{vi.resetAllMocks()})

describe('server-only staff administration',()=>{
  it('rejects a patient or professional even if the request body claims administrator privileges',async()=>{
    const api=admin('professional');mocks.createClient.mockReturnValue(api)
    const res=response()
    await handleTeam(request({clinic_id:clinic,email:'staff@example.com',role:'owner',actor_id:target}),res,env)
    expect(res.statusCode).toBe(403);expect(api.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();expect(api.rpc).not.toHaveBeenCalled()
  })
  it('invites with a trusted server redirect and derives the actor from a verified token',async()=>{
    const api=admin();mocks.createClient.mockReturnValue(api)
    const res=response()
    await handleTeam(request({clinic_id:clinic,email:'staff@example.com',role:'professional',actor_id:target,redirect_to:'https://attacker.example'}),res,env)
    expect(res.statusCode).toBe(200)
    expect(api.auth.admin.inviteUserByEmail).toHaveBeenCalledWith('staff@example.com',{redirectTo:'https://example.com/recuperar'})
    expect(api.rpc).toHaveBeenCalledWith('manage_team_member',{p_actor:actor,p_target:target,p_role:'professional',p_active:true,p_clinic_id:clinic})
    expect(res.body).not.toContain('sb_secret')
  })
  it('requires a real verified session instead of decoding or trusting an arbitrary JWT',async()=>{
    const api=admin();api.auth.getUser.mockResolvedValue({data:{user:null},error:{message:'Invalid token'}} as never);mocks.createClient.mockReturnValue(api)
    const res=response()
    await handleTeam(request({clinic_id:clinic,email:'staff@example.com',role:'owner'}),res,env)
    expect(res.statusCode).toBe(401);expect(api.from).not.toHaveBeenCalled()
  })
})

describe('appointment email outbox',()=>{
  const payload={event:'confirmed',name:'Paciente',clinic:'Consultorio',starts_at:'2026-10-24T12:00:00Z',timezone:'America/Argentina/Buenos_Aires',dni:'SECRET_DNI',private_notes:'SECRET_CLINICAL_NOTES'}
  it('does not consume queued jobs or send anything before a provider is configured',async()=>{
    const api=admin(),fetcher=vi.fn()
    const result=await dispatchNotifications({admin:api,actor,env,fetcher})
    expect(result.configured).toBe(false);expect(api.rpc).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
  })
  it('only includes logistical details, not DNI or clinical notes',()=>{
    const message=notificationEmail(payload,'https://example.com')
    expect(message.text).toContain('24/10/2026 09:00')
    expect(message.text).toContain('09:00');expect(message.text).not.toContain('SECRET_DNI');expect(message.text).not.toContain('SECRET_CLINICAL_NOTES')
  })
  it('claims jobs for the authenticated actor and uses a stable provider idempotency key',async()=>{
    const api=admin()
    api.rpc.mockImplementation(async(name:string)=>({data:name==='claim_appointment_notifications'?[{id:'job-1',recipient:'patient@example.com',payload}]:null,error:null}))
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({id:'email-1'}),{status:200}))
    const result=await dispatchNotifications({admin:api,actor,appointmentId:target,env:{...env,RESEND_API_KEY:'test-key',NOTIFICATIONS_FROM_EMAIL:'turnos@example.com'},fetcher})
    expect(result.sent).toBe(1)
    expect(api.rpc).toHaveBeenCalledWith('claim_appointment_notifications',{p_actor:actor,p_appointment:target,p_limit:10})
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('appointment-job-1')
    expect(api.rpc).toHaveBeenCalledWith('finish_appointment_notification',{p_id:'job-1',p_sent:true,p_provider_id:'email-1',p_error:null})
  })
  it('records a retry without leaking the provider response or rolling back the appointment',async()=>{
    const api=admin()
    api.rpc.mockImplementation(async(name:string)=>({data:name==='claim_appointment_notifications'?[{id:'job-2',recipient:'patient@example.com',payload}]:null,error:null}))
    const fetcher=vi.fn(async()=>new Response('sensitive provider details',{status:429}))
    const result=await dispatchNotifications({admin:api,actor,env:{...env,RESEND_API_KEY:'test-key',NOTIFICATIONS_FROM_EMAIL:'turnos@example.com'},fetcher})
    expect(result.failed).toBe(1);expect(result.sent).toBe(0)
    expect(api.rpc).toHaveBeenCalledWith('finish_appointment_notification',{p_id:'job-2',p_sent:false,p_provider_id:null,p_error:'PROVIDER_HTTP_429'})
  })
  it('protects the cron endpoint with a separate secret',async()=>{
    mocks.createClient.mockReturnValue(admin())
    const res=response()
    await handleNotifications({method:'GET',headers:{authorization:'Bearer wrong-secret'}},res,{...env,CRON_SECRET:'correct-secret'})
    expect(res.statusCode).toBe(401)
  })
})
