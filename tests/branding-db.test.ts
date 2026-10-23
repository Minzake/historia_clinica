import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { afterAll,beforeAll,describe,expect,it } from 'vitest'
import { applyMigration,applyIncrementalMigration } from '../scripts/migrate-db.mjs'
import { blankClinic } from '../src/core/clinic'

const clinic='20000000-0000-4000-8000-000000000001',otherClinic='20000000-0000-4000-8000-000000000002'
const owner='10000000-0000-4000-8000-000000000001',pro='10000000-0000-4000-8000-000000000002',reception='10000000-0000-4000-8000-000000000003',other='10000000-0000-4000-8000-000000000004'
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5G8AAAAASUVORK5CYII='
const settings={...blankClinic(),name:'Consultorio de prueba',email:'privado@example.test'}
let db:PGlite
async function rpc<T=any>(name:string,args:unknown[]=[]):Promise<T>{return (await db.query<{result:T}>(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,args)).rows[0].result}
async function as<T>(id:string|null,run:()=>Promise<T>):Promise<T>{await db.exec(`set role ${id?'authenticated':'anon'}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);try{return await run()}finally{await db.exec('reset role')}}
beforeAll(async()=>{
 db=new PGlite({extensions:{btree_gist}})
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`)
 const client={query:async(sql:string,args?:unknown[])=>args?db.query(sql,args):(await db.exec(sql)).at(-1)||{rows:[]}}
 for(const file of ['202610210001_consultorio','202610210002_booking','202610210003_validation_rules','202610210004_specialty_core','202610210005_service_agendas','202610230006_odontology']){const source=readFileSync(new URL(`../supabase/migrations/${file}.sql`,import.meta.url),'utf8');if(file.includes('001_'))await applyMigration(client,source);else await applyIncrementalMigration(client,file,source)}
 for(const id of [owner,pro,reception,other])await db.query('insert into auth.users values($1,$2,now())',[id,`${id}@example.test`])
 await db.query('insert into public.clinics(id,settings) values($1,$3),($2,$3)',[clinic,otherClinic,JSON.stringify(settings)])
 await db.query("insert into public.clinic_members(clinic_id,user_id,role) values($1,$2,'owner'),($1,$3,'professional'),($1,$4,'reception'),($5,$6,'owner')",[clinic,owner,pro,reception,otherClinic,other])
 const before=(await db.query('select * from public.clinics order by id')).rows
 const version='202610230007_branding'
 await applyIncrementalMigration(client,version,readFileSync(new URL(`../supabase/migrations/${version}.sql`,import.meta.url),'utf8'))
 expect((await db.query('select * from public.clinics order by id')).rows).toEqual(before)
},60000)
afterAll(async()=>{await db?.close()})
describe('clinic branding permissions and validation',()=>{
 it('publishes only visual identity, leaves the general login generic for multiple centers and denies raw table access',async()=>{
  const brand=await as(null,()=>rpc('get_clinic_branding',[clinic,null]))
  expect(brand).toEqual({clinicId:clinic,name:settings.name,logo:'',favicon:''})
  expect(brand).not.toHaveProperty('email')
  expect(await as(null,()=>rpc('get_clinic_branding'))).toBeNull()
  for(const id of [null,owner])await expect(as(id,()=>db.query('select * from public.clinic_branding'))).rejects.toMatchObject({code:'42501'})
 })
 it('denies changes by professionals, reception and owners from another center',async()=>{
  for(const id of [pro,reception,other])await expect(as(id,()=>rpc('save_clinic_profile',[clinic,1,JSON.stringify(settings),image,image]))).rejects.toMatchObject({code:'42501'})
  await expect(as(null,()=>rpc('save_clinic_profile',[clinic,1,JSON.stringify(settings),image,image]))).rejects.toMatchObject({code:'42501'})
  expect((await db.query('select * from public.clinic_branding')).rows).toHaveLength(0)
 })
 it('validates the actual PNG header, dimensions, size and trailer before changing settings',async()=>{
  const tooWide=Buffer.from(image.split(',')[1],'base64');tooWide.writeUInt32BE(1024,16)
  for(const bad of ['data:image/svg+xml;base64,PHN2Zy8+','https://images.example/logo.png',image.slice(0,-16),`data:image/png;base64,${tooWide.toString('base64')}`,`data:image/png;base64,${'A'.repeat(250000)}`,null]){
   await expect(as(owner,()=>rpc('save_clinic_profile',[clinic,1,JSON.stringify(settings),bad,'']))).rejects.toMatchObject({message:'INVALID_BRAND_IMAGE'})
  }
  expect((await db.query('select version from public.clinics where id=$1',[clinic])).rows[0].version).toBe(1)
 })
 it('saves identity atomically with settings, audits without image payloads, and rejects stale writes',async()=>{
  const saved=await as(owner,()=>rpc('save_clinic_profile',[clinic,1,JSON.stringify(settings),image,image]))
  expect(saved.version).toBe(2)
  expect(await as(null,()=>rpc('get_clinic_branding',[clinic,null]))).toMatchObject({logo:image,favicon:image})
  await expect(as(owner,()=>rpc('save_clinic_profile',[clinic,1,JSON.stringify({...settings,name:'Stale'}),'','']))).rejects.toMatchObject({message:'CONFLICT'})
  expect(await as(null,()=>rpc('get_clinic_branding',[clinic,null]))).toMatchObject({name:settings.name,logo:image})
  const events=(await db.query("select details from public.access_events where event='branding'")).rows
  expect(events).toEqual([{details:{hasLogo:true,hasFavicon:true}}])
 })
 it('preserves images through legacy settings writes and can restore the defaults',async()=>{
  await as(owner,()=>rpc('save_clinic_settings',[clinic,2,JSON.stringify(settings)]))
  expect(await as(null,()=>rpc('get_clinic_branding',[clinic,null]))).toMatchObject({logo:image})
  await as(owner,()=>rpc('save_clinic_profile',[clinic,3,JSON.stringify(settings),'','']))
  expect(await as(null,()=>rpc('get_clinic_branding',[clinic,null]))).toMatchObject({logo:'',favicon:''})
 })
})
