import { expect,test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { blankClinic,blankRecord } from '../../src/lib/model'
import type { SavedRecord } from '../../src/lib/model'

const clinic='20000000-0000-4000-8000-000000000001',clinic2='20000000-0000-4000-8000-000000000002'
const userId='10000000-0000-4000-8000-000000000001',provider='10000000-0000-4000-8000-000000000002'
const patientId='30000000-0000-4000-8000-000000000001',newPatientId='30000000-0000-4000-8000-000000000002'
const pageId='40000000-0000-4000-8000-000000000001',newPageId='40000000-0000-4000-8000-000000000002'
const serviceId='50000000-0000-4000-8000-000000000001',newServiceId='50000000-0000-4000-8000-000000000002'
const permissions=[{specialtyId:'podologia',name:'Podología',canRead:true,canWrite:true,canExport:true,scope:'all'}]
async function backend(page:Page,role:'owner'|'reception',multi=false,clinical=true) {
  const clinicData={...blankClinic(),name:'Centro de prueba',professional:'Profesional de prueba'}
  const user={id:userId,email:'equipo@example.com',email_confirmed_at:new Date().toISOString(),aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}
  const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:userId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.testing-signature`
  const record={...blankRecord(),id:patientId,chartId:patientId,specialtyId:'podologia',schemaVersion:1,identityVersion:1,version:1,updatedAt:new Date().toISOString(),canWrite:true,canExport:true} as SavedRecord
  record.patient.fullName='Ana Paciente';record.patient.historyNumber='HC-000001';record.patient.dni='12345678';record.patient.medication='Dato clínico privado'
  const identities=[{id:patientId,version:1,full_name:'Ana Paciente',dni:'12345678',history_number:'HC-000001',details:{birthDate:'',address:'',phone:'',mobile:'',insurance:'',occupation:'',emergencyContact:'',emergencyPhone:''},chart_links:role==='owner'&&clinical?[{specialtyId:'podologia',name:'Podología',action:'open'}]:[],assignment_charts:role==='owner'?[{id:patientId,name:'Podología'}]:[]}]
  const records=new Map([[patientId,record]])
  const services=[{id:serviceId,clinic_id:clinic,specialty_id:'podologia',name:'Consulta de podología',duration_minutes:30,active:true,version:1,legacy_default:true}]
  const pages=[{page_id:pageId,clinic_id:clinic,service_id:serviceId,duration_minutes:30,slug:'podologia',enabled:false,provider_id:provider,provider_name:'Profesional de prueba',timezone:'America/Argentina/Buenos_Aires',advance_days:30,lead_minutes:120,cancel_hours:12,version:1}]
  const hours=new Map<string,unknown[]>([[pageId,[]]])
  const requests:{name:string;args:any}[]=[]
  await page.route('**/api/notifications',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({configured:false,sent:0,failed:0})}))
  await page.route('https://test-clinic.supabase.co/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,args=req.method()==='POST'?req.postDataJSON():{}
    const name=path.split('/').at(-1)!
    let data:unknown
    if(path==='/auth/v1/token')data={access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user}
    else if(path==='/auth/v1/user')data=user
    else if(path==='/auth/v1/logout'){await route.fulfill({status:204});return}
    else {
      requests.push({name,args})
      if(name==='list_my_memberships')data=[{clinicId:clinic,role,clinic:clinicData,version:1,specialties:role==='owner'&&clinical?permissions:[]},...(multi?[{clinicId:clinic2,role:'owner',clinic:{...blankClinic(),name:'Segundo centro'},version:1,specialties:[]}]:[])]
      else if(name==='get_clinic_dashboard'||name==='list_clinical_patients')data={patients:[...records.values()].map(r=>({id:r.id,full_name:r.patient.fullName,history_number:r.patient.historyNumber,dni:r.patient.dni,updated_at:r.updatedAt})),count:records.size,evolutions:0}
      else if(name==='get_clinical_chart') {
        if(role==='reception'||args.p_clinic_id!==clinic){await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'Access denied'})});return}
        data=records.get(args.p_patient_id)
      } else if(name==='list_patient_identities')data={patients:identities,count:identities.length}
      else if(name==='get_patient_identity')data=identities.find(p=>p.id===args.p_patient_id)
      else if(name==='save_patient_identity') {
        const identity=args.p_identity
        identities.push({id:newPatientId,version:1,full_name:identity.fullName,dni:identity.dni,history_number:'HC-000002',details:identity,chart_links:role==='owner'?[{specialtyId:'podologia',name:'Podología',action:'create'}]:[],assignment_charts:[]})
        data=newPatientId
      } else if(name==='save_patient_record') {
        const saved={...args.p_record,id:args.p_patient_id||newPatientId,chartId:args.p_patient_id||newPatientId,version:args.p_expected_version+1,identityVersion:args.p_record.identityVersion||1,updatedAt:new Date().toISOString(),canWrite:true,canExport:true}
        records.set(saved.id,saved);data=saved
      } else if(name==='list_chart_access')data=[{user_id:provider,email:'profesional@example.com',scope:'assigned',allow_write:true,allow_export:true,can_read:false,can_write:false,can_export:false}]
      else if(name==='grant_chart_access')data=null
      else if(name==='get_booking_configuration') {
        const settings=pages.find(p=>p.page_id===args.p_page_id)||pages[0]
        data={settings,hours:hours.get(settings.page_id)||[],services,pages,practitioners:[{user_id:provider,email:'profesional@example.com',role:'professional',display_name:'Profesional de prueba',specialty_ids:['podologia']}]}
      } else if(name==='save_service') {services.push({...args.p_data,id:newServiceId,clinic_id:clinic,version:1,legacy_default:false});data=newServiceId}
      else if(name==='save_booking_page') {pages.push({...args.p_data,page_id:newPageId,version:1});hours.set(newPageId,args.p_hours);data=newPageId}
      else if(name==='list_booking_pages')data=pages.filter(p=>p.enabled).map(p=>({...p,name:clinicData.name,address:'',phone:'',service_name:services.find(s=>s.id===p.service_id)?.name,duration_minutes:services.find(s=>s.id===p.service_id)?.duration_minutes||30}))
      else if(name==='get_patient_account')data=null
      else if(name==='get_my_appointments'||name==='get_booking_slots'||name==='list_agenda'||name==='list_chart_versions')data=[]
      else throw new Error(`Unexpected mock endpoint ${path}`)
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
  return {requests,records,identities,pages,services}
}
async function login(page:Page){await page.goto('/');await page.getByLabel('Correo electrónico').fill('equipo@example.com');await page.getByLabel('Contraseña',{exact:true}).fill('testing-password-long');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Tu consultorio, al día.'})).toBeVisible()}

test('reception manages identity without clinical requests, history navigation or clinical fields',async({page},testInfo)=>{
  await page.setViewportSize({width:375,height:812})
  const state=await backend(page,'reception')
  await login(page)
  await expect(page.getByRole('navigation').getByRole('link',{name:'Historias clínicas'})).toHaveCount(0)
  await page.getByRole('navigation').getByRole('link',{name:'Pacientes',exact:true}).click()
  await expect(page.getByText('Ana Paciente',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Agregar paciente'}).click()
  await page.getByLabel('Apellido y nombre',{exact:true}).fill('Paciente administrativo')
  await page.getByLabel('DNI',{exact:true}).fill('23456789')
  await page.getByRole('button',{name:'Guardar datos',exact:true}).click()
  await expect(page.getByText('Paciente administrativo',{exact:true})).toBeVisible()
  expect(state.requests.find(r=>r.name==='save_patient_identity')?.args.p_identity).not.toHaveProperty('medication')
  await page.screenshot({path:testInfo.outputPath('recepcion-mobile.png'),fullPage:true})
  await page.goto(`/historias/${patientId}`)
  await expect(page.getByRole('alert')).toContainText('no tiene acceso a historias clínicas')
  expect(state.requests.some(r=>['get_clinical_chart','list_clinical_patients','get_clinic_dashboard','list_chart_versions'].includes(r.name))).toBe(false)
  await expect(page.getByText('Dato clínico privado')).toHaveCount(0)
})

test('changing center protects unsaved edits and returns to the selected center without showing the previous chart',async({page})=>{
  const state=await backend(page,'owner',true)
  await login(page)
  await page.getByRole('link',{name:'Ana Paciente',exact:true}).click()
  await page.getByLabel('Domicilio').fill('Edición pendiente')
  page.once('dialog',dialog=>dialog.dismiss())
  await page.getByLabel('Consultorio activo').selectOption(clinic2)
  await expect(page.getByLabel('Consultorio activo')).toHaveValue(clinic)
  await expect(page.getByLabel('Domicilio')).toHaveValue('Edición pendiente')
  const before=state.requests.length
  page.once('dialog',dialog=>dialog.accept())
  await page.getByLabel('Consultorio activo').selectOption(clinic2)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByLabel('Consultorio activo')).toHaveValue(clinic2)
  await expect(page.getByRole('navigation').getByRole('link',{name:'Historias clínicas'})).toHaveCount(0)
  await expect(page.getByText('Dato clínico privado')).toHaveCount(0)
  expect(state.requests.slice(before).some(r=>r.name==='get_clinical_chart'&&r.args.p_clinic_id===clinic)).toBe(false)
})

test('an administrative owner assigns a chart without opening clinical content',async({page})=>{
  const state=await backend(page,'owner',false,false)
  await login(page)
  await page.getByRole('navigation').getByRole('link',{name:'Pacientes',exact:true}).click()
  await page.getByRole('button',{name:'Asignar acceso · Podología',exact:true}).click()
  await page.getByLabel('Integrante del equipo').selectOption(provider)
  await page.getByLabel('Consultar esta ficha').check()
  await page.getByLabel('Registrar consultas').check()
  await page.getByRole('button',{name:'Guardar asignación',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.requests.find(r=>r.name==='grant_chart_access')?.args).toMatchObject({p_chart_id:patientId,p_user_id:provider,p_read:true,p_write:true,p_export:false})
  expect(state.requests.some(r=>['get_clinical_chart','list_clinical_patients','get_clinic_dashboard','list_chart_versions'].includes(r.name))).toBe(false)
  await expect(page.getByText('Dato clínico privado')).toHaveCount(0)
})

test('a clinical chart can be created for an existing administrative patient without duplicating identity',async({page})=>{
  const state=await backend(page,'owner')
  await login(page)
  await page.getByRole('navigation').getByRole('link',{name:'Pacientes',exact:true}).click()
  await page.getByRole('button',{name:'Agregar paciente'}).click()
  await page.getByLabel('Apellido y nombre',{exact:true}).fill('Paciente conocido')
  await page.getByLabel('DNI',{exact:true}).fill('23456789')
  await page.getByRole('button',{name:'Guardar datos',exact:true}).click()
  await page.getByRole('link',{name:'Crear ficha · Podología',exact:true}).click()
  await expect(page.getByLabel('Apellido y nombre *')).toHaveValue('Paciente conocido')
  await page.getByRole('button',{name:'Guardar historia',exact:true}).click()
  await expect(page).toHaveURL(new RegExp(`/historias/${newPatientId}$`))
  expect(state.identities).toHaveLength(2)
  expect(state.requests.find(r=>r.name==='save_patient_record')?.args.p_patient_id).toBe(newPatientId)
})

test('the owner creates a new service and its public agenda while keeping the original thirty-minute service',async({page},testInfo)=>{
  const state=await backend(page,'owner')
  await login(page)
  await page.getByRole('link',{name:'Horarios de reserva web',exact:true}).click()
  await page.getByRole('button',{name:'Prestaciones',exact:true}).click()
  await page.getByLabel('Nombre de la prestación').fill('Consulta de seguimiento')
  await page.getByLabel('Duración de la prestación (minutos)').fill('45')
  await page.getByRole('button',{name:'Guardar prestación',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button',{name:'Agregar agenda',exact:true}).click()
  await page.getByLabel('Prestación de esta agenda').selectOption(newServiceId)
  await page.getByLabel('Profesional que atiende').selectOption(provider)
  await page.getByLabel('Nombre público de la profesional').fill('Profesional de prueba')
  await page.getByLabel('Identificador del enlace público').fill('seguimiento')
  await page.getByRole('button',{name:'Agregar franja'}).click()
  await page.getByLabel('Habilitar reservas automáticas por la web').check()
  await page.getByRole('button',{name:'Guardar disponibilidad',exact:true}).click()
  await expect(page.getByText(/Disponibilidad guardada/)).toBeVisible()
  await expect(page.getByLabel('Agenda de reservas')).toHaveValue(newPageId)
  expect(state.services[0].duration_minutes).toBe(30)
  await page.screenshot({path:testInfo.outputPath('agendas-por-prestacion.png'),fullPage:true})
  await page.goto('/reservar/seguimiento')
  await expect(page.getByText('Consulta de seguimiento · 45 minutos',{exact:true})).toBeVisible()
})
