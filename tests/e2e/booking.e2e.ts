import { expect,test } from '@playwright/test'
import { formatDate } from '../../src/core/format'
import type { Page } from '@playwright/test'

const clinic='20000000-0000-4000-8000-000000000001',owner='10000000-0000-4000-8000-000000000001',provider='10000000-0000-4000-8000-000000000002',client='10000000-0000-4000-8000-000000000004'
const pageId='40000000-0000-4000-8000-000000000001',serviceId='50000000-0000-4000-8000-000000000001'
const access=[{specialtyId:'podologia',name:'Podología',canRead:true,canWrite:true,canExport:true,scope:'all'}]
const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10)
async function backend(page:Page,staff:boolean,open=true,options:{slug?:string;minutes?:number;single?:boolean;appointments?:Record<string,any>[]}={}) {
  const user={id:staff?owner:client,email:staff?'owner@example.com':'patient@example.com',email_confirmed_at:new Date().toISOString(),aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{full_name:'Paciente de prueba',dni:'12345678',phone:''},created_at:new Date().toISOString()}
  const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fake-signature`
  const practitioners=options.single?[{user_id:provider,email:'profesional@example.com',role:'professional',display_name:'Profesional de prueba',specialty_ids:['podologia']}]:[{user_id:owner,email:'owner@example.com',role:'owner'},{user_id:provider,email:'profesional@example.com',role:'owner'}]
  let settings={page_id:pageId,service_id:serviceId,duration_minutes:options.minutes||30,clinic_id:clinic,slug:options.slug||'consultorio',enabled:open,provider_id:open?provider:null,provider_name:open?'Profesional de prueba':'',timezone:'America/Argentina/Buenos_Aires',advance_days:30,lead_minutes:120,cancel_hours:12,version:1}
  let hours:unknown[]=[],appointments:Record<string,any>[]=options.appointments||[]
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
    else if(url.pathname==='/rest/v1/rpc/list_my_memberships')data=staff?[{clinicId:clinic,role:'owner',clinic:{name:'Consultorio de Podología',professional:'Profesional de prueba',address:'Dirección del consultorio',phone:'1112345678',email:'',license:''},version:1,specialties:access}]:[]
    else if(url.pathname==='/rest/v1/rpc/get_clinic_dashboard'||url.pathname==='/rest/v1/rpc/list_clinical_patients')data={patients:[],count:0,evolutions:0}
    else if(url.pathname==='/rest/v1/rpc/get_booking_configuration')data={settings,hours,practitioners,pages:[{...settings}],services:[{id:serviceId,clinic_id:clinic,specialty_id:'podologia',name:'Consulta de podología',duration_minutes:options.minutes||30,active:true,version:1,legacy_default:true}]}
    else if(url.pathname==='/rest/v1/booking_settings')data=settings
    else if(url.pathname==='/rest/v1/booking_hours')data=hours
    else if(url.pathname==='/rest/v1/rpc/list_practitioners')data=practitioners
    else if(url.pathname==='/rest/v1/rpc/list_team')data=practitioners.map(p=>({...p,active:true,confirmed:true,is_self:p.user_id===owner}))
    else if(url.pathname==='/rest/v1/rpc/search_registered_patients')data=[]
    else if(url.pathname==='/rest/v1/rpc/get_patient_account')data={user_id:client,full_name:'Paciente de prueba',dni:'12345678',phone:'',email:'patient@example.com'}
    else if(url.pathname==='/rest/v1/rpc/list_booking_pages')data=settings.enabled?[{...settings,name:'Consultorio de Podología',address:'Dirección del consultorio',phone:'1112345678',duration_minutes:30}]:[]
    else if(url.pathname==='/rest/v1/rpc/get_booking_slots')data=[12,12.5,13,13.5,14].map(hour=>`${args.p_date}T${String(Math.floor(hour)).padStart(2,'0')}:${hour%1?'30':'00'}:00+00:00`).filter(slot=>!appointments.some(a=>a.status!=='cancelled'&&Date.parse(a.starts_at)<Date.parse(slot)+1800000&&Date.parse(a.ends_at)>Date.parse(slot)))
    else if(url.pathname==='/rest/v1/rpc/book_appointment'){
      if(appointments.some(a=>a.client_user_id===client&&a.provider_id===provider&&a.status==='confirmed'&&Date.parse(a.starts_at)>Date.now())){
        await route.fulfill({status:400,headers,body:JSON.stringify({code:'22023',message:'BOOKING_LIMIT'})});return
      }
      const id=`30000000-0000-4000-8000-${String(appointments.length+1).padStart(12,'0')}`
      appointments.push({id,clinic_id:clinic,provider_id:provider,client_user_id:client,patient_id:null,contact_name:'Paciente de prueba',contact_dni:'12345678',contact_email:'patient@example.com',contact_phone:'',starts_at:args.p_starts_at,ends_at:new Date(Date.parse(args.p_starts_at)+1800000).toISOString(),kind:'consultation',source:'web',status:'confirmed',private_notes:'',version:1,notification_state:'pending'})
      data=id
    }else if(url.pathname==='/rest/v1/rpc/get_my_appointments')data=appointments.filter(a=>a.client_user_id===client).map(a=>({...a,clinic_name:'Consultorio de Podología',address:'Dirección del consultorio',phone:'1112345678',provider_name:'Profesional de prueba',timezone:settings.timezone,slug:settings.slug,cancel_hours:12,advance_days:settings.advance_days,can_reschedule:a.source==='web'&&a.provider_id===settings.provider_id&&settings.enabled}))
    else if(url.pathname==='/rest/v1/rpc/change_my_appointment'){
      const a=appointments.find(item=>item.id===args.p_id)!
      a.version++
      if(args.p_starts_at){a.starts_at=args.p_starts_at;a.ends_at=new Date(Date.parse(a.starts_at)+1800000).toISOString()}else a.status='cancelled'
      data=null
    }else if(url.pathname==='/rest/v1/rpc/save_booking_page'){settings={...settings,...args.p_data,version:settings.version+1};hours=args.p_hours;data=pageId}
    else if(url.pathname==='/rest/v1/rpc/list_patient_identities')data={patients:[{id:'patient-known',full_name:'Ana Paciente',dni:'22334455',details:{mobile:'1155551234'}}],count:1}
    else if(url.pathname==='/rest/v1/rpc/list_agenda')data=appointments.filter(a=>a.starts_at<args.p_to&&a.ends_at>args.p_from)
    else if(url.pathname==='/rest/v1/rpc/save_staff_appointment'){
      const input=args.p_data,id=args.p_id||`30000000-0000-4000-8000-${String(appointments.length+1).padStart(12,'0')}`
      const value={id,clinic_id:clinic,provider_id:input.provider_id,service_id:input.service_id,client_user_id:null,patient_id:null,contact_name:input.name,contact_dni:input.dni,contact_email:input.email,contact_phone:input.phone,starts_at:input.starts_at,ends_at:new Date(Date.parse(input.starts_at)+input.duration_minutes*60000).toISOString(),kind:input.kind,source:'staff',status:input.status,private_notes:input.notes,version:args.p_version+1,notification_state:input.email?'pending':null}
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
  await page.getByLabel('Día de la consulta').fill(formatDate(day))
  await page.getByRole('button',{name:'09:00',exact:true}).click()
  await page.getByRole('button',{name:'Confirmar turno',exact:true}).click()
  await expect(page).toHaveURL(/\/mis-turnos$/)
  await expect(page.getByText('09:00–09:30',{exact:true})).toBeVisible()
  await expect(page.getByText(/El aviso por email está pendiente; la reserva ya está guardada/)).toBeVisible()
  await page.getByRole('link',{name:'Reservar turno',exact:true}).click()
  await expect(page.getByText(/Ya tenés un turno confirmado con Profesional de prueba/)).toBeVisible()
  await expect(page.getByRole('button',{name:'Confirmar turno',exact:true})).toHaveCount(0)
  await page.getByRole('link',{name:'Ver mi turno',exact:true}).click()
  await page.getByRole('button',{name:'Reprogramar',exact:true}).click()
  const maxDate=await page.getByLabel('Día de la consulta').getAttribute('max')
  const minDate=await page.getByLabel('Día de la consulta').getAttribute('min')
  expect(Date.parse(maxDate!)-Date.parse(minDate!)).toBe(30*86400000)
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
  await page.getByRole('link',{name:'Reservar turno',exact:true}).click()
  await page.getByLabel('Día de la consulta').fill(formatDate(day))
  await page.getByRole('button',{name:'10:00',exact:true}).click()
  await page.getByRole('button',{name:'Confirmar turno',exact:true}).click()
  await expect(page.getByText('10:00–10:30',{exact:true})).toBeVisible()
})

test('owner configures the professional, opens booking, adds a 90 minute appointment and a block',async({page},testInfo)=>{
  await backend(page,true,false)
  await login(page,true)
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('link',{name:'Agenda',exact:true}).click()
  await page.getByRole('button',{name:'Opciones de agenda',exact:true}).click()
  await page.getByRole('link',{name:'Horarios y reservas web',exact:true}).click()
  await page.getByLabel('Profesional que atiende').selectOption(provider)
  await page.getByLabel('Nombre público de la profesional').fill('Profesional de prueba')
  await page.getByRole('button',{name:'Agregar franja'}).click()
  await page.getByLabel('Habilitar reservas automáticas por la web').check()
  await page.getByRole('button',{name:'Guardar disponibilidad'}).click()
  await expect(page.getByText(/Disponibilidad guardada/)).toBeVisible()
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('link',{name:'Agenda',exact:true}).click()
  await page.getByLabel('Fecha de la agenda').fill(formatDate(day))
  await page.getByRole('button',{name:'Nuevo turno',exact:true}).click()
  await page.getByRole('button',{name:'Cargar un paciente nuevo',exact:true}).click()
  await page.getByLabel('Nombre y apellido del paciente').fill('Paciente atención extendida')
  await page.getByLabel('DNI',{exact:true}).fill('12345678')
  await page.getByRole('button',{name:'Cambiar duración',exact:true}).click()
  await page.getByLabel('Duración (minutos)').fill('90')
  await page.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Paciente atención extendida'})).toBeVisible()
  await expect(page.getByText('Consulta de podología · profesional@example.com · 90 min',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Opciones de agenda',exact:true}).click()
  await page.getByRole('button',{name:'Bloquear horario',exact:true}).click()
  await page.getByLabel('Desde',{exact:true}).fill(`${formatDate(day)} 11:00`)
  await page.getByLabel('Hasta',{exact:true}).fill(`${formatDate(day)} 12:00`)
  await page.getByLabel('Motivo del bloqueo (interno)').fill('Descanso')
  await page.getByRole('button',{name:'Guardar bloqueo',exact:true}).click()
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

test('invalid booking rules and reversed blocks stay editable and never reach the server', async ({page}) => {
  await backend(page,true,false)
  let saves=0
  page.on('request',request=>{if(/\/rpc\/save_(booking_page|staff_appointment)$/.test(new URL(request.url()).pathname))saves++})
  await login(page,true)
  await page.goto('/agenda/configuracion')
  await page.getByLabel('Profesional que atiende').selectOption(provider)
  await page.getByLabel('Nombre público de la profesional').fill('Profesional de prueba')
  await page.getByRole('button',{name:'Agregar franja'}).click()
  await page.getByLabel('Habilitar reservas automáticas por la web').check()
  const advance=page.getByLabel('Anticipación máxima (días)')
  await advance.fill('')
  await expect(advance).toHaveValue('')
  await page.getByRole('button',{name:'Guardar disponibilidad'}).click()
  await expect(advance).toBeFocused()
  await expect(advance).toHaveAttribute('aria-invalid','true')
  expect(saves).toBe(0)
  await advance.fill('30')
  await page.getByRole('button',{name:'Agregar franja'}).click()
  await page.getByRole('button',{name:'Guardar disponibilidad'}).click()
  await expect(page.getByLabel('Hasta',{exact:true}).nth(1)).toBeFocused()
  await expect(page.getByRole('alert')).toContainText('superponerse')
  expect(saves).toBe(0)
  await page.getByLabel('Desde',{exact:true}).nth(1).fill('13:00')
  await page.getByLabel('Hasta',{exact:true}).nth(1).fill('16:00')
  await page.getByRole('button',{name:'Guardar disponibilidad'}).click()
  await expect(page.getByText(/Disponibilidad guardada/)).toBeVisible()
  expect(saves).toBe(1)
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('link',{name:'Agenda',exact:true}).click()
  await page.getByRole('button',{name:'Opciones de agenda',exact:true}).click()
  await page.getByRole('button',{name:'Bloquear horario',exact:true}).click()
  await page.getByLabel('Desde',{exact:true}).fill(`${formatDate(day)} 12:00`)
  await page.getByLabel('Hasta',{exact:true}).fill(`${formatDate(day)} 11:00`)
  await page.getByRole('button',{name:'Guardar bloqueo',exact:true}).click()
  await expect(page.getByLabel('Hasta',{exact:true})).toBeFocused()
  await expect(page.getByRole('alert')).toContainText('posterior al inicio')
  expect(saves).toBe(1)
})

test('readable links replace internal identifiers only on save and can be copied',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write'])
  await backend(page,true,false,{slug:'consultorio-30000000000040008000000000000001',single:true})
  await login(page,true)
  await page.goto('/agenda/configuracion')
  const card=page.getByRole('region',{name:'Enlace para compartir'})
  await expect(card).not.toContainText('30000000000040008000000000000001')
  await expect(card).toContainText('/reservar/podologia-profesional-de-prueba')
  await expect(card.getByRole('button',{name:'Copiar enlace'})).toBeDisabled()
  await page.getByRole('button',{name:'Personalizar enlace',exact:true}).click()
  await page.getByLabel('Nombre del enlace',{exact:true}).fill('podologia-centro')
  await page.getByRole('button',{name:'Guardar disponibilidad',exact:true}).click()
  await expect(card.getByRole('button',{name:'Copiar enlace'})).toBeEnabled()
  await card.getByRole('button',{name:'Copiar enlace'}).click()
  await expect(card).toContainText('Enlace copiado')
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('http://127.0.0.1:4173/reservar/podologia-centro')
})

test('a week day preselects the date, sole practitioner and service duration on mobile',async({page},testInfo)=>{
  await page.setViewportSize({width:375,height:812})
  await backend(page,true,false,{single:true,minutes:45})
  let saved:Record<string,any>|undefined
  page.on('request',r=>{if(r.url().endsWith('/rpc/save_staff_appointment'))saved=r.postDataJSON().p_data})
  await login(page,true)
  await page.goto('/agenda')
  await page.getByLabel('Fecha de la agenda').fill(formatDate(day))
  await page.getByRole('button',{name:'Semana',exact:true}).click()
  const date=await page.getByRole('button',{name:/Agregar turno el/}).last().getAttribute('aria-label')
  const selected=date!.replace('Agregar turno el ','')
  await page.getByRole('button',{name:date!,exact:true}).click()
  await expect(page.getByLabel('Día del turno')).toHaveValue(selected)
  await expect(page.getByRole('dialog').getByText('Profesional de prueba',{exact:true})).toBeVisible()
  await expect(page.getByText(/^45 minutos/)).toBeVisible()
  await page.getByRole('button',{name:'Cargar un paciente nuevo',exact:true}).click()
  await page.getByLabel('Nombre y apellido del paciente').fill('Paciente del domingo')
  await page.getByLabel('DNI',{exact:true}).fill('33445566')
  await page.getByRole('button',{name:'09:00',exact:true}).click()
  await expect(page.getByText('Turno de 09:00 a 09:45',{exact:true})).toBeVisible()
  expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  await page.screenshot({path:testInfo.outputPath('nuevo-turno-mobile.png'),fullPage:true})
  await page.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(saved).toMatchObject({provider_id:provider,duration_minutes:45,starts_at:`${selected.split('/').reverse().join('-')}T12:00:00.000Z`,status:'confirmed'})
})

test('occupied suggestions are omitted and a manual overlap is rejected before saving',async({page})=>{
  await backend(page,true,true,{single:true,appointments:[{id:'occupied',provider_id:provider,starts_at:`${day}T12:00:00.000Z`,ends_at:`${day}T13:00:00.000Z`,status:'confirmed',kind:'block',contact_name:'Descanso',source:'staff',contact_email:'',contact_dni:'',contact_phone:''}]})
  let saves=0
  page.on('request',r=>{if(r.url().endsWith('/rpc/save_staff_appointment'))saves++})
  await login(page,true)
  await page.goto('/agenda')
  await page.getByLabel('Fecha de la agenda').fill(formatDate(day))
  await page.getByRole('button',{name:'Nuevo turno',exact:true}).click()
  await page.getByRole('button',{name:'Cargar un paciente nuevo',exact:true}).click()
  await page.getByLabel('Nombre y apellido del paciente').fill('Paciente de prueba')
  await page.getByLabel('DNI',{exact:true}).fill('22334455')
  await expect(page.getByRole('button',{name:'09:00',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'10:00',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Ingresar otra hora',exact:true}).click()
  await expect(page.getByLabel('Hora de inicio')).toHaveValue('10:00')
  await page.getByLabel('Hora de inicio').fill('09:30')
  await page.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(page.getByLabel('Hora de inicio')).toHaveAttribute('aria-invalid','true')
  expect(saves).toBe(0)
  await page.getByRole('button',{name:'10:00',exact:true}).click()
  await page.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(saves).toBe(1)
  await page.getByRole('button').filter({has:page.getByRole('heading',{name:'Paciente de prueba',exact:true})}).click()
  await expect(page.getByRole('button',{name:'10:00',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Cambiar duración',exact:true}).click()
  await page.getByLabel('Duración (minutos)').fill('45')
  await page.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(saves).toBe(2)
})

test('an existing patient fills contact details without linking a portal account or clinical chart',async({page})=>{
  await backend(page,true,true,{single:true})
  let saved:Record<string,any>|undefined
  page.on('request',r=>{if(r.url().endsWith('/rpc/save_staff_appointment'))saved=r.postDataJSON().p_data})
  await login(page,true)
  await page.goto('/agenda')
  await page.getByLabel('Fecha de la agenda').fill(formatDate(day))
  await page.getByRole('button',{name:'Nuevo turno',exact:true}).click()
  await page.getByLabel('Buscar paciente por nombre o DNI').fill('22334455')
  await page.getByLabel('Buscar paciente por nombre o DNI').press('Enter')
  await page.getByRole('button',{name:'Ana Paciente · DNI 22334455',exact:true}).click()
  await expect(page.getByRole('dialog').getByText('Ana Paciente',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(saved).toMatchObject({name:'Ana Paciente',dni:'22334455',phone:'1155551234',client_user_id:null})
  expect(saved).not.toHaveProperty('patient_id')
})

test('minimal agenda keeps secondary actions available and assigns an existing patient without extra fields',async({page},testInfo)=>{
  const base={clinic_id:clinic,provider_id:provider,service_id:serviceId,client_user_id:null,patient_id:null,contact_dni:'22334455',contact_phone:'',contact_email:'',private_notes:'',version:1,kind:'consultation',source:'staff'}
  await backend(page,true,false,{single:true,appointments:[
    {...base,id:'confirmed',contact_name:'Turno vigente',starts_at:`${day}T12:00:00Z`,ends_at:`${day}T12:30:00Z`,status:'confirmed'},
    {...base,id:'cancelled',contact_name:'Turno cancelado',starts_at:`${day}T13:00:00Z`,ends_at:`${day}T13:30:00Z`,status:'cancelled'},
  ]})
  let saved:Record<string,any>|undefined
  page.on('request',request=>{if(request.url().endsWith('/rpc/save_staff_appointment'))saved=request.postDataJSON().p_data})
  await login(page,true);await page.goto('/agenda')
  await page.getByLabel('Fecha de la agenda').fill(formatDate(day))
  await expect(page.getByRole('heading',{name:'Turno vigente',exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Turno cancelado',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Bloquear horario',exact:true})).toHaveCount(0)
  await page.screenshot({path:testInfo.outputPath('agenda-minimal-desktop.png'),fullPage:true})
  await page.getByRole('button',{name:'Opciones de agenda',exact:true}).click()
  await expect(page.getByRole('button',{name:'Bloquear horario',exact:true})).toBeVisible()
  await expect(page.getByText('Sin configurar',{exact:true})).toBeInViewport()
  await page.getByLabel('Mostrar cancelados').check()
  await expect(page.getByRole('heading',{name:'Turno cancelado',exact:true})).toBeVisible()
  await page.getByRole('heading',{name:'Agenda',exact:true}).click()
  await expect(page.getByRole('button',{name:'Bloquear horario',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Nuevo turno',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Nuevo turno',exact:true})
  await expect(dialog.getByLabel('Buscar paciente por nombre o DNI')).toBeVisible()
  await expect(dialog.getByLabel('Nombre y apellido del paciente')).toHaveCount(0)
  await expect(dialog.getByLabel('Duración (minutos)')).toHaveCount(0)
  await expect(dialog.getByLabel('Hora de inicio')).toHaveCount(0)
  await expect(dialog.getByLabel('Email para avisos (opcional)')).toHaveCount(0)
  await dialog.getByLabel('Buscar paciente por nombre o DNI').fill('22334455')
  await dialog.getByRole('button',{name:'Ana Paciente · DNI 22334455',exact:true}).click()
  await expect(dialog.getByText('Ana Paciente',{exact:true})).toBeVisible()
  await dialog.getByRole('button',{name:'10:00',exact:true}).click()
  await page.screenshot({path:testInfo.outputPath('asignar-turno-desktop.png'),fullPage:true})
  await page.setViewportSize({width:375,height:812})
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true)
  await page.screenshot({path:testInfo.outputPath('asignar-turno-mobile.png'),fullPage:true})
  await dialog.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(dialog).toHaveCount(0)
  expect(saved).toMatchObject({name:'Ana Paciente',dni:'22334455',provider_id:provider,service_id:serviceId,duration_minutes:30,client_user_id:null})
  expect(saved!.starts_at).toBe(`${day}T13:00:00.000Z`)
})

test('a duplicate public name stays editable with a useful error',async({page})=>{
  await backend(page,true,false)
  await page.route('**/rest/v1/rpc/save_booking_page',async route=>{
    if(route.request().postDataJSON().p_data.slug==='ocupado')await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'23505',message:'Duplicate slug'})})
    else await route.fallback()
  })
  await login(page,true)
  await page.goto('/agenda/configuracion')
  await page.getByRole('button',{name:'Personalizar enlace',exact:true}).click()
  await page.getByLabel('Nombre del enlace',{exact:true}).fill('ocupado')
  await page.getByRole('button',{name:'Guardar disponibilidad',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Ese nombre de enlace ya está en uso')
  await page.getByLabel('Nombre del enlace',{exact:true}).fill('podologia-barrio-norte')
  await page.getByRole('button',{name:'Guardar disponibilidad',exact:true}).click()
  await expect(page.getByRole('region',{name:'Enlace para compartir'}).getByRole('link')).toHaveAttribute('href',/\/reservar\/podologia-barrio-norte$/)
})

test('incomplete dates and durations remain editable and closing protects the entered patient',async({page})=>{
  await backend(page,true,true,{single:true})
  let saves=0
  page.on('request',r=>{if(r.url().endsWith('/rpc/save_staff_appointment'))saves++})
  await login(page,true)
  await page.goto('/agenda')
  await page.getByRole('button',{name:'Nuevo turno',exact:true}).click()
  await page.getByRole('button',{name:'Cargar un paciente nuevo',exact:true}).click()
  await page.getByLabel('Nombre y apellido del paciente').fill('Datos sin guardar')
  await page.getByLabel('DNI',{exact:true}).fill('22334455')
  await page.getByRole('button',{name:'Más opciones',exact:true}).click()
  await page.getByRole('button',{name:'Usar una cuenta del portal de pacientes',exact:true}).click()
  await page.getByRole('button',{name:'Cargar los datos manualmente',exact:true}).click()
  await expect(page.getByLabel('Nombre y apellido del paciente')).toHaveValue('Datos sin guardar')
  await page.getByLabel('Día del turno').fill('')
  await expect(page.getByRole('heading',{name:'Nuevo turno',exact:true})).toBeVisible()
  await page.getByLabel('Día del turno').fill(formatDate(day))
  await page.getByRole('button',{name:'Cambiar duración',exact:true}).click()
  await page.getByLabel('Duración (minutos)').fill('')
  await page.getByRole('button',{name:'Guardar turno',exact:true}).click()
  await expect(page.getByLabel('Duración (minutos)')).toHaveAttribute('aria-invalid','true')
  expect(saves).toBe(0)
  page.once('dialog',d=>d.dismiss())
  await page.getByRole('button',{name:'Cancelar',exact:true}).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  page.once('dialog',d=>d.accept())
  await page.getByRole('button',{name:'Cancelar',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
