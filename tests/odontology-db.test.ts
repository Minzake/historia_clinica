import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { beforeAll,afterAll,describe,it,expect } from 'vitest'
import { applyMigration,applyIncrementalMigration } from '../scripts/migrate-db.mjs'
import { blankDentalRecord,blankOdontogram,paintMark } from '../src/modules/odontologia/model'
import type { DentalRecord,SavedDentalRecord } from '../src/modules/odontologia/model'
import { blankRecord } from '../src/modules/podologia/model'
import { patientIdentity } from '../src/core/types'

const owner='10000000-0000-4000-8000-000000000001',pro='10000000-0000-4000-8000-000000000002',reception='10000000-0000-4000-8000-000000000003',other='10000000-0000-4000-8000-000000000004',reader='10000000-0000-4000-8000-000000000005'
const clinic='20000000-0000-4000-8000-000000000001',clinic2='20000000-0000-4000-8000-000000000002'
let db:PGlite,patientId:string,current:SavedDentalRecord
const draft=blankDentalRecord();draft.patient.fullName='Paciente compartido';draft.patient.dni='22334455'
const control=blankOdontogram();control.marks=paintMark(paintMark(paintMark([],36,'caries',['center']),36,'resin',['mesial']),36,'amalgam',['distal']);draft.clinical.odontograms.push(control)
async function rpc<T=unknown>(name:string,args:unknown[]=[]):Promise<T>{return (await db.query<{result:T}>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)).rows[0].result}
async function as<T>(id:string,run:()=>Promise<T>){await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await run()}finally{await db.exec('reset role')}}
function data(record:DentalRecord){const {date,reason,allergies,medication,medicalNotes,dentalNotes}=record.patient;return {initial:{date,reason,allergies,medication,medicalNotes,dentalNotes},clinical:record.clinical,evolutions:record.evolutions}}
function save(record:DentalRecord,version=0,identityVersion=1){return rpc<SavedDentalRecord>('save_clinical_chart',[clinic,patientId,'odontologia',1,version,identityVersion,JSON.stringify(patientIdentity(record.patient)),JSON.stringify(data(record))])}
const access=(user:string,specialty:string,write=true,exporting=true,scope='all',practitioner=false)=>as(owner,()=>rpc('set_member_specialty_access',[clinic,user,specialty,true,write,exporting,scope,practitioner,'Profesional dental','MP-PRUEBA']))
beforeAll(async()=>{
 db=new PGlite({extensions:{btree_gist}})
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`)
 const client={query:async(sql:string,args?:unknown[])=>args?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]}}
 for(const file of ['202610210001_consultorio','202610210002_booking','202610210003_validation_rules','202610210004_specialty_core','202610210005_service_agendas','202610230006_odontology']){const source=readFileSync(new URL(`../supabase/migrations/${file}.sql`,import.meta.url),'utf8');if(file.includes('001_'))await applyMigration(client,source);else await applyIncrementalMigration(client,file,source)}
 for(const id of [owner,pro,reception,other,reader])await db.query('insert into auth.users values($1,$2,now())',[id,`${id}@example.test`])
 await db.query('insert into public.clinics(id) values($1),($2)',[clinic,clinic2])
 await db.query("insert into public.clinic_members(clinic_id,user_id,role) values($1,$2,'owner'),($1,$3,'professional'),($1,$4,'reception'),($5,$6,'owner'),($1,$7,'professional')",[clinic,owner,pro,reception,clinic2,other,reader])
 patientId=await as(owner,()=>rpc<string>('save_patient_identity',[clinic,null,0,JSON.stringify(patientIdentity(draft.patient))]))
},60000)
afterAll(async()=>{await db?.close()})
describe('odontology installation, privacy and immutable controls',()=>{
 it('does not grant access or open dentistry automatically',async()=>{
  expect((await db.query('select * from public.member_specialties')).rows).toHaveLength(0)
  expect((await db.query("select enabled from public.clinic_specialties where clinic_id=$1 and specialty_id='odontologia'",[clinic])).rows[0].enabled).toBe(false)
  await expect(as(owner,()=>save(draft))).rejects.toMatchObject({code:'42501'})
 })
 it('reuses an administrative patient and stores each face and server-author metadata',async()=>{
  await access(owner,'odontologia');current=await as(owner,()=>save(draft))
  expect(current.id).toBe(patientId);expect(current.clinical.odontograms[0].marks.map(m=>m.condition)).toEqual(['caries','resin','amalgam'])
  expect(current.clinical.odontograms[0].authorId).toBe(owner);expect(current.clinical.odontograms[0].recordedAt).toBeTruthy()
  expect((await db.query('select count(*)::integer as n from public.patients')).rows[0].n).toBe(1)
  expect((await as(reception,()=>rpc<{patients:{details:object}[]}>('list_patient_identities',[clinic,'',0]))).patients[0].details).not.toHaveProperty('odontograms')
 })
 it('keeps podology separate on the same identity and returns the correct chart links',async()=>{
  await access(owner,'podologia')
  const pod=blankRecord();pod.patient.fullName=draft.patient.fullName;pod.patient.dni=draft.patient.dni
  await as(owner,()=>rpc('save_patient_record',[clinic,patientId,0,JSON.stringify({...pod,identityVersion:1})]))
  const rows=await as(owner,()=>rpc<{patients:{chart_links:{specialtyId:string}[]}[]}>('list_clinical_patients',[clinic,'',0,12]))
  expect(rows.patients[0].chart_links.map(c=>c.specialtyId).sort()).toEqual(['odontologia','podologia'])
  await expect(as(pro,()=>rpc('get_clinical_chart',[patientId,'odontologia',false,clinic]))).rejects.toMatchObject({code:'42501'})
  await expect(as(reception,()=>rpc('get_clinical_chart',[patientId,'odontologia',false,clinic]))).rejects.toMatchObject({code:'42501'})
  await expect(as(other,()=>rpc('get_clinical_chart',[patientId,'odontologia',false,clinic2]))).rejects.toMatchObject({code:'42501'})
 })
 it('enforces assigned access, independent export permissions and clinical row security',async()=>{
  await access(pro,'odontologia',true,true,'assigned')
  await expect(as(pro,()=>rpc('get_clinical_chart',[patientId,'odontologia',false,clinic]))).rejects.toMatchObject({code:'42501'})
  await as(owner,()=>rpc('grant_chart_access',[clinic,current.chartId,pro,true,false,false]))
  expect((await as(pro,()=>rpc<SavedDentalRecord>('get_clinical_chart',[patientId,'odontologia',false,clinic]))).canWrite).toBe(false)
  await expect(as(pro,()=>save(current,1))).rejects.toMatchObject({code:'42501'})
  await expect(as(pro,()=>rpc('list_chart_versions',[patientId,'odontologia',clinic]))).rejects.toMatchObject({code:'42501'})
  await access(reader,'odontologia',false,false)
  await expect(as(reader,()=>rpc('get_clinical_chart',[patientId,'odontologia',true,clinic]))).rejects.toMatchObject({code:'42501'})
  expect((await as(reception,()=>db.query('select * from public.clinical_charts'))).rows).toHaveLength(0)
 })
 it('preserves saved controls and versions; rejects edits, removal and forged authors',async()=>{
  const copy=structuredClone(current);copy.clinical.odontograms[0].marks=[]
  await expect(as(owner,()=>save(copy,1))).rejects.toMatchObject({code:'22023'})
  copy.clinical.odontograms=[];await expect(as(owner,()=>save(copy,1))).rejects.toThrow('ODONTOGRAM_IMMUTABLE')
  const next=structuredClone(current);const fresh=blankOdontogram();fresh.marks=paintMark([],55,'sealant',['center']);fresh.authorId=other;next.clinical.odontograms.push(fresh)
  await expect(as(owner,()=>save(next,1))).rejects.toMatchObject({code:'22023'});delete fresh.authorId
  current=await as(owner,()=>save(next,1));expect(current.version).toBe(2)
  expect(current.clinical.odontograms[0].marks).toEqual(draft.clinical.odontograms[0].marks)
  const versions=await as(owner,()=>rpc<{id:number;version:number}[]>('list_chart_versions',[patientId,'odontologia',clinic]))
  const first=await as(owner,()=>rpc<SavedDentalRecord>('get_chart_revision',[patientId,versions.find(v=>v.version===1)!.id,clinic]))
  expect(first.clinical.odontograms).toHaveLength(1);expect(first.clinical.odontograms[0].marks).toEqual(draft.clinical.odontograms[0].marks)
 })
 it('rejects stale chart and identity versions without losing saved controls',async()=>{
  await expect(as(owner,()=>save(current,1))).rejects.toThrow('CONFLICT')
  await as(reception,()=>rpc('save_patient_identity',[clinic,patientId,1,JSON.stringify({...patientIdentity(current.patient),mobile:'1155551234'})]))
  const stale=structuredClone(current);stale.patient.fullName='Cambio con identidad vieja'
  await expect(as(owner,()=>save(stale,2))).rejects.toThrow('CONFLICT_IDENTITY')
  const latest=await as(owner,()=>rpc<SavedDentalRecord>('get_clinical_chart',[patientId,'odontologia',false,clinic]));expect(latest.version).toBe(2);expect(latest.patient.mobile).toBe('1155551234')
 })
 it('validates forged teeth, colours, faces and schema versions in the server',async()=>{
  const latest=await as(owner,()=>rpc<SavedDentalRecord>('get_clinical_chart',[patientId,'odontologia',false,clinic]))
  for(const bad of [{tooth:99},{condition:'inventado'},{faces:['all','center']},{color:'#123456'}]){
   const invalid=structuredClone(latest),fresh=blankOdontogram();fresh.marks=paintMark([],36,'caries',['center']);Object.assign(fresh.marks[0],bad);invalid.clinical.odontograms.push(fresh)
   await expect(as(owner,()=>save(invalid,2,latest.identityVersion))).rejects.toMatchObject({code:'22023'})
  }
 })
 it('changes one treating specialty without disabling the other',async()=>{
  await access(owner,'podologia',true,true,'all',true);await access(owner,'odontologia',true,true,'all',true)
  await access(owner,'odontologia',true,true,'all',false)
  const practitioners=await as(owner,()=>rpc<{user_id:string;specialty_ids:string[]}[]>('list_practitioners',[clinic]))
  expect(practitioners.find(p=>p.user_id===owner)?.specialty_ids).toEqual(['podologia'])
 })
})
