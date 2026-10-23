-- Odontology is installed without granting clinical access or publishing any agenda.
begin;
insert into public.specialties values('odontologia','Odontología');
insert into public.specialty_schemas values('odontologia',1);
insert into public.clinic_specialties select id,'odontologia',false from public.clinics;
alter table public.practitioner_specialties add column active boolean not null default true;
update public.practitioner_specialties ps set active=cp.active from public.clinic_practitioners cp where cp.clinic_id=ps.clinic_id and cp.user_id=ps.user_id;

create function private.initialize_odontology() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.clinic_specialties values(new.id,'odontologia',false);return new;end;$$;
revoke all on function private.initialize_odontology() from public,anon,authenticated;
create trigger clinic_01_odontology after insert on public.clinics for each row execute function private.initialize_odontology();

create function private.valid_dental_tooth(p_tooth jsonb) returns boolean language sql immutable set search_path='' as $$
select jsonb_typeof(p_tooth)='number' and p_tooth::text~'^([1-4][1-8]|[5-8][1-5])$';$$;
create function private.validate_odontology_v1(p_identity jsonb,p_data jsonb) returns void language plpgsql set search_path='' as $$
declare p jsonb:=private.normalize_patient_identity(p_identity);i jsonb;c jsonb;o jsonb;m jsonb;t jsonb;e jsonb;f text;v_birth date;v_date date;v_keys text[];v_marks text[];v_seen text[];v_ids text[];v_key text;v_tooth text;v_faces text[];v_condition text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>2000000 or exists(select 1 from jsonb_object_keys(p_data) k where k<>all(array['initial','clinical','evolutions'])) then raise exception 'Invalid dental structure' using errcode='22023';end if;
  i:=p_data->'initial';c:=p_data->'clinical';
  if jsonb_typeof(i) is distinct from 'object' or jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(p_data->'evolutions') is distinct from 'array'
    or exists(select 1 from jsonb_object_keys(i) k where k<>all(array['date','reason','allergies','medication','medicalNotes','dentalNotes']))
    or exists(select 1 from jsonb_object_keys(c) k where k<>all(array['odontograms','treatmentPlan'])) then raise exception 'Invalid dental structure' using errcode='22023';end if;
  foreach f in array array['date','reason','allergies','medication','medicalNotes','dentalNotes'] loop
    if jsonb_typeof(i->f) is distinct from 'string' or length(i->>f)>2000 then raise exception 'Invalid dental field' using errcode='22023';end if;
  end loop;
  v_birth:=nullif(p->>'birthDate','')::date;
  if i->>'date'!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid dental date' using errcode='22023';end if;
  v_date:=(i->>'date')::date;
  if v_date>current_date or v_date<v_birth then raise exception 'Invalid dental date' using errcode='22023';end if;
  if jsonb_typeof(c->'odontograms') is distinct from 'array' or jsonb_array_length(c->'odontograms')>100 or jsonb_typeof(c->'treatmentPlan') is distinct from 'array' or jsonb_array_length(c->'treatmentPlan')>500 or jsonb_array_length(p_data->'evolutions')>500 then raise exception 'Invalid dental collections' using errcode='22023';end if;
  v_ids:=array[]::text[];
  for o in select value from jsonb_array_elements(c->'odontograms') loop
    if jsonb_typeof(o) is distinct from 'object' or coalesce(o->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or o->>'id'=any(v_ids)
      or o->'legendVersion' is distinct from '1'::jsonb or coalesce(o->>'view','') not in ('mixed','permanent','temporary') or jsonb_typeof(o->'notes') is distinct from 'string' or length(o->>'notes')>2000
      or jsonb_typeof(o->'marks') is distinct from 'array' or jsonb_array_length(o->'marks')>520 or exists(select 1 from jsonb_object_keys(o) k where k<>all(array['id','date','legendVersion','view','notes','marks','authorId','authorName','recordedAt'])) then raise exception 'Invalid odontogram' using errcode='22023';end if;
    v_ids:=array_append(v_ids,o->>'id');
    if coalesce(o->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or (o->>'date')::date>current_date or (o->>'date')::date<v_birth or (jsonb_array_length(o->'marks')=0 and btrim(o->>'notes')='') then raise exception 'Invalid odontogram date or content' using errcode='22023';end if;
    v_seen:=array[]::text[];v_marks:=array[]::text[];
    for m in select value from jsonb_array_elements(o->'marks') loop
      if jsonb_typeof(m) is distinct from 'object' or coalesce(m->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or m->>'id'=any(v_seen)
        or private.valid_dental_tooth(m->'tooth') is distinct from true or jsonb_typeof(m->'note') is distinct from 'string' or length(m->>'note')>500 or jsonb_typeof(m->'faces') is distinct from 'array' or jsonb_array_length(m->'faces') not between 1 and 5
        or exists(select 1 from jsonb_object_keys(m) k where k<>all(array['id','tooth','condition','faces','note'])) then raise exception 'Invalid dental mark' using errcode='22023';end if;
      v_seen:=array_append(v_seen,m->>'id');v_condition:=m->>'condition';v_tooth:=m->>'tooth';
      if coalesce(v_condition,'') not in ('healthy','caries','resin','amalgam','crown_fit','crown_unfit','prosthesis','prosthesis_plan','sealant','sealant_plan','endodontic','necrosis','extraction_plan','recession','absent') then raise exception 'Invalid dental condition' using errcode='22023';end if;
      if exists(select 1 from jsonb_array_elements(m->'faces') x where jsonb_typeof(x)<>'string' or x#>>'{}'<>all(array['all','vestibular','inner','mesial','distal','center']))
        or (select count(*)<>count(distinct value) from jsonb_array_elements(m->'faces')) or (m->'faces'?'all' and jsonb_array_length(m->'faces')<>1) then raise exception 'Invalid dental faces' using errcode='22023';end if;
      select array_agg(value) into v_faces from jsonb_array_elements_text(m->'faces');
      if v_condition in ('caries','resin','amalgam','sealant','sealant_plan') then
        if 'all'=any(v_faces) then v_faces:=array['vestibular','inner','mesial','distal','center'];end if;
        select array_agg(v_tooth||':'||x) into v_keys from unnest(v_faces) x;
      else
        if m->'faces'<>'["all"]'::jsonb then raise exception 'Invalid whole tooth mark' using errcode='22023';end if;
        v_keys:=array[v_tooth||':'||v_condition];
      end if;
      foreach v_key in array v_keys loop
        if v_key=any(v_marks) then raise exception 'Overlapping dental marks' using errcode='22023';end if;v_marks:=array_append(v_marks,v_key);
      end loop;
      if v_condition='healthy' and exists(select 1 from jsonb_array_elements(o->'marks') x where x->>'tooth'=v_tooth and x->>'condition'<>'healthy') then raise exception 'Invalid healthy tooth' using errcode='22023';end if;
    end loop;
  end loop;
  v_ids:=array[]::text[];
  for t in select value from jsonb_array_elements(c->'treatmentPlan') loop
    if jsonb_typeof(t) is distinct from 'object' or coalesce(t->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or t->>'id'=any(v_ids)
      or (t->'tooth' is distinct from 'null'::jsonb and private.valid_dental_tooth(t->'tooth') is distinct from true) or jsonb_typeof(t->'description') is distinct from 'string' or length(btrim(t->>'description')) not between 1 and 2000
      or coalesce(t->>'status','') not in ('pending','in_progress','completed') or jsonb_typeof(t->'completedDate') is distinct from 'string'
      or exists(select 1 from jsonb_object_keys(t) k where k<>all(array['id','tooth','description','status','date','completedDate'])) then raise exception 'Invalid dental treatment' using errcode='22023';end if;
    v_ids:=array_append(v_ids,t->>'id');
    if coalesce(t->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or (t->>'date')::date>current_date or (t->>'date')::date<v_birth then raise exception 'Invalid treatment date' using errcode='22023';end if;
    if t->>'status'='completed' then
      if t->>'completedDate'!~'^\d{4}-\d{2}-\d{2}$' or (t->>'completedDate')::date<(t->>'date')::date or (t->>'completedDate')::date>current_date then raise exception 'Invalid completion date' using errcode='22023';end if;
    elsif t->>'completedDate'<>'' then raise exception 'Invalid completion date' using errcode='22023';end if;
  end loop;
  v_ids:=array[]::text[];
  for e in select value from jsonb_array_elements(p_data->'evolutions') loop
    if jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' or e->>'id'=any(v_ids) or jsonb_typeof(e->'procedure') is distinct from 'string' or length(btrim(e->>'procedure')) not between 1 and 20000
      or coalesce(e->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or (e->>'date')::date>current_date or (e->>'date')::date<v_birth
      or exists(select 1 from jsonb_object_keys(e) k where k<>all(array['id','date','procedure'])) then raise exception 'Invalid dental encounter' using errcode='22023';end if;
    v_ids:=array_append(v_ids,e->>'id');
  end loop;
end;$$;
revoke all on function private.valid_dental_tooth(jsonb),private.validate_odontology_v1(jsonb,jsonb) from public,anon,authenticated;

alter function public.save_clinical_chart(uuid,uuid,text,integer,integer,integer,jsonb,jsonb) rename to save_podology_chart;
alter function public.save_podology_chart(uuid,uuid,text,integer,integer,integer,jsonb,jsonb) set schema private;
revoke all on function private.save_podology_chart(uuid,uuid,text,integer,integer,integer,jsonb,jsonb) from public,anon,authenticated;
create function public.save_clinical_chart(p_clinic_id uuid,p_patient_id uuid,p_specialty_id text,p_schema_version integer,p_expected_version integer,p_expected_identity_version integer,p_identity jsonb,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clinical_charts;v_id uuid;v_result jsonb;v_controls jsonb:='[]';v_control jsonb;v_clinical jsonb;v_index integer;v_old integer;v_author text;
begin
  if p_specialty_id='podologia' then return private.save_podology_chart(p_clinic_id,p_patient_id,p_specialty_id,p_schema_version,p_expected_version,p_expected_identity_version,p_identity,p_data);end if;
  if p_specialty_id is distinct from 'odontologia' or p_schema_version is distinct from 1 then raise exception 'UNSUPPORTED_CLINICAL_SCHEMA' using errcode='22023';end if;
  perform 1 from public.clinic_members m join public.member_specialties s on s.clinic_id=m.clinic_id and s.user_id=m.user_id join public.clinic_specialties cs on cs.clinic_id=s.clinic_id and cs.specialty_id=s.specialty_id and cs.enabled
    where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.active and m.role<>'reception' and s.specialty_id=p_specialty_id and s.can_write;
  if not found then raise exception 'Access denied' using errcode='42501';end if;
  if p_patient_id is not null then
    perform 1 from public.patients where id=p_patient_id and clinic_id=p_clinic_id for update;
    if not found then raise exception 'Access denied' using errcode='42501';end if;
    select * into c from public.clinical_charts where clinic_id=p_clinic_id and patient_id=p_patient_id and specialty_id=p_specialty_id for update;
    if found and not private.can_access_chart(c.id,'write') then raise exception 'Access denied' using errcode='42501';end if;
  end if;
  if p_expected_version is distinct from coalesce(c.version,0) then raise exception 'CONFLICT';end if;
  perform private.validate_odontology_v1(p_identity,p_data);
  v_old:=coalesce(jsonb_array_length(c.clinical_values->'odontograms'),0);
  if jsonb_array_length(p_data->'clinical'->'odontograms')<v_old then raise exception 'ODONTOGRAM_IMMUTABLE' using errcode='22023';end if;
  select coalesce(nullif(cp.display_name,''),u.email,'Equipo del consultorio') into v_author from auth.users u left join public.clinic_practitioners cp on cp.user_id=u.id and cp.clinic_id=p_clinic_id where u.id=auth.uid();
  v_index:=0;
  for v_control in select value from jsonb_array_elements(p_data->'clinical'->'odontograms') loop
    if v_index<v_old then
      if v_control is distinct from c.clinical_values->'odontograms'->v_index then raise exception 'ODONTOGRAM_IMMUTABLE' using errcode='22023';end if;
    else
      if v_control?'authorId' or v_control?'authorName' or v_control?'recordedAt' then raise exception 'Invalid odontogram author' using errcode='22023';end if;
      v_control:=v_control||jsonb_build_object('authorId',auth.uid(),'authorName',v_author,'recordedAt',now());
    end if;
    v_controls:=v_controls||jsonb_build_array(v_control);v_index:=v_index+1;
  end loop;
  v_clinical:=(p_data->'clinical')||jsonb_build_object('odontograms',v_controls);
  v_id:=private.persist_patient_identity(p_clinic_id,p_patient_id,p_expected_identity_version,p_identity);
  if c.id is null then
    insert into public.clinical_charts(clinic_id,patient_id,specialty_id,schema_version,initial_data,clinical_values,export_context)
      values(p_clinic_id,v_id,p_specialty_id,1,p_data->'initial',v_clinical,(select settings from public.clinics where id=p_clinic_id)) returning * into c;
    insert into public.clinical_access_grants select p_clinic_id,c.id,auth.uid(),true,true,can_export,auth.uid(),now() from public.member_specialties where clinic_id=p_clinic_id and user_id=auth.uid() and specialty_id=p_specialty_id;
  else
    update public.clinical_charts set initial_data=p_data->'initial',clinical_values=v_clinical,version=version+1,updated_at=now(),export_context=(select settings from public.clinics where id=p_clinic_id) where id=c.id returning * into c;
  end if;
  if exists(select 1 from public.clinical_encounters e join jsonb_array_elements(p_data->'evolutions') i on e.id=(i->>'id')::uuid where e.chart_id<>c.id) then raise exception 'Access denied' using errcode='42501';end if;
  update public.clinical_encounters set archived_at=now(),updated_by=auth.uid() where chart_id=c.id and archived_at is null and id not in(select (value->>'id')::uuid from jsonb_array_elements(p_data->'evolutions'));
  insert into public.clinical_encounters(id,clinic_id,chart_id,date,procedure,position,created_by,updated_by)
    select (value->>'id')::uuid,p_clinic_id,c.id,(value->>'date')::date,value->>'procedure',(ordinality-1)::integer,auth.uid(),auth.uid() from jsonb_array_elements(p_data->'evolutions') with ordinality
    on conflict(id) do update set date=excluded.date,procedure=excluded.procedure,position=excluded.position,updated_by=auth.uid(),archived_at=null;
  v_result:=public.get_clinical_chart(v_id,p_specialty_id,false,p_clinic_id);
  insert into public.clinical_chart_versions(clinic_id,chart_id,version,schema_version,snapshot,recorded_by) values(p_clinic_id,c.id,c.version,1,v_result-array['canWrite','canExport'],auth.uid());
  return v_result;
end;$$;
revoke all on function public.save_clinical_chart(uuid,uuid,text,integer,integer,integer,jsonb,jsonb) from public,anon;
grant execute on function public.save_clinical_chart(uuid,uuid,text,integer,integer,integer,jsonb,jsonb) to authenticated;

create or replace function private.can_offer_service(p_clinic_id uuid,p_provider uuid,p_service uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.services s
    join public.clinic_specialties cs on cs.clinic_id=s.clinic_id and cs.specialty_id=s.specialty_id and cs.enabled
    join public.clinic_practitioners p on p.clinic_id=s.clinic_id and p.user_id=p_provider and p.active
    join public.clinic_members m on m.clinic_id=p.clinic_id and m.user_id=p.user_id and m.active and m.role<>'reception'
    join public.practitioner_specialties ps on ps.clinic_id=p.clinic_id and ps.user_id=p.user_id and ps.specialty_id=s.specialty_id and ps.active
    where s.id=p_service and s.clinic_id=p_clinic_id and s.active);
$$;

create or replace function public.list_practitioners(p_clinic_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role,'display_name',p.display_name,
    'specialty_ids',coalesce((select jsonb_agg(specialty_id) from public.practitioner_specialties where clinic_id=p.clinic_id and user_id=p.user_id and active),'[]'::jsonb)) order by u.email)
    from public.clinic_members m join public.clinic_practitioners p on p.clinic_id=m.clinic_id and p.user_id=m.user_id and p.active
    join auth.users u on u.id=m.user_id where m.clinic_id=p_clinic_id and m.active and m.role<>'reception'),'[]'::jsonb);
end;$$;


create or replace function public.list_team(p_clinic_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_owner(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role,'active',m.active,'confirmed',u.email_confirmed_at is not null,'is_self',m.user_id=auth.uid(),
    'display_name',coalesce(p.display_name,''),'practitioner',coalesce(p.active,false),'license',coalesce((select license from public.practitioner_specialties where clinic_id=m.clinic_id and user_id=m.user_id and specialty_id='podologia'),''),
    'practitioner_specialties',coalesce((select jsonb_agg(jsonb_build_object('specialty_id',specialty_id,'active',active,'license',license)) from public.practitioner_specialties where clinic_id=m.clinic_id and user_id=m.user_id),'[]'::jsonb),'specialties',coalesce((select jsonb_agg(jsonb_build_object('specialtyId',s.specialty_id,'name',sp.name,'canRead',s.can_read,'canWrite',s.can_write,'canExport',s.can_export,'scope',s.scope))
      from public.member_specialties s join public.specialties sp on sp.id=s.specialty_id where s.clinic_id=m.clinic_id and s.user_id=m.user_id),'[]'::jsonb)) order by u.email)
    from public.clinic_members m join auth.users u on u.id=m.user_id left join public.clinic_practitioners p on p.clinic_id=m.clinic_id and p.user_id=m.user_id where m.clinic_id=p_clinic_id),'[]'::jsonb);
end;$$;



create or replace function public.list_clinical_patients(p_clinic_id uuid,p_query text default '',p_page integer default 0,p_page_size integer default 12) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_term text:=left(btrim(coalesce(p_query,'')),100);v_count integer;v_result jsonb;
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  if p_page is null or p_page<0 or p_page_size is null or p_page_size not between 1 and 50 then raise exception 'Invalid page' using errcode='22023';end if;
  v_term:=translate(lower(v_term),'áéíóúüñ','aeiouun');
  select count(*) into v_count from public.patients p where p.clinic_id=p_clinic_id
    and exists(select 1 from public.clinical_charts c where c.patient_id=p.id and private.can_access_chart(c.id,'read'))
    and (v_term='' or position(v_term in p.full_name_search)>0 or position(v_term in lower(p.history_number))>0 or (regexp_replace(v_term,'[.\s-]','','g')<>'' and position(regexp_replace(v_term,'[.\s-]','','g') in nullif(p.dni,''))>0));
  select coalesce(jsonb_agg(to_jsonb(r) order by updated_at desc,id),'[]'::jsonb) into v_result from
    (select p.id,p.full_name,p.history_number,p.dni,p.updated_at,private.patient_chart_links(p.id) as chart_links from public.patients p where p.clinic_id=p_clinic_id
      and exists(select 1 from public.clinical_charts c where c.patient_id=p.id and private.can_access_chart(c.id,'read'))
      and (v_term='' or position(v_term in p.full_name_search)>0 or position(v_term in lower(p.history_number))>0 or (regexp_replace(v_term,'[.\s-]','','g')<>'' and position(regexp_replace(v_term,'[.\s-]','','g') in nullif(p.dni,''))>0))
      order by p.updated_at desc,p.id offset p_page*p_page_size limit p_page_size) r;
  return jsonb_build_object('patients',v_result,'count',v_count);
end;$$;

create or replace function public.set_member_specialty_access(p_clinic_id uuid,p_user_id uuid,p_specialty_id text,p_read boolean,p_write boolean,p_export boolean,p_scope text,p_practitioner boolean,p_name text,p_license text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.clinics where id=p_clinic_id for update;
  if not private.is_owner(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  if p_specialty_id not in ('podologia','odontologia') or p_specialty_id is null or p_read is null or p_write is null or p_export is null or p_practitioner is null or p_scope is null or p_scope not in ('all','assigned') or ((p_write or p_export) and not p_read) or p_name is null or length(p_name)>120 or p_license is null or length(p_license)>200 then raise exception 'Invalid access' using errcode='22023';end if;
  if not exists(select 1 from public.clinic_members where clinic_id=p_clinic_id and user_id=p_user_id and active and role<>'reception') then raise exception 'Access denied' using errcode='42501';end if;
  if not p_practitioner and exists(select 1 from public.appointments a left join public.services s on s.id=a.service_id where a.clinic_id=p_clinic_id and a.provider_id=p_user_id and a.status='confirmed' and a.starts_at>now() and (coalesce(s.specialty_id,'podologia')=p_specialty_id or (a.kind='block' and not exists(select 1 from public.practitioner_specialties where clinic_id=p_clinic_id and user_id=p_user_id and specialty_id<>p_specialty_id and active)))) then raise exception 'MEMBER_HAS_APPOINTMENTS';end if;
  -- Choosing and saving clinical access is the owner's explicit activation of this specialty.
  insert into public.clinic_specialties values(p_clinic_id,p_specialty_id,p_read or p_practitioner) on conflict(clinic_id,specialty_id) do update set enabled=public.clinic_specialties.enabled or excluded.enabled;
  insert into public.member_specialties values(p_clinic_id,p_user_id,p_specialty_id,p_read,p_write,p_export,p_scope) on conflict(clinic_id,user_id,specialty_id) do update set can_read=p_read,can_write=p_write,can_export=p_export,scope=p_scope;
  insert into public.clinic_practitioners values(p_clinic_id,p_user_id,btrim(p_name),p_practitioner) on conflict(clinic_id,user_id) do update set display_name=excluded.display_name;
  insert into public.practitioner_specialties(clinic_id,user_id,specialty_id,license,active) values(p_clinic_id,p_user_id,p_specialty_id,p_license,p_practitioner) on conflict(clinic_id,user_id,specialty_id) do update set license=excluded.license,active=excluded.active;
  update public.clinic_practitioners set active=exists(select 1 from public.practitioner_specialties where clinic_id=p_clinic_id and user_id=p_user_id and active) where clinic_id=p_clinic_id and user_id=p_user_id;
  insert into public.access_events(clinic_id,actor_id,subject_id,event,details) values(p_clinic_id,auth.uid(),p_user_id,'specialty_access',jsonb_build_object('specialty',p_specialty_id,'read',p_read,'write',p_write,'export',p_export,'scope',p_scope,'practitioner',p_practitioner));
end;$$;
commit;
