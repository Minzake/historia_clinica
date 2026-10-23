import { expect,test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { blankClinic } from '../../src/core/clinic'
import { blankDentalRecord } from '../../src/modules/odontologia/model'
import type { SavedDentalRecord } from '../../src/modules/odontologia/model'

const clinic='20000000-0000-4000-8000-000000000001',userId='10000000-0000-4000-8000-000000000001',patientId='30000000-0000-4000-8000-000000000001'
async function backend(page:Page,mode:'write'|'read'|'reception'='write',existing=false){
  const clinicData={...blankClinic(),name:'Consultorio dental de prueba'}
  const user={id:userId,email:'dentista@example.test',email_confirmed_at:new Date().toISOString(),aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}
  const token=`eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:userId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.testing-signature`
  let record:SavedDentalRecord|null=existing?{...blankDentalRecord(),id:patientId,chartId:patientId,specialtyId:'odontologia',schemaVersion:1,identityVersion:1,version:1,updatedAt:new Date().toISOString(),canWrite:mode==='write',canExport:mode==='write'}:null
  if(record){record.patient.fullName='Ana Paciente';record.patient.dni='22334455';record.patient.historyNumber='HC-000001'}
  const revisions:SavedDentalRecord[]=[],requests:{name:string;args:any}[]=[]
  await page.route('https://test-clinic.supabase.co/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,args=req.method()==='POST'?req.postDataJSON():{},name=path.split('/').at(-1)!
    let data:unknown
    if(path==='/auth/v1/token')data={access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user}
    else if(path==='/auth/v1/user')data=user
    else if(path==='/auth/v1/logout'){await route.fulfill({status:204});return}
    else{
      requests.push({name,args})
      const links=mode==='reception'?[]:[{specialtyId:'odontologia',name:'Odontología',action:record?'open':'create'}]
      const identity={id:patientId,version:1,full_name:'Ana Paciente',dni:'22334455',history_number:'HC-000001',details:{birthDate:'2016-05-12',address:'',phone:'',mobile:'',insurance:'',occupation:'',emergencyContact:'',emergencyPhone:''},chart_links:links}
      if(name==='list_my_memberships')data=[{clinicId:clinic,role:mode==='reception'?'reception':'owner',clinic:clinicData,version:1,specialties:mode==='reception'?[]:[{specialtyId:'odontologia',name:'Odontología',canRead:true,canWrite:mode==='write',canExport:mode==='write',scope:'all'}]}]
      else if(name==='get_clinic_dashboard'||name==='list_clinical_patients')data={patients:record?[{id:patientId,full_name:record.patient.fullName,dni:record.patient.dni,history_number:record.patient.historyNumber,updated_at:record.updatedAt,chart_links:links}]:[],count:record?1:0,evolutions:record?.evolutions.length||0}
      else if(name==='list_patient_identities')data={patients:[identity],count:1}
      else if(name==='get_patient_identity')data=identity
      else if(name==='get_clinical_chart')data=record
      else if(name==='save_clinical_chart'){
        record={patient:{...args.p_data.initial,...args.p_identity,historyNumber:'HC-000001'},clinical:structuredClone(args.p_data.clinical),evolutions:args.p_data.evolutions,id:patientId,chartId:patientId,specialtyId:'odontologia',schemaVersion:1,identityVersion:1,version:args.p_expected_version+1,updatedAt:new Date().toISOString(),canWrite:true,canExport:true}
        record.clinical.odontograms=record.clinical.odontograms.map(o=>o.authorId?o:{...o,authorId:userId,authorName:'Odontóloga de prueba',recordedAt:new Date().toISOString()})
        revisions.push(structuredClone(record));data=record
      }else if(name==='list_chart_versions')data=revisions.map((r,i)=>({id:i+1,version:r.version,recorded_at:r.updatedAt})).reverse()
      else if(name==='get_chart_revision')data={...revisions[args.p_version_id-1],canWrite:false,canExport:true}
      else throw new Error(`Unexpected endpoint ${path}`)
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
  })
  return {requests,get record(){return record},revisions}
}
async function login(page:Page){await page.goto('/');await page.getByLabel('Correo electrónico').fill('dentista@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('test-password-long');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await expect(page.getByRole('heading',{name:'Tu consultorio, al día.'})).toBeVisible()}
const face=(page:Page,tooth:number,name:string)=>page.getByRole('group',{name:`Caras de la pieza ${tooth}`,exact:true}).getByRole('button',{name:new RegExp(`^${name} de la pieza ${tooth}:`)})
async function brush(page:Page,name:string){await page.getByRole('group',{name:'Pinceles y borrador'}).getByRole('button',{name,exact:true}).click()}

test('creates dentistry on an existing patient, preserves painted permanent and primary teeth, plans, encounters and PDF',async({page},testInfo)=>{
  const state=await backend(page)
  await login(page)
  await page.getByRole('navigation',{name:'Navegación principal'}).getByRole('link',{name:'Pacientes',exact:true}).click()
  await page.getByRole('link',{name:'Crear ficha · Odontología',exact:true}).click()
  await expect(page.getByLabel('Apellido y nombre',{exact:true})).toHaveValue('Ana Paciente')
  await page.getByLabel('Alergias',{exact:true}).fill('Alergia de prueba')
  await page.getByRole('tab',{name:'Odontograma',exact:true}).click()
  await brush(page,'Caries');await face(page,36,'Oclusal').click()
  await brush(page,'Resina');await face(page,36,'Mesial').click()
  await brush(page,'Amalgama');await face(page,36,'Distal').click()
  const enlarged=page.getByRole('group',{name:'Caras de la pieza 36',exact:true})
  await expect(enlarged.locator('[data-surface="center"]')).toHaveAttribute('fill','#cc4242')
  await expect(enlarged.locator('[data-surface="mesial"]')).toHaveAttribute('fill','#405ed6')
  await expect(enlarged.locator('[data-surface="distal"]')).toHaveAttribute('fill','#252525')
  await page.getByRole('button',{name:'Guardar historia y control',exact:true}).click()
  await expect(page).toHaveURL(new RegExp(`/historias/${patientId}\\?especialidad=odontologia`))
  await expect(page.getByText(/Registrado por Odontóloga de prueba/)).toBeVisible()
  const save=state.requests.find(r=>r.name==='save_clinical_chart')!
  expect(save.args.p_patient_id).toBe(patientId);expect(save.args.p_specialty_id).toBe('odontologia');expect(save.args.p_identity).not.toHaveProperty('allergies')
  expect(state.record?.clinical.odontograms[0].marks.map(m=>m.condition)).toEqual(['caries','resin','amalgam'])
  await page.reload();await expect(page.getByText(/Control guardado · solo lectura/)).toBeVisible()
  await expect(page.getByRole('group',{name:'Pinceles y borrador'})).toHaveCount(0)
  await expect(page.getByRole('group',{name:'Caras de la pieza 36',exact:true}).locator('[data-surface="mesial"]')).toHaveAttribute('fill','#405ed6')
  const first=structuredClone(state.record!.clinical.odontograms[0])
  await page.getByRole('button',{name:'Nuevo control',exact:true}).click()
  await page.getByLabel('Dentición visible').selectOption('temporary')
  await page.getByRole('button',{name:/^Pieza 55:/}).click()
  await brush(page,'Caries');await face(page,55,'Oclusal').click()
  await page.getByRole('button',{name:'Guardar historia y control',exact:true}).click()
  await expect(page.getByText('Historia y control odontológico guardados. Este control queda en modo lectura.')).toBeVisible()
  expect(state.record?.clinical.odontograms).toHaveLength(2);expect(state.record?.clinical.odontograms[0]).toEqual(first)
  await page.getByLabel('Control odontológico').selectOption(first.id)
  await expect(page.getByRole('group',{name:'Caras de la pieza 36',exact:true}).locator('[data-surface="center"]')).toHaveAttribute('fill','#cc4242')
  await page.getByRole('tab',{name:'Plan y evolución'}).click()
  await page.getByRole('button',{name:'Agregar tratamiento',exact:true}).click()
  await page.getByLabel('Pieza del tratamiento 1').selectOption('36')
  await page.getByLabel('Procedimiento indicado 1').fill('Tratamiento de prueba')
  await page.getByLabel('Estado del tratamiento 1').selectOption('completed')
  await page.getByRole('button',{name:'Agregar consulta',exact:true}).click()
  await page.getByLabel('Evaluación y procedimiento 1').fill('Evolución clínica de prueba')
  await page.getByRole('button',{name:'Guardar historia',exact:true}).click()
  await expect(page.getByText('Historia odontológica guardada.',{exact:true})).toBeVisible()
  expect(state.record?.clinical.treatmentPlan[0].status).toBe('completed');expect(state.record?.evolutions[0].procedure).toBe('Evolución clínica de prueba')
  const download=page.waitForEvent('download')
  await page.getByRole('button',{name:'Descargar ficha odontológica',exact:true}).click()
  const file=await download;expect(file.suggestedFilename()).toMatch(/Odontologia.*\.pdf$/);await file.saveAs(testInfo.outputPath('odontologia.pdf'))
  expect(state.requests.some(r=>r.name==='get_clinical_chart'&&r.args.p_export===true)).toBe(true)
  await page.getByRole('tab',{name:'Versiones y PDF'}).click()
  await expect(page.getByRole('button',{name:'Descargar PDF versión 1',exact:true})).toBeVisible()
})

test('dental painting stays usable on mobile and invalid controls remain editable',async({page},testInfo)=>{
  await page.setViewportSize({width:375,height:812})
  const state=await backend(page)
  await login(page);await page.goto(`/historias/nueva?paciente=${patientId}&especialidad=odontologia`)
  await page.getByRole('tab',{name:'Odontograma',exact:true}).click()
  await brush(page,'Caries');await face(page,36,'Oclusal').press('Enter')
  await brush(page,'Resina');await face(page,36,'Mesial').press('Space')
  await brush(page,'Amalgama');await face(page,36,'Distal').click()
  await page.getByRole('button',{name:'Borrador · una cara',exact:true}).click();await face(page,36,'Mesial').click()
  await expect(page.getByRole('group',{name:'Caras de la pieza 36',exact:true}).locator('[data-surface="mesial"]')).toHaveAttribute('fill','#fff')
  await page.getByRole('button',{name:'Deshacer última marca',exact:true}).click()
  await expect(page.getByRole('group',{name:'Caras de la pieza 36',exact:true}).locator('[data-surface="mesial"]')).toHaveAttribute('fill','#405ed6')
  await page.getByLabel('Fecha del odontograma').fill('')
  await page.getByRole('button',{name:'Guardar historia y control',exact:true}).click()
  await expect(page.getByLabel('Fecha del odontograma')).toHaveAttribute('aria-invalid','true')
  expect(state.requests.filter(r=>r.name==='save_clinical_chart')).toHaveLength(0)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:testInfo.outputPath('odontograma-mobile.png'),fullPage:true})
})

test('read-only and reception accounts cannot write or export dentistry',async({page})=>{
  const state=await backend(page,'read',true)
  await login(page);await page.goto(`/historias/${patientId}?especialidad=odontologia`)
  await expect(page.getByText('Podés consultar esta ficha. Tu cuenta no tiene permiso para modificarla.')).toBeVisible()
  await expect(page.getByRole('button',{name:'Guardar historia',exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Descargar ficha odontológica',exact:true})).toHaveCount(0)
  expect(state.requests.some(r=>r.name==='list_chart_versions')).toBe(false)
})

test('reception is stopped before requesting any dental clinical data',async({page})=>{
  const state=await backend(page,'reception',true)
  await login(page);await page.goto(`/historias/${patientId}?especialidad=odontologia`)
  await expect(page.getByText(/Tu cuenta no tiene acceso a historias clínicas de esta especialidad/)).toBeVisible()
  expect(state.requests.some(r=>r.name==='get_clinical_chart')).toBe(false)
})
