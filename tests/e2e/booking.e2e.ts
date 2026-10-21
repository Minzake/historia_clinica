import { expect,test } from '@playwright/test'
import type { Page } from '@playwright/test'

const clinic='20000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000001',provider='10000000-0000-4000-8000-000000000002',client='10000000-0000-4000-8000-000000000004'
const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10)
async function backend(page:Page,staff:boolean,open=true) {
  const user={id:staff?owner:client,email:staff?'owner@example.com':'patient@example.com',email_confirmed_at:new Date().toISOString(),aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{full_name:'Paciente de prueba',dni:'12345678',phone:''},created_at:new Date().toISOString()}
  const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fake-signature`
  const practitioners=[{user_id:owner,email:'owner@example.com',role:'owner'},{user_id:provider,email:'profesional@example.com',role:'owner'}]
  let settings={clinic_id:clinic,slug:'consultorio',enabled:open,provider_id:open?provider:null,provider_name:open?'Profesional de prueba':'',timezone:'America/Argentina/Buenos_Aires',advance_days:30,lead_minutes:120,cancel_hours:12,version:1}
  let hours:unknown[]=[],appointments:Record<string,any>[]=[]
  await page.route('**/api/notifications',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({configured:false,sent:0,failed:0})}))
  await page.route('**/api/team',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,invited:true})}))
  await page.route('https://test-clinic.supabase.co/**',async route=>{
    const request=route.request(),url=new URL(request.url()),args=request.method()==='POST'?request.postDataJSON():{}
    let data:unknown
    const headers:Record<string,string>={'content-type':'application/json'}
    if(url.pathname==='/auth/v1/token')data={access_token:token,refresh_token:'fake-refresh-token',expires_in:3600,token_type:'bearer',user}
    else if(url.pathname==='/auth/v1/user')data=user
    else if(url.pathname==='/auth/v1/logout'){await route.fulfill({status:204});return}
    else if(url.pathname==='/rest/v1/clinic_members')data=staff?[{clinic_id:clinic,role:'owner',active:true,clinics:{settings:{name:'Consultorio de Podología',professional:'Profesional de prueba',address:'Dirección del consultorio',phone:'1112345678',email:'',license:''},version:1}}]:[]
    else if(url.pathname==='/rest/v1/patients'){data=[];headers['content-range']='*/0'}
    else if(url.pathname==='/rest/v1/evolutions'){data=[];headers['content-range']='*/0'}
    else if(url.pathname==='/rest/v1/booking_settings')data=settings
    else if(url.pathname==='/rest/v1/booking_hours')data=hours
    else if(url.pathname==='/rest/v1/rpc/list_practitioners')data=practitioners
    else if(url.pathname==='/rest/v1/rpc/list_team')data=practitioners.map(p=>({...p,active:true,confirmed:true,is_self:p.user_id===owner}))
    else if(url.pathname==='/rest/v1/rpc/search_registered_patients')data=[]
    else if(url.pathname==='/rest/v1/rpc/get_patient_account')data={user_id:client,full_name:'Paciente de prueba',dni:'12345678',phone:'',email:'patient@example.com'}
    else if(url.pathname==='/rest/v1/rpc/list_booking_pages')data=settings.enabled?[{...settings,name:'Consultorio de Podología',address:'Dirección del consultorio',phone:'1112345678',duration_minutes:30}]:[]
    else if(url.pathname==='/rest/v1/rpc/get_booking_slots')data=[12,12.5,13,13.5,14].map(hour=>`${args.p_date}T${String(Math.floor(hour)).padStart(2,'0')}:${hour%1?'30':'00'}:00+00:00`).filter(slot=>!appointments.some(a=>a.status!=='cancelled'&&Date.parse(a.starts_at)<Date.parse(slot)+1800000&&Date.parse(a.ends_at)>Date.parse(slot)))
    else if(url.pathname==='/rest/v1/rpc/book_appointment'){
      const id=`30000000-0000-4000-8000-${String(appointments.length+1).padStart(12,'0')}`
      appointments.push({id,clinic_id:clinic,provider_id:provider,client_user_id:client,patient_id:null,contact_name:'Paciente de prueba',contact_dni:'12345678',contact_email:'patient@example.com',contact_phone:'',starts_at:args.p_starts_at,ends_at:new Date(Date.parse(args.p_starts_at)+1800000).toISOString(),kind:'consultation',source:'web',status:'confirmed',private_notes:'',version:1,notification_state:'pending'})
      data=id
    }else if(url.pathname==='/rest/v1/rpc/get_my_appointments')data=appointments.filter(a=>a.client_user_id===client).map(a=>({...a,clinic_name:'Consultorio de Podología',address:'Dirección del consultorio',phone:'1112345678',timezone:settings.timezone,slug:settings.slug,cancel_hours:12}))
    else if(url.pathname==='/rest/v1/rpc/change_my_appointment'){
      const a=appointments.find(item=>item.id===args.p_id)!
      a.version++
      if(args.p_starts_at){a.starts_at=args.p_starts_at;a.ends_at=new Date(Date.parse(a.starts_at)+1800000).toISOString()}else a.status='cancelled'
      data=null
    }else if(url.pathname==='/rest/v1/rpc/save_booking_settings'){settings={...settings,...args.p_data,version:settings.version+1};hours=args.p_hours;data=null}
    else if(url.pathname==='/rest/v1/rpc/list_agenda')data=appointments
    else if(url.pathname==='/rest/v1/rpc/save_staff_appointment'){
      const input=args.p_data,id=args.p_id||`30000000-0000-4000-8000-${String(appointments.length+1).padStart(12,'0')}`
      const value={id,clinic_id:clinic,provider_id:input.provider_id,client_user_id:null,patient_id:null,contact_name:input.name,contact_dni:input.dni,contact_email:input.email,contact_phone:input.phone,starts_at:input.starts_at,ends_at:new Date(Date.parse(input.starts_at)+input.duration_minutes*60000).toISOString(),kind:input.kind,source:'staff',status:input.status,private_notes:input.notes,version:args.p_version+1,notification_state:input.email?'pending':null}
      appointments=args.p_id?appointments.map(a=>a.id===id?value:a):[...appointments,value];data=id
    }else throw new Error(`Unexpected endpoint: ${url.pathname}`)
    await route.fulfill({status:200,headers,body:request.method()==='HEAD'?'':JSON.stringify(data)})
  })
}
async function login(page:Page,staff:boolean) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill(staff?'owner@example.com':'patient@example.com')
  await page.getByLabel('Contraseña',{exact:true}).fill('safe-testing-password')
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click()
}

test('patient books 30 minutes, reschedules, cancels and cannot open clinical management',async({page},testInfo)=>{
  await page.setViewportSize({width:375,height:812})
  await backend(page,false)
  await login(page,false)
  await expect(page.getByRole('heading',{name:'Hola, Paciente de prueba'})).toBeVisible()
  await page.getByRole('link',{name:'Reservar turno',exact:true}).click()
  await page.getByLabel('Día de la consulta').fill(day)
  await page.getByRole('button',{name:'09:00',exact:true}).click()
  await page.getByRole('button',{name:'Confirmar turno',exact:true}).click()
  await expect(page).toHaveURL(/\/mis-turnos$/)
  await expect(page.getByText('09:00–09:30',{exact:true})).toBeVisible()
  await expect(page.getByText(/El aviso por email está pendiente; la reserva ya está guardada/)).toBeVisible()
  await page.getByRole('button',{name:'Reprogramar',exact:true}).click()
  await page.getByRole('button',{name:'09:30',exact:true}).click()
  await page.getByRole('button',{name:'Confirmar nuevo horario',exact:true}).click()
  await expect(page.getByText('09:30–10:00',{exact:true})).toBeVisible()
  await page.screenshot({path:testInfo.outputPath('portal-paciente-mobile.png'),fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.goto('/historias')
  await expect(page).toHaveURL(/\/mis-turnos$/)
  await expect(page.getByRole('link',{name:'Historias clínicas',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Cancelar turno',exact:true}).click()
  await page.getByRole('button',{name:'Confirmar cancelación',exact:true}).click()
  await expect(page.getByText('Cancelado',{exact:true})).toBeVisible()
})

test('owner configures the professional, opens booking, adds a 90 minute appointment and a block',async({page},testInfo)=>{
  await backend(page,true,false)
  await login(page,true)
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('link',{name:'Agenda',exact:true}).click()
  await page.getByRole('link',{name:'Configurá la profesional y los horarios para abrirlas.'}).click()
  await page.getByLabel('Profesional que atiende').selectOption(provider)
  await page.getByLabel('Nombre público de la profesional').fill('Profesional de prueba')
  await page.getByRole('button',{name:'Agregar franja'}).click()
  await page.getByLabel('Habilitar reservas automáticas por la web').check()
  await page.getByRole('button',{name:'Guardar disponibilidad'}).click()
  await expect(page.getByText(/Disponibilidad guardada/)).toBeVisible()
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('link',{name:'Agenda',exact:true}).click()
  await page.getByLabel('Fecha de la agenda').fill(day)
  await page.getByRole('button',{name:'Nuevo turno',exact:true}).click()
  await page.getByLabel('Nombre y apellido del paciente').fill('Paciente atención extendida')
  await page.getByLabel('Duración (minutos)').fill('90')
  await page.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Paciente atención extendida'})).toBeVisible()
  await expect(page.getByText('Asignado por profesional · 90 min',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Bloquear horario',exact:true}).click()
  await page.getByLabel('Desde',{exact:true}).fill(`${day}T11:00`)
  await page.getByLabel('Hasta',{exact:true}).fill(`${day}T12:00`)
  await page.getByLabel('Motivo del bloqueo (interno)').fill('Descanso')
  await page.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Descanso'})).toBeVisible()
  await page.getByRole('button',{name:'Semana',exact:true}).click()
  await page.screenshot({path:testInfo.outputPath('agenda-semanal.png'),fullPage:true})
  await page.setViewportSize({width:375,height:812})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('link',{name:'Usuarios',exact:true}).click()
  await page.getByLabel('Email de la persona').fill('nuevo-profesional@example.com')
  await page.getByRole('button',{name:'Invitar o asignar'}).click()
  await expect(page.getByText(/Invitación enviada/)).toBeVisible()
})

test('public page remains closed until availability is configured',async({page})=>{
  await backend(page,false,false)
  await page.goto('/reservar')
  await expect(page.getByRole('heading',{name:'La agenda web todavía no está abierta'})).toBeVisible()
  await expect(page.getByRole('link',{name:'Crear mi cuenta',exact:true})).toBeVisible()
})
