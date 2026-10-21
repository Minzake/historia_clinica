-- Run once in the Supabase SQL editor (or with the Supabase CLI).
-- No public signup / auto-provisioning: an administrator assigns each account to a clinic.
begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  settings jsonb not null default '{"name":"","professional":"","address":"","phone":"","email":"","license":""}',
  version integer not null default 1,
  next_history_number bigint not null default 1,
  created_at timestamptz not null default now()
);

create table public.clinic_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id),
  role text not null check (role in ('owner', 'professional')),
  created_at timestamptz not null default now()
);
create index clinic_members_clinic on public.clinic_members(clinic_id);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  full_name text not null check (length(btrim(full_name)) between 2 and 200),
  full_name_search text generated always as (translate(lower(full_name), 'áéíóúüñ', 'aeiouun')) stored,
  dni text not null default '' check (dni = '' or dni ~ '^[0-9]{6,10}$'),
  history_number text not null check (length(btrim(history_number)) between 1 and 40),
  details jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, clinic_id)
);
create unique index patients_history_unique on public.patients(clinic_id, lower(btrim(history_number)));
create unique index patients_dni_unique on public.patients(clinic_id, dni) where dni <> '';
create index patients_recent on public.patients(clinic_id, updated_at desc, id);

create table public.clinical_records (
  patient_id uuid primary key,
  clinic_id uuid not null,
  antecedents jsonb not null,
  vaccines jsonb not null,
  clinical_values jsonb not null,
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id)
);

create table public.evolutions (
  id uuid primary key,
  patient_id uuid not null,
  clinic_id uuid not null,
  date date not null,
  procedure text not null check (length(btrim(procedure)) between 1 and 20000),
  position integer not null,
  archived_at timestamptz,
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id)
);
create index evolutions_patient on public.evolutions(patient_id, position) where archived_at is null;
create index evolutions_clinic on public.evolutions(clinic_id) where archived_at is null;

-- Immutable, complete snapshots of every saved version, including removed evolutions.
create table public.clinical_record_versions (
  id bigint generated always as identity primary key,
  patient_id uuid not null,
  clinic_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  foreign key (patient_id, clinic_id) references public.patients(id, clinic_id),
  unique(patient_id, version)
);

create function private.is_member(p_clinic_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.clinic_members m where m.user_id = (select auth.uid()) and m.clinic_id = p_clinic_id);
$$;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;

alter table public.clinics enable row level security;
alter table public.clinic_members enable row level security;
alter table public.patients enable row level security;
alter table public.clinical_records enable row level security;
alter table public.evolutions enable row level security;
alter table public.clinical_record_versions enable row level security;

create policy clinic_read on public.clinics for select to authenticated using (private.is_member(id));
create policy membership_read on public.clinic_members for select to authenticated using (user_id = (select auth.uid()));
create policy patients_read on public.patients for select to authenticated using (private.is_member(clinic_id));
create policy records_read on public.clinical_records for select to authenticated using (private.is_member(clinic_id));
create policy evolutions_read on public.evolutions for select to authenticated using (private.is_member(clinic_id));
create policy versions_read on public.clinical_record_versions for select to authenticated using (private.is_member(clinic_id));

revoke all on public.clinics, public.clinic_members, public.patients, public.clinical_records, public.evolutions, public.clinical_record_versions from public, anon, authenticated;
grant select on public.clinics, public.clinic_members, public.patients, public.clinical_records, public.evolutions, public.clinical_record_versions to authenticated;
-- Administrative setup runs on the server only. It cannot change application-user grants.
grant select on public.clinics, public.clinic_members, public.patients, public.clinical_records, public.evolutions, public.clinical_record_versions to service_role;
grant insert, update on public.clinics, public.clinic_members to service_role;

create function public.get_patient_record(p_patient_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_patient public.patients; v_result jsonb;
begin
  select * into v_patient from public.patients where id = p_patient_id;
  if not found or not private.is_member(v_patient.clinic_id) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', v_patient.id, 'version', v_patient.version, 'updatedAt', v_patient.updated_at,
    'patient', v_patient.details || jsonb_build_object('fullName', v_patient.full_name,
      'historyNumber', v_patient.history_number, 'dni', v_patient.dni, 'antecedents', r.antecedents, 'vaccines', r.vaccines),
    'clinical', r.clinical_values,
    'evolutions', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'date', e.date, 'procedure', e.procedure) order by e.position, e.id)
      from public.evolutions e where e.patient_id = v_patient.id and e.archived_at is null), '[]'::jsonb)
  ) into v_result from public.clinical_records r where r.patient_id = v_patient.id;
  return v_result;
end;
$$;

create function public.save_patient_record(p_clinic_id uuid, p_patient_id uuid, p_expected_version integer, p_record jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_version integer; v_number text; v_next bigint; v_patient jsonb; v_values jsonb;
  v_field text; v_item jsonb; v_birth date; v_date date; v_result jsonb;
begin
  if not private.is_member(p_clinic_id) then raise exception 'NO_MEMBERSHIP' using errcode = '42501'; end if;
  if p_record is null or octet_length(p_record::text) > 2000000 or jsonb_typeof(p_record) <> 'object' then
    raise exception 'Invalid record' using errcode = '22023';
  end if;
  v_patient := p_record->'patient';
  v_values := p_record->'clinical';
  if jsonb_typeof(v_patient) is distinct from 'object' or jsonb_typeof(v_values) is distinct from 'object'
    or jsonb_typeof(p_record->'evolutions') is distinct from 'array' then
    raise exception 'Invalid record structure' using errcode = '22023';
  end if;
  foreach v_field in array array['fullName','historyNumber','dni','date','address','age','birthDate','phone','mobile','insurance',
    'occupation','emergencyContact','emergencyPhone','treatment','treatmentNotes','medication','sports','diet','alcohol','smoking','footwear','photoConsent','referredBy'] loop
    if jsonb_typeof(v_patient->v_field) is distinct from 'string' or length(v_patient->>v_field) > 2000 then
      raise exception 'Invalid patient field' using errcode = '22023';
    end if;
  end loop;
  foreach v_field in array array['usual','pressure','glucose','weight','height'] loop
    if jsonb_typeof(v_values->v_field) is distinct from 'string' or length(v_values->>v_field) > 2000 then
      raise exception 'Invalid clinical field' using errcode = '22023';
    end if;
  end loop;
  if length(v_values->>'pressure') > 40 or length(v_values->>'glucose') > 40
    or length(v_values->>'weight') > 10 or length(v_values->>'height') > 10 or length(v_patient->>'referredBy') > 80 then
    raise exception 'Clinical field too long' using errcode = '22023';
  end if;
  if length(v_patient->>'fullName') > 200 or length(v_patient->>'historyNumber') > 40
    or v_patient->>'treatment' not in ('unset','yes','no') or v_patient->>'photoConsent' not in ('unset','yes','no') then
    raise exception 'Invalid patient values' using errcode = '22023';
  end if;
  if (v_patient->>'date') !~ '^\d{4}-\d{2}-\d{2}$' or (v_patient->>'birthDate' <> '' and (v_patient->>'birthDate') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'Invalid date format' using errcode = '22023';
  end if;
  v_date := (v_patient->>'date')::date;
  v_birth := nullif(v_patient->>'birthDate','')::date;
  if v_date > current_date or v_birth > v_date then raise exception 'Invalid date' using errcode = '22023'; end if;
  if v_birth is not null then
    v_patient := jsonb_set(v_patient, '{age}', to_jsonb(extract(year from age(v_date, v_birth))::integer::text));
  end if;
  if v_patient->>'age' <> '' and ((v_patient->>'age') !~ '^\d{1,3}$' or (v_patient->>'age')::integer > 125) then
    raise exception 'Invalid age' using errcode = '22023';
  end if;
  foreach v_field in array array['weight','height'] loop
    if v_values->>v_field <> '' then
      if replace(v_values->>v_field, ',', '.') !~ '^\d+(\.\d+)?$' then raise exception 'Invalid numeric value' using errcode = '22023'; end if;
      if replace(v_values->>v_field, ',', '.')::numeric <= 0 or replace(v_values->>v_field, ',', '.')::numeric > (case when v_field = 'weight' then 700 else 300 end) then
        raise exception 'Invalid numeric range' using errcode = '22023';
      end if;
    end if;
  end loop;
  if jsonb_typeof(v_patient->'antecedents') is distinct from 'array' or jsonb_typeof(v_patient->'vaccines') is distinct from 'array' then
    raise exception 'Invalid antecedents' using errcode = '22023';
  end if;
  if jsonb_array_length(v_patient->'antecedents') <> 18 or jsonb_array_length(v_patient->'vaccines') <> 3 then
    raise exception 'Invalid antecedent count' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements((v_patient->'antecedents') || (v_patient->'vaccines')) loop
    if jsonb_typeof(v_item->'label') is distinct from 'string' or length(v_item->>'label') > 100
      or jsonb_typeof(v_item->'notes') is distinct from 'string' or length(v_item->>'notes') > 2000
      or jsonb_typeof(v_item->'id') is distinct from 'string' or length(v_item->>'id') > 40
      or coalesce(v_item->>'answer','') not in ('unset','yes','no') then
      raise exception 'Invalid antecedent value' using errcode = '22023';
    end if;
  end loop;
  if jsonb_array_length(p_record->'evolutions') > 500 then raise exception 'Too many evolutions' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_record->'evolutions') loop
    if jsonb_typeof(v_item->'procedure') is distinct from 'string' or length(btrim(v_item->>'procedure')) not between 1 and 20000
      or coalesce(v_item->>'id','') !~ '^[0-9a-fA-F-]{36}$' or coalesce(v_item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Invalid evolution' using errcode = '22023';
    end if;
    if (v_item->>'date')::date > current_date or (v_item->>'date')::date < v_birth then
      raise exception 'Invalid evolution date' using errcode = '22023';
    end if;
  end loop;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(p_record->'evolutions')) then
    raise exception 'Repeated evolution id' using errcode = '22023';
  end if;

  v_number := btrim(v_patient->>'historyNumber');
  if p_patient_id is null then
    if p_expected_version is distinct from 0 then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
    if v_number = '' then
      -- Serialize auto-number allocation; also skip manually assigned numbers.
      loop
        update public.clinics set next_history_number = next_history_number + 1 where id = p_clinic_id returning next_history_number - 1 into v_next;
        v_number := 'HC-' || lpad(v_next::text, greatest(6, length(v_next::text)), '0');
        exit when not exists (select 1 from public.patients where clinic_id = p_clinic_id and lower(history_number) = lower(v_number));
      end loop;
    end if;
    insert into public.patients(clinic_id, full_name, dni, history_number, details)
      values(p_clinic_id, btrim(v_patient->>'fullName'), regexp_replace(v_patient->>'dni','[.\s-]','','g'), v_number, v_patient - array['antecedents','vaccines','fullName','dni','historyNumber'])
      returning id, version into v_id, v_version;
  else
    select id, version into v_id, v_version from public.patients where id = p_patient_id and clinic_id = p_clinic_id for update;
    if not found then raise exception 'Access denied' using errcode = '42501'; end if;
    if v_version is distinct from p_expected_version then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
    if v_number = '' then select history_number into v_number from public.patients where id = v_id; end if;
    update public.patients set full_name = btrim(v_patient->>'fullName'), dni = regexp_replace(v_patient->>'dni','[.\s-]','','g'),
      history_number = v_number, details = v_patient - array['antecedents','vaccines','fullName','dni','historyNumber'],
      version = version + 1, updated_at = now() where id = v_id returning version into v_version;
  end if;

  insert into public.clinical_records(patient_id, clinic_id, antecedents, vaccines, clinical_values)
    values(v_id, p_clinic_id, v_patient->'antecedents', v_patient->'vaccines', v_values)
    on conflict (patient_id) do update set antecedents = excluded.antecedents, vaccines = excluded.vaccines, clinical_values = excluded.clinical_values;
  if exists(select 1 from public.evolutions e join jsonb_array_elements(p_record->'evolutions') i on e.id = (i->>'id')::uuid where e.patient_id <> v_id) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  update public.evolutions set archived_at = now() where patient_id = v_id and archived_at is null
    and id not in (select (value->>'id')::uuid from jsonb_array_elements(p_record->'evolutions'));
  insert into public.evolutions(id, patient_id, clinic_id, date, procedure, position)
    select (value->>'id')::uuid, v_id, p_clinic_id, (value->>'date')::date, value->>'procedure', (ordinality - 1)::integer
      from jsonb_array_elements(p_record->'evolutions') with ordinality
    on conflict (id) do update set date = excluded.date, procedure = excluded.procedure, position = excluded.position, archived_at = null;

  v_result := public.get_patient_record(v_id);
  insert into public.clinical_record_versions(patient_id, clinic_id, version, snapshot, recorded_by)
    values(v_id, p_clinic_id, v_version, v_result, auth.uid());
  return v_result;
end;
$$;

create function public.save_clinic_settings(p_clinic_id uuid, p_expected_version integer, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_field text; v_result jsonb;
begin
  if not exists(select 1 from public.clinic_members where user_id = auth.uid() and clinic_id = p_clinic_id and role = 'owner') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object' then raise exception 'Invalid settings' using errcode = '22023'; end if;
  foreach v_field in array array['name','professional','address','phone','email','license'] loop
    if jsonb_typeof(p_settings->v_field) is distinct from 'string' or length(p_settings->>v_field) > 200 then
      raise exception 'Invalid clinic field' using errcode = '22023';
    end if;
  end loop;
  if btrim(p_settings->>'name') = '' and btrim(p_settings->>'professional') = '' then raise exception 'Missing clinic identity' using errcode = '22023'; end if;
  update public.clinics set settings = p_settings, version = version + 1 where id = p_clinic_id and version = p_expected_version
    returning jsonb_build_object('settings', settings, 'version', version) into v_result;
  if not found then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
  return v_result;
end;
$$;

revoke all on function public.get_patient_record(uuid) from public, anon;
revoke all on function public.save_patient_record(uuid, uuid, integer, jsonb) from public, anon;
revoke all on function public.save_clinic_settings(uuid, integer, jsonb) from public, anon;
grant execute on function public.get_patient_record(uuid) to authenticated;
grant execute on function public.save_patient_record(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.save_clinic_settings(uuid, integer, jsonb) to authenticated;

commit;
