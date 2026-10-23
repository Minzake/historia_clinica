import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { blankEvolution, blankRecord } from '../src/lib/model'
import type { SavedRecord } from '../src/lib/model'
import { splitPodologyRecord } from '../src/modules/podologia/adapter'
import { applyMigration,applyIncrementalMigration } from '../scripts/migrate-db.mjs'

const owner='10000000-0000-4000-8000-000000000001', professional='10000000-0000-4000-8000-000000000002'
const reception='10000000-0000-4000-8000-000000000003', other='10000000-0000-4000-8000-000000000004'
const client='10000000-0000-4000-8000-000000000005',client2='10000000-0000-4000-8000-000000000006'
const clinic='20000000-0000-4000-8000-000000000001', clinic2='20000000-0000-4000-8000-000000000002'
let db:PGlite, legacy:SavedRecord, snapshots:unknown[]
let legacyAppointment:unknown,legacyEvents:unknown[],legacyNotices:unknown[]
const migrationClient={query:async(sql:string,args?:unknown[])=>args?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]}}
async function rpc<T=unknown>(name:string,args:unknown[]=[]):Promise<T> {
  return (await db.query<{result:T}>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)).rows[0].result
}
async function asUser<T>(id:string,run:()=>Promise<T>):Promise<T> {
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  try{return await run()}finally{await db.exec('reset role')}
}
beforeAll(async()=>{
  db=new PGlite({extensions:{btree_gist}})
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`)
  for(const version of ['001_consultorio','002_booking','003_validation_rules']) {
    const source=readFileSync(new URL(`../supabase/migrations/202610210${version}.sql`,import.meta.url),'utf8'),client=migrationClient
    if(version.startsWith('001'))await applyMigration(client,source)
    else await applyIncrementalMigration(client,`202610210${version}`,source)
  }
  for(const id of [owner,professional,reception,other,client,client2]) await db.query('insert into auth.users values($1,$2,now())',[id,`${id}@example.com`])
  await db.query('insert into public.clinics(id) values($1),($2)',[clinic,clinic2])
  await db.query("insert into public.clinic_members(user_id,clinic_id,role) values($1,$2,'owner'),($3,$2,'professional'),($4,$5,'owner')",[owner,clinic,professional,other,clinic2])
  const draft=blankRecord();draft.patient.fullName='Paciente legado';draft.patient.dni='12345678';draft.patient.medication='Dato clínico privado';draft.evolutions.push({...blankEvolution(),procedure:'Consulta original'})
  legacy=await asUser(owner,()=>rpc<SavedRecord>('save_patient_record',[clinic,null,0,JSON.stringify(draft)]))
  snapshots=(await db.query('select id,snapshot,recorded_at from public.clinical_record_versions order by id')).rows
  const futureDay=new Date(Date.now()+4*86400000).toISOString().slice(0,10)
  await db.query("insert into public.appointments(clinic_id,provider_id,contact_name,contact_dni,contact_email,source,starts_at,ends_at) values($1,$2,'Turno previo','78901234','test@example.com','staff',$3::timestamptz,$3::timestamptz+interval '30 minutes')",[clinic,professional,`${futureDay}T12:00:00Z`])
  legacyAppointment=(await db.query('select id,version,status,starts_at,ends_at from public.appointments')).rows[0]
  legacyEvents=(await db.query('select * from public.appointment_events')).rows
  legacyNotices=(await db.query('select * from private.appointment_notifications')).rows
  for(const version of ['004_specialty_core','005_service_agendas'])await applyIncrementalMigration(migrationClient,`202610210${version}`,readFileSync(new URL(`../supabase/migrations/202610210${version}.sql`,import.meta.url),'utf8'))
  await db.exec('set role service_role')
  try{await rpc('manage_team_member',[owner,reception,'reception',true,clinic])}finally{await db.exec('reset role')}
  await asUser(client,()=>rpc('save_patient_account',['Paciente web','23456789','',null]))
  await asUser(client2,()=>rpc('save_patient_account',['Paciente web dos','34567890','',null]))
},60000)
afterAll(async()=>{await db?.close()})

describe('specialty core migration and authorization',()=>{
  it('records migration checksums, avoids duplicate migration runs and rolls back failed migrations',async()=>{
    const client=migrationClient,source=readFileSync(new URL('../supabase/migrations/202610210004_specialty_core.sql',import.meta.url),'utf8')
    expect((await applyIncrementalMigration(client,'202610210004_specialty_core',source)).status).toBe('already-installed')
    await expect(applyIncrementalMigration(client,'202610210004_specialty_core',source+'\n-- changed')).rejects.toThrow('MIGRATION_CHECKSUM_CHANGED')
    await expect(applyIncrementalMigration(client,'test_failed_migration','begin;\ncreate table public.temporary_migration_test(id uuid);\nselect 1/0;\ncommit;')).rejects.toMatchObject({code:'22012'})
    expect((await db.query<{table:string|null}>("select to_regclass('public.temporary_migration_test')::text as table")).rows[0].table).toBeNull()
    expect((await db.query("select * from private.app_migrations where version='test_failed_migration'")).rows).toHaveLength(0)
  })
  it('does not rewrite appointments or create migration audit events and duplicate email jobs',async()=>{
    expect((await db.query('select id,version,status,starts_at,ends_at from public.appointments')).rows).toEqual([legacyAppointment])
    expect((await db.query('select * from public.appointment_events')).rows).toEqual(legacyEvents)
    expect((await db.query('select * from private.appointment_notifications')).rows).toEqual(legacyNotices)
  })
  it('preserves legacy patient, consultation and snapshot identifiers and content',async()=>{
    const current=await asUser(owner,()=>rpc<SavedRecord>('get_patient_record',[legacy.id]))
    expect(current.id).toBe(legacy.id);expect(current.patient).toEqual(legacy.patient);expect(current.evolutions).toEqual(legacy.evolutions)
    expect(current.specialtyId).toBe('podologia');expect(current.schemaVersion).toBe(1);expect(current.canWrite).toBe(true)
    expect((await db.query('select id,snapshot,recorded_at from public.clinical_chart_versions order by id')).rows).toEqual(snapshots)
    expect((await db.query('select id,snapshot,recorded_at from public.clinical_record_versions order by id')).rows).toEqual(snapshots)
  })
  it('gives reception administrative data without clinical fields or export paths',async()=>{
    await asUser(reception,async()=>{
      const identities=await rpc<{patients:{details:Record<string,unknown>}[]}>('list_patient_identities',[clinic])
      expect(identities.patients).toHaveLength(1)
      expect(JSON.stringify(identities)).not.toContain('Dato clínico privado')
      expect(identities.patients[0].details).not.toHaveProperty('photoConsent')
      expect(await rpc('list_patient_identities',[clinic,'12.345.678'])).toHaveProperty('count',1)
      expect(await rpc('list_patient_identities',[clinic,'...'])).toHaveProperty('count',0)
      expect((await db.query('select * from public.clinical_charts')).rows).toHaveLength(0)
      await expect(rpc('get_patient_record',[legacy.id])).rejects.toMatchObject({code:'42501'})
      await expect(rpc('list_chart_versions',[legacy.id])).rejects.toMatchObject({code:'42501'})
      await expect(rpc('get_chart_revision',[legacy.id,1])).rejects.toMatchObject({code:'42501'})
      await expect(db.query('select * from public.clinical_record_versions')).rejects.toMatchObject({code:'42501'})
    })
  })
  it('allows memberships in two centers without sharing their clinical access',async()=>{
    await db.exec('set role service_role')
    try{await rpc('manage_team_member',[other,professional,'professional',true,clinic2])}finally{await db.exec('reset role')}
    const memberships=await asUser(professional,()=>rpc<{clinicId:string}[]>('list_my_memberships'))
    expect(memberships.map(item=>item.clinicId)).toEqual([clinic,clinic2])
    await expect(asUser(professional,()=>rpc('get_clinical_chart',[legacy.id,'podologia',false,clinic2]))).rejects.toMatchObject({code:'42501'})
    await expect(asUser(professional,()=>rpc('list_chart_versions',[legacy.id,'podologia',clinic2]))).rejects.toMatchObject({code:'42501'})
    await expect(asUser(professional,()=>rpc('get_chart_revision',[legacy.id,1,clinic2]))).rejects.toMatchObject({code:'42501'})
    await asUser(other,async()=>{
      await expect(rpc('get_patient_record',[legacy.id])).rejects.toMatchObject({code:'42501'})
      await expect(rpc('list_patient_identities',[clinic])).rejects.toMatchObject({code:'42501'})
    })
  })
  it('keeps clinical and identity versions independent and detects stale identity changes',async()=>{
    let record=await asUser(owner,()=>rpc<SavedRecord>('get_patient_record',[legacy.id]))
    const envelope=splitPodologyRecord(record)
    envelope.data.clinical.usual='Cambio clínico'
    record=await asUser(owner,()=>rpc<SavedRecord>('save_clinical_chart',[clinic,record.id,'podologia',1,record.version,record.identityVersion,JSON.stringify(envelope.identity),JSON.stringify(envelope.data)]))
    expect(record.version).toBe(2);expect(record.identityVersion).toBe(1)
    await asUser(reception,()=>rpc('save_patient_identity',[clinic,record.id,record.identityVersion,JSON.stringify({...envelope.identity,address:'Dirección nueva'})]))
    const stale={...envelope.identity,address:'Dirección antigua reescrita'}
    await expect(asUser(owner,()=>rpc('save_clinical_chart',[clinic,record.id,'podologia',1,record.version,1,JSON.stringify(stale),JSON.stringify(envelope.data)]))).rejects.toMatchObject({message:'CONFLICT_IDENTITY'})
    const unchanged=await asUser(owner,()=>rpc<SavedRecord>('get_patient_record',[legacy.id]))
    expect(unchanged.version).toBe(2);expect(unchanged.identityVersion).toBe(2)
  })
  it('restricts assigned professionals and applies explicit grants and revocations immediately',async()=>{
    await asUser(owner,()=>rpc('set_member_specialty_access',[clinic,professional,'podologia',true,true,false,'assigned',true,'Profesional','MP123']))
    await expect(asUser(professional,()=>rpc('get_patient_record',[legacy.id]))).rejects.toMatchObject({code:'42501'})
    const record=await asUser(owner,()=>rpc<SavedRecord>('get_patient_record',[legacy.id]))
    await asUser(owner,()=>rpc('grant_chart_access',[clinic,record.chartId,professional,true,false,false]))
    const limited=await asUser(professional,()=>rpc<SavedRecord>('get_patient_record',[legacy.id]))
    expect(limited.canWrite).toBe(false);expect(limited.canExport).toBe(false)
    await expect(asUser(professional,()=>rpc('get_clinical_chart',[legacy.id,'podologia',true]))).rejects.toMatchObject({code:'42501'})
    await asUser(owner,()=>rpc('grant_chart_access',[clinic,record.chartId,professional,false,false,false]))
    await expect(asUser(professional,()=>rpc('get_patient_record',[legacy.id]))).rejects.toMatchObject({code:'42501'})
  })
  it('lets an administrative owner assign access without receiving clinical read permission',async()=>{
    await asUser(owner,()=>rpc('set_member_specialty_access',[clinic,owner,'podologia',false,false,false,'assigned',true,'Titular','']))
    try{
      const directory=await asUser(owner,()=>rpc<{patients:{id:string;chart_links:unknown[];assignment_charts:{id:string;name:string}[]}[]}>('list_patient_identities',[clinic]))
      const patient=directory.patients.find(item=>item.id===legacy.id)!
      expect(patient.chart_links).toEqual([])
      expect(patient.assignment_charts).toEqual([{id:legacy.chartId||legacy.id,name:'Podología'}])
      expect(JSON.stringify(directory)).not.toContain('Dato clínico privado')
      await expect(asUser(owner,()=>rpc('get_patient_record',[legacy.id]))).rejects.toMatchObject({code:'42501'})
      await asUser(owner,()=>rpc('grant_chart_access',[clinic,patient.assignment_charts[0].id,professional,true,false,false]))
      expect(await asUser(professional,()=>rpc<SavedRecord>('get_patient_record',[legacy.id]))).toHaveProperty('canWrite',false)
      const receptionDirectory=await asUser(reception,()=>rpc<{patients:{assignment_charts:unknown[]}[]}>('list_patient_identities',[clinic]))
      expect(receptionDirectory.patients.every(item=>item.assignment_charts.length===0)).toBe(true)
    }finally{
      await asUser(owner,()=>rpc('set_member_specialty_access',[clinic,owner,'podologia',true,true,true,'all',true,'Titular','']))
      await asUser(owner,()=>rpc('grant_chart_access',[clinic,legacy.id,professional,false,false,false]))
    }
  })
  it('rejects unknown modules, invalid questionnaires and clinical data in administrative fields atomically',async()=>{
    const record=await asUser(owner,()=>rpc<SavedRecord>('get_patient_record',[legacy.id])),envelope=splitPodologyRecord(record)
    for(const [specialty,version] of [['otra',1],['podologia',99]] as const){
      await expect(asUser(owner,()=>rpc('save_clinical_chart',[clinic,record.id,specialty,version,record.version,record.identityVersion,JSON.stringify(envelope.identity),JSON.stringify(envelope.data)]))).rejects.toMatchObject({code:'22023'})
    }
    envelope.data.initial.antecedents[0].id='modified'
    await expect(asUser(owner,()=>rpc('save_clinical_chart',[clinic,record.id,'podologia',1,record.version,record.identityVersion,JSON.stringify(envelope.identity),JSON.stringify(envelope.data)]))).rejects.toMatchObject({message:'QUESTIONNAIRE_INVALID'})
    await expect(asUser(reception,()=>rpc('save_patient_identity',[clinic,record.id,record.identityVersion,JSON.stringify({...envelope.identity,medication:'Hidden'})]))).rejects.toMatchObject({code:'22023'})
    expect((await asUser(owner,()=>rpc<SavedRecord>('get_patient_record',[legacy.id]))).version).toBe(record.version)
  })
  it('creates a clinical chart for an existing administrative patient without duplication',async()=>{
    const draft=blankRecord();draft.patient.fullName='Solo identidad';draft.patient.dni='45678901'
    const envelope=splitPodologyRecord(draft)
    const patientId=await asUser(reception,()=>rpc<string>('save_patient_identity',[clinic,null,0,JSON.stringify(envelope.identity)]))
    const created=await asUser(owner,()=>rpc<SavedRecord>('save_clinical_chart',[clinic,patientId,'podologia',1,0,1,JSON.stringify(envelope.identity),JSON.stringify(envelope.data)]))
    expect(created.id).toBe(patientId);expect(created.identityVersion).toBe(1)
    expect((await db.query('select id from public.patients where clinic_id=$1 and dni=$2',[clinic,'45678901'])).rows).toHaveLength(1)
    expect((await db.query('select * from public.clinical_records where patient_id=$1',[patientId])).rows).toHaveLength(0)
  })
  it('initializes future centers with closed podology agendas and no implicit clinical administrator access',async()=>{
    const newClinic='20000000-0000-4000-8000-000000000003'
    await db.query('insert into public.clinics(id) values($1)',[newClinic])
    await db.exec('set role service_role')
    try{await rpc('manage_team_member',[other,owner,'owner',true,clinic2])}finally{await db.exec('reset role')}
    const memberships=await asUser(owner,()=>rpc<{clinicId:string;specialties:unknown[]}[]>('list_my_memberships'))
    expect(memberships.find(member=>member.clinicId===clinic2)?.specialties).toEqual([])
    expect((await db.query<{enabled:boolean}>('select enabled from public.booking_pages where clinic_id=$1',[newClinic])).rows).toEqual([{enabled:false}])
    expect((await db.query('select * from public.services where clinic_id=$1',[newClinic])).rows).toHaveLength(1)
  })
})

describe('professional and service booking configuration',()=>{
  const day=new Date(Date.now()+4*86400000).toISOString().slice(0,10)
  const hours=Array.from({length:7},(_,weekday)=>({weekday,opens:'09:00',closes:'18:00'}))
  const rules={slug:'podologia-actual',enabled:true,provider_id:professional,provider_name:'Profesional',timezone:'America/Argentina/Buenos_Aires',advance_days:30,lead_minutes:0,cancel_hours:12}
  let legacyPage:string,defaultService:string,extendedService:string,extendedPage:string,appointmentId:string
  it('preserves legacy thirty-minute booking URLs and publishes independent professional pages',async()=>{
    const config=await asUser(owner,()=>rpc<{settings:{page_id:string;service_id:string;version:number}}>('get_booking_configuration',[clinic,null]))
    legacyPage=config.settings.page_id;defaultService=config.settings.service_id
    await asUser(owner,()=>rpc('save_booking_page',[clinic,legacyPage,config.settings.version,JSON.stringify({...rules,service_id:defaultService}),JSON.stringify(hours)]))
    extendedService=await asUser(owner,()=>rpc<string>('save_service',[clinic,null,0,JSON.stringify({specialty_id:'podologia',name:'Consulta extendida',duration_minutes:45,active:true})]))
    extendedPage=await asUser(owner,()=>rpc<string>('save_booking_page',[clinic,null,0,JSON.stringify({...rules,slug:'podologia-extendida',service_id:extendedService}),JSON.stringify(hours)]))
    await asUser(owner,()=>rpc('save_booking_page',[clinic,null,0,JSON.stringify({...rules,slug:'otra-profesional',provider_id:owner,service_id:defaultService}),JSON.stringify(hours)]))
    const pages=await rpc<{slug:string;duration_minutes:number}[]>('list_booking_pages')
    expect(pages.find(page=>page.slug==='podologia-actual')?.duration_minutes).toBe(30)
    expect(pages.find(page=>page.slug==='podologia-extendida')?.duration_minutes).toBe(45)
    await expect(asUser(owner,()=>rpc('save_service',[clinic,defaultService,1,JSON.stringify({specialty_id:'podologia',name:'Consulta',duration_minutes:45,active:true})]))).rejects.toMatchObject({message:'LEGACY_DURATION_FIXED'})
  })
  it('derives duration from the service and keeps professionals independent at the same time',async()=>{
    const start=`${day}T13:30:00Z`
    appointmentId=await asUser(client,()=>rpc<string>('book_appointment',['podologia-extendida',start]))
    const appointment=(await db.query<{starts_at:Date;ends_at:Date}>('select starts_at,ends_at from public.appointments where id=$1',[appointmentId])).rows[0]
    expect(Date.parse(String(appointment.ends_at))-Date.parse(String(appointment.starts_at))).toBe(45*60000)
    const slots=await rpc<string[]>('get_booking_slots',['podologia-actual',day])
    expect(slots.some(slot=>Date.parse(slot)===Date.parse(start))).toBe(false)
    await asUser(client2,()=>rpc('book_appointment',['otra-profesional',start]))
    await expect(asUser(client,()=>rpc('book_appointment',['podologia-actual',`${day}T15:00:00Z`]))).rejects.toMatchObject({message:'BOOKING_LIMIT'})
  })
  it('prevents cross-center professional overlaps using the stable user identity',async()=>{
    await expect(asUser(other,()=>rpc('save_staff_appointment',[clinic2,null,0,JSON.stringify({provider_id:professional,starts_at:`${day}T13:45:00Z`,duration_minutes:30,kind:'consultation',status:'confirmed',name:'Otro paciente',dni:'56789012'})]))).rejects.toMatchObject({code:'23P01'})
  })
  it('reschedules forty-five-minute appointments and preserves old URLs as aliases',async()=>{
    await asUser(client,()=>rpc('change_my_appointment',[appointmentId,1,`${day}T15:00:00Z`]))
    await asUser(owner,()=>rpc('save_booking_page',[clinic,extendedPage,1,JSON.stringify({...rules,slug:'podologia-extendida-nueva',service_id:extendedService}),JSON.stringify(hours)]))
    const oldSlots=await rpc<string[]>('get_booking_slots',['podologia-extendida',day]),newSlots=await rpc<string[]>('get_booking_slots',['podologia-extendida-nueva',day])
    expect(oldSlots).toEqual(newSlots)
    const mine=await asUser(client,()=>rpc<{id:string;can_reschedule:boolean;slug:string}[]>('get_my_appointments'))
    expect(mine.find(item=>item.id===appointmentId)).toMatchObject({can_reschedule:true,slug:'podologia-extendida-nueva'})
    await expect(asUser(owner,()=>rpc('save_booking_page',[clinic,null,0,JSON.stringify({...rules,slug:'podologia-extendida',service_id:defaultService}),JSON.stringify(hours)]))).rejects.toMatchObject({code:'23505'})
  })
  it('redacts appointment notes for reception and preserves them when reception updates a booking',async()=>{
    const id=await asUser(owner,()=>rpc<string>('save_staff_appointment',[clinic,null,0,JSON.stringify({provider_id:professional,starts_at:`${day}T17:00:00Z`,duration_minutes:30,kind:'consultation',status:'confirmed',name:'Paciente interno',dni:'67890123',notes:'Nota restringida'})]))
    const agenda=await asUser(reception,()=>rpc<{id:string;private_notes?:string}[]>('list_agenda',[clinic,`${day}T00:00:00Z`,`${day}T23:59:00Z`]))
    expect(agenda.find(item=>item.id===id)).not.toHaveProperty('private_notes')
    await asUser(reception,()=>rpc('save_staff_appointment',[clinic,id,1,JSON.stringify({provider_id:professional,starts_at:`${day}T17:30:00Z`,duration_minutes:30,kind:'consultation',status:'confirmed',name:'Paciente interno',dni:'67890123',notes:''})]))
    expect((await db.query<{private_notes:string}>('select private_notes from public.appointments where id=$1',[id])).rows[0].private_notes).toBe('Nota restringida')
    await expect(asUser(reception,()=>rpc('save_staff_appointment',[clinic,id,2,JSON.stringify({provider_id:professional,starts_at:`${day}T17:30:00Z`,duration_minutes:30,kind:'consultation',status:'confirmed',name:'Paciente interno',dni:'67890123',notes:'No autorizado'})]))).rejects.toMatchObject({code:'42501'})
  })
})
