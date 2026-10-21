import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { blankClinic, blankRecord } from '../src/lib/model'

const owner='10000000-0000-4000-8000-000000000001', professional='10000000-0000-4000-8000-000000000002'
const other='10000000-0000-4000-8000-000000000003', client='10000000-0000-4000-8000-000000000004'
const client2='10000000-0000-4000-8000-000000000005', unverified='10000000-0000-4000-8000-000000000006'
const clinic='20000000-0000-4000-8000-000000000001', clinic2='20000000-0000-4000-8000-000000000002'
let db:PGlite
let legacyPreserved=false
let legacyRescheduled=false
const day = new Date(Date.now()+3*86400000).toISOString().slice(0,10)
const start = `${day}T12:00:00+00:00`
const hours = Array.from({length:7},(_,weekday)=>({weekday,opens:'09:00',closes:'17:00'}))

async function asUser<T>(id:string, run:()=>Promise<T>):Promise<T> {
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  try { return await run() } finally { await db.exec('reset role') }
}
async function rpc<T=unknown>(name:string,args:unknown[]=[]):Promise<T> {
  const result=await db.query<{result:T}>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)
  return result.rows[0].result
}
async function openBooking() {
  const version=(await db.query<{version:number}>('select version from public.booking_settings where clinic_id=$1',[clinic])).rows[0].version
  await asUser(owner,()=>rpc('save_booking_settings',[clinic,version,JSON.stringify({slug:'consultorio',enabled:true,provider_id:professional,provider_name:'Profesional',timezone:'America/Argentina/Buenos_Aires',advance_days:30,lead_minutes:60,cancel_hours:12}),JSON.stringify(hours)]))
}
beforeAll(async()=>{
  db=new PGlite({extensions:{btree_gist}})
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`)
  await db.exec(readFileSync(new URL('../supabase/migrations/202610210001_consultorio.sql',import.meta.url),'utf8'))
  for(const id of [owner,professional,other,client,client2,unverified]) await db.query('insert into auth.users values($1,$2,$3)',[id,`${id}@example.com`,id===unverified?null:new Date().toISOString()])
  await db.query('insert into public.clinics(id) values($1),($2)',[clinic,clinic2])
  await db.query("insert into public.clinic_members(user_id,clinic_id,role) values($1,$2,'owner'),($3,$2,'professional'),($4,$5,'owner')",[owner,clinic,professional,other,clinic2])
  await db.exec(readFileSync(new URL('../supabase/migrations/202610210002_booking.sql',import.meta.url),'utf8'))
  await db.query("insert into public.appointments(clinic_id,provider_id,contact_name,contact_dni,source,starts_at,ends_at) values($1,$2,'Legacy Uno','34567890','staff',$3::timestamptz,$3::timestamptz+interval '30 minutes'),($1,$2,'Legacy Dos','34567890','staff',$3::timestamptz+interval '1 hour',$3::timestamptz+interval '90 minutes')",[clinic,professional,start])
  await db.exec(readFileSync(new URL('../supabase/migrations/202610210003_validation_rules.sql',import.meta.url),'utf8'))
  legacyPreserved=(await db.query<{count:number}>("select count(*)::integer as count from public.appointments where contact_dni='34567890' and status='confirmed' and version=1")).rows[0].count===2
  const legacy=(await db.query<{id:string}>("select id from public.appointments where contact_name='Legacy Uno'")).rows[0]
  await asUser(owner,()=>rpc('save_staff_appointment',[clinic,legacy.id,1,JSON.stringify({provider_id:professional,starts_at:`${day}T14:00:00Z`,duration_minutes:30,name:'Legacy Uno',dni:'34567890',kind:'consultation',status:'confirmed'})]))
  legacyRescheduled=(await db.query<{count:number}>("select count(*)::integer as count from public.appointments where contact_dni='34567890' and status='confirmed'")).rows[0].count===2
  await asUser(client,()=>rpc('save_patient_account',['Paciente Uno','12345678','']))
  await asUser(client2,()=>rpc('save_patient_account',['Paciente Dos','23456789','1122334455']))
},60000)
beforeEach(async()=>{
  await db.exec('truncate public.appointments cascade; delete from public.booking_hours; update public.booking_settings set enabled=false,version=version+1;')
  await db.query('update public.clinic_members set active=true where user_id=$1',[professional])
})
afterAll(async()=>{await db?.close()})

describe('patient accounts, appointments and staff authorization',()=>{
  it('installs validation rules without changing or cancelling legacy duplicate bookings',()=>{
    expect(legacyPreserved).toBe(true)
    expect(legacyRescheduled).toBe(true)
  })
  it('starts closed and exposes no clinician or patient data through public availability',async()=>{
    await db.exec('set role anon')
    try {
      expect(await rpc('list_booking_pages')).toEqual([])
      expect(await rpc('get_booking_slots',['consultorio',day])).toEqual([])
      await expect(db.query('select * from public.patient_accounts')).rejects.toMatchObject({code:'42501'})
      await expect(db.query('select * from public.appointments')).rejects.toMatchObject({code:'42501'})
    }finally{await db.exec('reset role')}
  })
  it('requires verified email and prevents using signup metadata as staff authorization',async()=>{
    await asUser(unverified,async()=>{
      await expect(rpc('save_patient_account',['No verificado','34567890',''])).rejects.toMatchObject({code:'42501'})
      await expect(rpc('list_agenda',[clinic,start,`${day}T23:00:00Z`])).rejects.toMatchObject({code:'42501'})
    })
    await asUser(client,async()=>{
      await expect(db.query("insert into public.clinic_members(user_id,clinic_id,role) values($1,$2,'owner')",[client,clinic])).rejects.toMatchObject({code:'42501'})
      await expect(rpc('manage_team_member',[client,client,'owner',true,clinic])).rejects.toMatchObject({code:'42501'})
      await expect(rpc('list_team',[clinic])).rejects.toMatchObject({code:'42501'})
    })
  })
  it('only allows owners to publish a schedule and rejects overlapping opening hours',async()=>{
    const settings={slug:'consultorio',enabled:true,provider_id:professional,provider_name:'Profesional',timezone:'America/Argentina/Buenos_Aires',advance_days:30,lead_minutes:60,cancel_hours:12}
    const v=(await db.query<{version:number}>('select version from public.booking_settings where clinic_id=$1',[clinic])).rows[0].version
    await asUser(professional,async()=>{await expect(rpc('save_booking_settings',[clinic,v,JSON.stringify(settings),JSON.stringify(hours)])).rejects.toMatchObject({code:'42501'})})
    await asUser(owner,async()=>{await expect(rpc('save_booking_settings',[clinic,v,JSON.stringify(settings),JSON.stringify([...hours,{weekday:0,opens:'10:00',closes:'12:00'}])])).rejects.toMatchObject({code:'22023'})})
    expect((await db.query('select * from public.booking_hours')).rows).toHaveLength(0)
  })
  it('automatically confirms exactly 30 minutes and atomically queues an email without medical data',async()=>{
    await openBooking()
    const id=await asUser(client,()=>rpc<string>('book_appointment',['consultorio',start]))
    const a=(await db.query<{source:string;status:string;minutes:number}>('select source,status,extract(epoch from (ends_at-starts_at))/60 as minutes from public.appointments where id=$1',[id])).rows[0]
    expect(a.source).toBe('web');expect(a.status).toBe('confirmed');expect(Number(a.minutes)).toBe(30)
    const notification=(await db.query<{payload:Record<string,unknown>}>('select payload from private.appointment_notifications where appointment_id=$1',[id])).rows[0]
    expect(notification.payload.event).toBe('confirmed')
    expect(notification.payload).not.toHaveProperty('dni');expect(notification.payload).not.toHaveProperty('private_notes')
    expect((await db.query('select * from public.appointment_events where appointment_id=$1',[id])).rows).toHaveLength(1)
  })
  it('prevents overlapping reservations but allows adjacent slots',async()=>{
    await openBooking()
    await asUser(client,()=>rpc('book_appointment',['consultorio',start]))
    await asUser(client2,async()=>{await expect(rpc('book_appointment',['consultorio',start])).rejects.toMatchObject({code:'22023'})})
    await asUser(client2,()=>rpc('book_appointment',['consultorio',`${day}T12:30:00Z`]))
    await expect(db.query("insert into public.appointments(clinic_id,provider_id,contact_name,contact_dni,source,starts_at,ends_at) values($1,$2,'Colision','34567890','staff',$3::timestamptz,$3::timestamptz+interval '45 minutes')",[clinic,professional,start])).rejects.toMatchObject({code:'23P01'})
  })
  it('extended staff appointments and blocks remove every overlapping public slot',async()=>{
    await openBooking()
    const data={provider_id:professional,starts_at:start,duration_minutes:90,name:'Consulta extendida',dni:'34567890',kind:'consultation',status:'confirmed'}
    await asUser(owner,()=>rpc('save_staff_appointment',[clinic,null,0,JSON.stringify(data)]))
    const slots=await rpc<string[]>('get_booking_slots',['consultorio',day])
    expect(slots.some((slot)=>Date.parse(slot)>=Date.parse(start)&&Date.parse(slot)<Date.parse(start)+90*60000)).toBe(false)
    expect(slots.some((slot)=>Date.parse(slot)===Date.parse(start)+90*60000)).toBe(true)
  })
  it('isolates patient portals and never grants access to a clinical history based on DNI',async()=>{
    await openBooking()
    await asUser(client,()=>rpc('book_appointment',['consultorio',start]))
    await asUser(client2,async()=>{
      expect(await rpc('get_my_appointments')).toEqual([])
      expect((await db.query('select * from public.patient_accounts')).rows).toHaveLength(1)
      expect((await db.query('select * from public.patients')).rows).toHaveLength(0)
      await expect(rpc('list_agenda',[clinic,start,`${day}T23:00:00Z`])).rejects.toMatchObject({code:'42501'})
    })
    await asUser(client,async()=>{
      const appointments=await rpc<Record<string,unknown>[]>('get_my_appointments')
      expect(appointments).toHaveLength(1);expect(appointments[0]).not.toHaveProperty('private_notes');expect(appointments[0]).not.toHaveProperty('patient_id')
    })
  })
  it('can reschedule or cancel an own web appointment and retains audit plus notification history',async()=>{
    await openBooking()
    const id=await asUser(client,()=>rpc<string>('book_appointment',['consultorio',start]))
    await asUser(client,()=>rpc('change_my_appointment',[id,1,`${day}T14:00:00Z`]))
    await asUser(client2,async()=>{await expect(rpc('change_my_appointment',[id,2,null])).rejects.toMatchObject({code:'42501'})})
    await asUser(client,()=>rpc('change_my_appointment',[id,2,null]))
    expect((await db.query<{status:string}>('select status from public.appointments where id=$1',[id])).rows[0].status).toBe('cancelled')
    expect((await db.query('select * from public.appointment_events where appointment_id=$1',[id])).rows).toHaveLength(3)
    expect((await db.query<{state:string}>('select state from private.appointment_notifications where appointment_id=$1 and version=1',[id])).rows[0].state).toBe('superseded')
  })
  it('revoking a professional immediately blocks clinical RPCs and web availability',async()=>{
    await openBooking()
    await db.exec('set role service_role')
    try{await rpc('manage_team_member',[owner,professional,'professional',false,clinic])}finally{await db.exec('reset role')}
    await asUser(professional,async()=>{
      await expect(rpc('list_agenda',[clinic,start,`${day}T23:00:00Z`])).rejects.toMatchObject({code:'42501'})
      expect((await db.query('select * from public.patients')).rows).toHaveLength(0)
    })
    expect(await rpc('list_booking_pages')).toEqual([])
  })
  it('protects the last owner and scopes notification dispatch to the verified actor',async()=>{
    await openBooking()
    const id=await asUser(client,()=>rpc<string>('book_appointment',['consultorio',start]))
    await db.exec('set role service_role')
    try{
      await expect(rpc('manage_team_member',[owner,owner,'professional',true,clinic])).rejects.toMatchObject({code:'22023'})
      expect(await rpc('claim_appointment_notifications',[client2,id,10])).toEqual([])
      expect((await rpc<unknown[]>('claim_appointment_notifications',[client,id,10]))).toHaveLength(1)
      expect(await rpc('claim_appointment_notifications',[client,id,10])).toEqual([])
    }finally{await db.exec('reset role')}
  })
  it('allows only one active reservation per professional and rejects unpublished slots',async()=>{
    await openBooking()
    await asUser(client,async()=>{
      await expect(rpc('book_appointment',['consultorio',`${day}T12:15:00Z`])).rejects.toMatchObject({code:'22023'})
      await expect(rpc('book_appointment',['consultorio',`${day}T23:00:00Z`])).rejects.toMatchObject({code:'22023'})
      await rpc('book_appointment',['consultorio',start])
      await expect(rpc('book_appointment',['consultorio',`${day}T13:00:00Z`])).rejects.toMatchObject({message:'BOOKING_LIMIT'})
      await expect(rpc('book_appointment',['consultorio',`${day}T15:00:00Z`])).rejects.toMatchObject({message:'BOOKING_LIMIT'})
    })
  })
  it('counts manual DNI reservations without exposing or automatically linking them to a patient account',async()=>{
    await openBooking()
    const data={provider_id:professional,starts_at:start,duration_minutes:30,name:'Paciente manual',dni:'12345678',kind:'consultation',status:'confirmed'}
    await asUser(owner,()=>rpc('save_staff_appointment',[clinic,null,0,JSON.stringify(data)]))
    await asUser(client,async()=>{
      expect(await rpc('get_my_appointments')).toEqual([])
      await expect(rpc('book_appointment',['consultorio',`${day}T14:00:00Z`])).rejects.toMatchObject({message:'BOOKING_LIMIT'})
    })
    expect((await db.query('select client_user_id,patient_id from public.appointments')).rows[0]).toEqual({client_user_id:null,patient_id:null})
    await asUser(owner,async()=>{
      await expect(rpc('save_staff_appointment',[clinic,null,0,JSON.stringify({...data,starts_at:`${day}T15:00:00Z`})])).rejects.toMatchObject({message:'BOOKING_LIMIT'})
      await rpc('save_staff_appointment',[clinic,null,0,JSON.stringify({...data,provider_id:owner})])
    })
    expect((await db.query('select * from public.appointments')).rows).toHaveLength(2)
  })
  it('rejects a second linked staff appointment but allows a different professional',async()=>{
    await openBooking()
    await asUser(client,()=>rpc('book_appointment',['consultorio',start]))
    const data={provider_id:professional,client_user_id:client,starts_at:`${day}T14:00:00Z`,duration_minutes:30,name:'Paciente vinculado',kind:'consultation',status:'confirmed'}
    await asUser(owner,async()=>{
      await expect(rpc('save_staff_appointment',[clinic,null,0,JSON.stringify(data)])).rejects.toMatchObject({message:'BOOKING_LIMIT'})
      await rpc('save_staff_appointment',[clinic,null,0,JSON.stringify({...data,provider_id:owner})])
    })
    const appointments=await asUser(client,()=>rpc<{id:string;version:number;provider_id:string;advance_days:number;can_reschedule:boolean}[]>('get_my_appointments'))
    expect(new Set(appointments.map(a=>a.provider_id)).size).toBe(2)
    expect(appointments.find(a=>a.provider_id===professional)).toMatchObject({advance_days:30,can_reschedule:true})
    expect(appointments.find(a=>a.provider_id===owner)).toMatchObject({can_reschedule:false})
    const otherAppointment=appointments.find(a=>a.provider_id===owner)!
    await asUser(owner,async()=>{
      await expect(rpc('save_staff_appointment',[clinic,otherAppointment.id,otherAppointment.version,JSON.stringify({...data,starts_at:`${day}T15:00:00Z`})])).rejects.toMatchObject({message:'BOOKING_LIMIT'})
    })
  })
  it('rejects repeated submissions and releases the limit after cancellation',async()=>{
    await openBooking()
    const attempts=await asUser(client,()=>Promise.allSettled([
      rpc<string>('book_appointment',['consultorio',start]),
      rpc<string>('book_appointment',['consultorio',`${day}T14:00:00Z`]),
    ]))
    expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1)
    expect(attempts.find(a=>a.status==='rejected')).toMatchObject({reason:{message:'BOOKING_LIMIT'}})
    const booked=attempts.find(a=>a.status==='fulfilled')!
    if(booked.status!=='fulfilled')throw new Error('Missing booking')
    await asUser(client,()=>rpc('change_my_appointment',[booked.value,1,null]))
    await asUser(client,()=>rpc('book_appointment',['consultorio',`${day}T15:00:00Z`]))
    expect((await db.query("select * from public.appointments where status='confirmed'")).rows).toHaveLength(1)
  })
  it('does not count past appointments and requires DNI only for future confirmed consultations',async()=>{
    await openBooking()
    const data={provider_id:professional,starts_at:new Date(Date.now()-86400000).toISOString(),duration_minutes:30,name:'Historia de turno',kind:'consultation',status:'confirmed'}
    await asUser(owner,async()=>{
      await rpc('save_staff_appointment',[clinic,null,0,JSON.stringify({...data,dni:'12345678'})])
      await expect(rpc('save_staff_appointment',[clinic,null,0,JSON.stringify({...data,starts_at:start})])).rejects.toMatchObject({message:'APPOINTMENT_DNI_REQUIRED'})
      await rpc('save_staff_appointment',[clinic,null,0,JSON.stringify({...data,starts_at:start,kind:'block'})])
    })
    await asUser(client,()=>rpc('book_appointment',['consultorio',`${day}T14:00:00Z`]))
  })
  it('rejects reactivating a cancelled appointment when another active one exists',async()=>{
    await openBooking()
    const id=await asUser(client,()=>rpc<string>('book_appointment',['consultorio',start]))
    await asUser(client,()=>rpc('change_my_appointment',[id,1,null]))
    await asUser(client,()=>rpc('book_appointment',['consultorio',`${day}T14:00:00Z`]))
    const data={provider_id:professional,client_user_id:client,starts_at:start,duration_minutes:30,name:'Paciente Uno',status:'confirmed',kind:'consultation'}
    await asUser(owner,async()=>{await expect(rpc('save_staff_appointment',[clinic,id,2,JSON.stringify(data)])).rejects.toMatchObject({message:'BOOKING_LIMIT'})})
  })
  it('rejects invalid block attendance states and malformed clinic email',async()=>{
    const data={provider_id:professional,starts_at:new Date(Date.now()-86400000).toISOString(),duration_minutes:30,kind:'block',status:'completed'}
    await asUser(owner,async()=>{
      await expect(rpc('save_staff_appointment',[clinic,null,0,JSON.stringify(data)])).rejects.toMatchObject({message:'INVALID_BLOCK_STATUS'})
      await expect(rpc('save_clinic_settings',[clinic,1,JSON.stringify({...blankClinic(),name:'Consultorio',email:'invalid-email'})])).rejects.toMatchObject({message:'INVALID_EMAIL'})
    })
  })
  it('rejects duplicate, missing or relabelled questionnaire entries without saving a clinical record',async()=>{
    const record=blankRecord();record.patient.fullName='Paciente de prueba'
    record.patient.antecedents[1]={...record.patient.antecedents[0]}
    await asUser(owner,async()=>{
      await expect(rpc('save_patient_record',[clinic,null,0,JSON.stringify(record)])).rejects.toMatchObject({message:'QUESTIONNAIRE_INVALID'})
      record.patient=blankRecord().patient;record.patient.fullName='Paciente de prueba'
      record.patient.vaccines[0].label='Pregunta modificada'
      await expect(rpc('save_patient_record',[clinic,null,0,JSON.stringify(record)])).rejects.toMatchObject({message:'QUESTIONNAIRE_INVALID'})
    })
    expect((await db.query('select * from public.patients')).rows).toHaveLength(0)
  })
  it('accepts canonical clinical questionnaires with all incremental validations installed',async()=>{
    const record=blankRecord();record.patient.fullName='Paciente de prueba'
    const saved=await asUser(owner,()=>rpc<{id:string;patient:typeof record.patient}>('save_patient_record',[clinic,null,0,JSON.stringify(record)]))
    expect(saved.patient.antecedents).toEqual(record.patient.antecedents)
    expect(saved.patient.vaccines).toEqual(record.patient.vaccines)
    await db.query('delete from public.clinical_record_versions where patient_id=$1',[saved.id])
    await db.query('delete from public.clinical_records where patient_id=$1',[saved.id])
    await db.query('delete from public.patients where id=$1',[saved.id])
  })
  it('enforces cancellation deadlines and prevents stale versions from changing a booking',async()=>{
    await openBooking()
    const id=await asUser(client,()=>rpc<string>('book_appointment',['consultorio',start]))
    await asUser(client,async()=>{await expect(rpc('change_my_appointment',[id,99,null])).rejects.toMatchObject({message:'CONFLICT'})})
    await db.query("update public.appointments set starts_at=now()+interval '1 hour',ends_at=now()+interval '90 minutes',version=version+1 where id=$1",[id])
    await asUser(client,async()=>{await expect(rpc('change_my_appointment',[id,2,null])).rejects.toMatchObject({message:'CHANGE_DEADLINE'})})
  })
  it('does not let a patient choose a custom duration through staff RPCs or change their DNI',async()=>{
    await asUser(client,async()=>{
      await expect(rpc('save_staff_appointment',[clinic,null,0,JSON.stringify({provider_id:professional,starts_at:start,duration_minutes:90,name:'Fake staff'})])).rejects.toMatchObject({code:'42501'})
      await expect(rpc('save_patient_account',['Otro DNI','34567890',''])).rejects.toMatchObject({message:'DNI_IMMUTABLE'})
    })
  })
  it('lets staff explicitly assign an extended appointment to a known verified account, without linking clinical records',async()=>{
    await openBooking()
    await asUser(client,()=>rpc('save_patient_account',['Paciente Uno','12345678','','consultorio']))
    const contacts=await asUser(owner,()=>rpc<{user_id:string}[]>('search_registered_patients',[clinic,'12345678']))
    expect(contacts.map((item)=>item.user_id)).toEqual([client])
    const data={provider_id:professional,client_user_id:client,starts_at:start,duration_minutes:90,name:'Datos no confiables',dni:'99999999',email:'attacker@example.com',kind:'consultation',status:'confirmed'}
    await asUser(owner,()=>rpc('save_staff_appointment',[clinic,null,0,JSON.stringify(data)]))
    await asUser(client,async()=>{
      const appointments=await rpc<{source:string;starts_at:string;ends_at:string}[]>('get_my_appointments')
      expect(appointments).toHaveLength(1);expect(appointments[0].source).toBe('staff')
      expect(Date.parse(appointments[0].ends_at)-Date.parse(appointments[0].starts_at)).toBe(90*60000)
      await expect(rpc('search_registered_patients',[clinic,''])).rejects.toMatchObject({code:'42501'})
    })
    const actual=(await db.query<{contact_dni:string;contact_email:string;patient_id:string|null}>('select contact_dni,contact_email,patient_id from public.appointments')).rows[0]
    expect(actual.contact_dni).toBe('12345678');expect(actual.contact_email).not.toBe('attacker@example.com');expect(actual.patient_id).toBeNull()
    expect(await asUser(other,()=>rpc('search_registered_patients',[clinic2,'']))).toEqual([])
    await asUser(other,async()=>{await expect(rpc('save_staff_appointment',[clinic2,null,0,JSON.stringify({...data,provider_id:other})])).rejects.toMatchObject({code:'42501'})})
  })
})
