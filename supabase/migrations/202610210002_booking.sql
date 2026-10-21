-- Shared consultorio management. Public bookings are always 30 minutes.
-- Existing clinical records are never exposed or linked automatically to a client account.
begin;
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

alter table public.clinic_members add column active boolean not null default true;
alter table public.clinic_members add constraint clinic_members_pair unique (clinic_id, user_id);

create or replace function private.is_member(p_clinic_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.clinic_members where user_id = (select auth.uid()) and clinic_id = p_clinic_id and active);
$$;
create function private.is_owner(p_clinic_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.clinic_members where user_id = (select auth.uid()) and clinic_id = p_clinic_id and active and role = 'owner');
$$;
revoke all on function private.is_owner(uuid) from public;
grant execute on function private.is_owner(uuid) to authenticated;

create or replace function public.save_clinic_settings(p_clinic_id uuid, p_expected_version integer, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_field text; v_result jsonb;
begin
  if not private.is_owner(p_clinic_id) then raise exception 'Access denied' using errcode = '42501'; end if;
  if jsonb_typeof(p_settings) is distinct from 'object' then raise exception 'Invalid settings' using errcode = '22023'; end if;
  foreach v_field in array array['name','professional','address','phone','email','license'] loop
    if jsonb_typeof(p_settings->v_field) is distinct from 'string' or length(p_settings->>v_field) > 200 then raise exception 'Invalid settings' using errcode = '22023'; end if;
  end loop;
  if btrim(p_settings->>'name') = '' and btrim(p_settings->>'professional') = '' then raise exception 'Missing identity' using errcode = '22023'; end if;
  update public.clinics set settings = p_settings, version = version + 1 where id = p_clinic_id and version = p_expected_version
    returning jsonb_build_object('settings',settings,'version',version) into v_result;
  if not found then raise exception 'CONFLICT'; end if;
  return v_result;
end;
$$;

create table public.patient_accounts (
  user_id uuid primary key references auth.users(id),
  full_name text not null check (length(btrim(full_name)) between 2 and 200),
  dni text not null unique check (dni ~ '^[0-9]{6,10}$'),
  phone text not null default '' check (length(phone) <= 40),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.booking_settings (
  clinic_id uuid primary key references public.clinics(id),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  enabled boolean not null default false,
  provider_id uuid,
  provider_name text not null default '' check (length(provider_name) <= 120),
  timezone text not null default 'America/Argentina/Buenos_Aires',
  advance_days integer not null default 30 check (advance_days between 1 and 180),
  lead_minutes integer not null default 120 check (lead_minutes between 0 and 10080),
  cancel_hours integer not null default 12 check (cancel_hours between 0 and 168),
  version integer not null default 1,
  foreign key (clinic_id, provider_id) references public.clinic_members(clinic_id,user_id)
);
create table public.booking_hours (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.booking_settings(clinic_id),
  weekday integer not null check (weekday between 0 and 6),
  opens time not null, closes time not null,
  check (closes > opens and closes - opens >= interval '30 minutes'),
  unique(clinic_id,weekday,opens)
);
create table public.clinic_client_accounts (
  clinic_id uuid not null references public.clinics(id), user_id uuid not null references public.patient_accounts(user_id),
  created_at timestamptz not null default now(), primary key(clinic_id,user_id)
);
alter table public.clinic_client_accounts enable row level security;
revoke all on public.clinic_client_accounts from public,anon,authenticated;
grant select on public.clinic_client_accounts to service_role;
insert into public.booking_settings(clinic_id,slug) select id, 'consultorio-' || replace(id::text,'-','') from public.clinics;
create function private.initialize_booking_settings() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.booking_settings(clinic_id,slug) values(new.id,'consultorio-'||replace(new.id::text,'-',''));
  return new;
end;
$$;
revoke all on function private.initialize_booking_settings() from public;
create trigger clinic_booking_defaults after insert on public.clinics for each row execute function private.initialize_booking_settings();

create table public.appointments (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id),
  provider_id uuid not null, client_user_id uuid references public.patient_accounts(user_id),
  patient_id uuid, contact_name text not null default '' check(length(contact_name) <= 200),
  contact_dni text not null default '' check(contact_dni = '' or contact_dni ~ '^[0-9]{6,10}$'),
  contact_email text not null default '' check(length(contact_email) <= 254),
  contact_phone text not null default '' check(length(contact_phone) <= 40),
  starts_at timestamptz not null, ends_at timestamptz not null,
  kind text not null default 'consultation' check(kind in ('consultation','block')),
  source text not null check(source in ('web','staff')),
  status text not null default 'confirmed' check(status in ('confirmed','cancelled','completed','no_show')),
  private_notes text not null default '' check(length(private_notes) <= 2000),
  version integer not null default 1, created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (clinic_id,provider_id) references public.clinic_members(clinic_id,user_id),
  foreign key (patient_id,clinic_id) references public.patients(id,clinic_id),
  check(ends_at > starts_at and ends_at - starts_at <= case when kind = 'block' then interval '31 days' else interval '8 hours' end),
  constraint appointments_no_overlap exclude using gist (provider_id with =, tstzrange(starts_at,ends_at,'[)') with &&) where (status <> 'cancelled')
);
create index appointments_agenda on public.appointments(clinic_id,starts_at);
create index appointments_client on public.appointments(client_user_id,starts_at);
create table public.appointment_events (
  id bigint generated always as identity primary key, appointment_id uuid not null references public.appointments(id),
  clinic_id uuid not null, actor_id uuid, version integer not null, snapshot jsonb not null, created_at timestamptz not null default now()
);
create table private.appointment_notifications (
  id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments(id),
  clinic_id uuid not null, recipient text not null, payload jsonb not null,
  version integer not null, state text not null default 'pending' check(state in ('pending','processing','sent','failed','superseded')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(), locked_until timestamptz,
  error_code text, provider_id text, created_at timestamptz not null default now(),
  unique(appointment_id,version)
);
create index appointment_notifications_due on private.appointment_notifications(state,next_attempt_at);
alter table public.patient_accounts enable row level security;
alter table public.booking_settings enable row level security;
alter table public.booking_hours enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_events enable row level security;
alter table private.appointment_notifications enable row level security;
create policy account_read on public.patient_accounts for select to authenticated using(user_id = (select auth.uid()));
create policy booking_settings_read on public.booking_settings for select to authenticated using(private.is_member(clinic_id));
create policy booking_hours_read on public.booking_hours for select to authenticated using(private.is_member(clinic_id));
create policy agenda_read on public.appointments for select to authenticated using(private.is_member(clinic_id));
create policy appointment_event_read on public.appointment_events for select to authenticated using(private.is_member(clinic_id));
revoke all on public.patient_accounts, public.booking_settings, public.booking_hours, public.appointments, public.appointment_events from public,anon,authenticated;
revoke all on private.appointment_notifications from public,anon,authenticated;
grant select on public.patient_accounts,public.booking_settings,public.booking_hours to authenticated;
grant select on public.patient_accounts,public.booking_settings,public.booking_hours,public.appointments,public.appointment_events to service_role;
grant update on public.clinic_members to service_role;

create function private.verified_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode='42501';
  end if;
  return auth.uid();
end;
$$;
revoke all on function private.verified_user() from public;

create function public.save_patient_account(p_name text,p_dni text,p_phone text,p_slug text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.verified_user(); v_dni text := regexp_replace(coalesce(p_dni,''),'[.\s-]','','g'); v_result jsonb; v_clinic uuid;
begin
  if p_name is null or length(btrim(p_name)) not between 2 and 200 or v_dni !~ '^[0-9]{6,10}$' or p_phone is null or length(p_phone)>40 then raise exception 'Invalid profile' using errcode='22023'; end if;
  if exists(select 1 from public.patient_accounts where user_id=v_uid and dni<>v_dni) then raise exception 'DNI_IMMUTABLE' using errcode='22023'; end if;
  insert into public.patient_accounts(user_id,full_name,dni,phone) values(v_uid,btrim(p_name),v_dni,btrim(p_phone))
    on conflict(user_id) do update set full_name=excluded.full_name, phone=excluded.phone, updated_at=now();
  if p_slug is not null then select clinic_id into v_clinic from public.booking_settings where slug=p_slug;
  elsif (select count(*) from public.clinics)=1 then select id into v_clinic from public.clinics limit 1;
  end if;
  -- Sharing contact data with the selected consultorio never creates a clinical link.
  if v_clinic is not null then insert into public.clinic_client_accounts(clinic_id,user_id) values(v_clinic,v_uid) on conflict do nothing; end if;
  select to_jsonb(a) || jsonb_build_object('email',u.email) into v_result from public.patient_accounts a join auth.users u on u.id=a.user_id where a.user_id=v_uid;
  return v_result;
end;
$$;
create function public.get_patient_account() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(a) || jsonb_build_object('email',u.email) from public.patient_accounts a join auth.users u on u.id=a.user_id where a.user_id=auth.uid();
$$;

create function public.list_booking_pages() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug',s.slug,'name',coalesce(nullif(c.settings->>'name',''),'Consultorio'),
    'address',c.settings->>'address','phone',c.settings->>'phone','provider_name',s.provider_name,'timezone',s.timezone,
    'advance_days',s.advance_days,'lead_minutes',s.lead_minutes,'cancel_hours',s.cancel_hours,'duration_minutes',30) order by s.slug),'[]'::jsonb)
  from public.booking_settings s join public.clinics c on c.id=s.clinic_id
  join public.clinic_members m on m.user_id=s.provider_id and m.clinic_id=s.clinic_id and m.active
  where s.enabled;
$$;
create function public.get_booking_slots(p_slug text,p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s public.booking_settings; v_result jsonb;
begin
  select * into s from public.booking_settings where slug=p_slug and enabled;
  if not found or not exists(select 1 from public.clinic_members where user_id=s.provider_id and clinic_id=s.clinic_id and active) then return '[]'::jsonb; end if;
  if p_date is null or p_date < (now() at time zone s.timezone)::date or p_date > (now() at time zone s.timezone)::date+s.advance_days then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(distinct slot order by slot),'[]'::jsonb) into v_result
  from public.booking_hours h cross join lateral generate_series((p_date+h.opens) at time zone s.timezone,
    ((p_date+h.closes) at time zone s.timezone)-interval '30 minutes',interval '30 minutes') slot
  where h.clinic_id=s.clinic_id and h.weekday=extract(dow from p_date)
    and slot >= now()+s.lead_minutes*interval '1 minute'
    and not exists(select 1 from public.appointments a where a.provider_id=s.provider_id and a.status<>'cancelled'
      and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(slot,slot+interval '30 minutes','[)'));
  return v_result;
end;
$$;

create function private.record_appointment_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_type text; s public.booking_settings; c public.clinics;
begin
  insert into public.appointment_events(appointment_id,clinic_id,actor_id,version,snapshot)
    values(new.id,new.clinic_id,auth.uid(),new.version,to_jsonb(new));
  if new.kind='block' or new.contact_email='' then return new; end if;
  if tg_op='INSERT' then v_type:='confirmed';
  elsif new.status='cancelled' and old.status<>'cancelled' then v_type:='cancelled';
  elsif new.status='confirmed' and (new.starts_at<>old.starts_at or new.ends_at<>old.ends_at or old.status='cancelled') then v_type:='rescheduled';
  else return new; end if;
  update private.appointment_notifications set state='superseded' where appointment_id=new.id and state in ('pending','failed');
  select * into s from public.booking_settings where clinic_id=new.clinic_id;
  select * into c from public.clinics where id=new.clinic_id;
  insert into private.appointment_notifications(appointment_id,clinic_id,recipient,version,payload)
    values(new.id,new.clinic_id,new.contact_email,new.version,jsonb_build_object('event',v_type,'name',new.contact_name,
      'clinic',coalesce(c.settings->>'name','Consultorio'),'address',c.settings->>'address','phone',c.settings->>'phone',
      'starts_at',new.starts_at,'ends_at',new.ends_at,'timezone',coalesce(s.timezone,'America/Argentina/Buenos_Aires')));
  return new;
end;
$$;
revoke all on function private.record_appointment_event() from public;
create trigger appointment_audit after insert or update on public.appointments for each row execute function private.record_appointment_event();

create function public.book_appointment(p_slug text,p_starts_at timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=private.verified_user(); s public.booking_settings; a public.patient_accounts; v_id uuid; v_email text;
begin
  select * into s from public.booking_settings where slug=p_slug and enabled for share;
  if not found then raise exception 'BOOKING_CLOSED' using errcode='22023'; end if;
  select * into a from public.patient_accounts where user_id=v_uid;
  if not found then raise exception 'PROFILE_REQUIRED' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if (select count(*) from public.appointment_events where actor_id=v_uid and created_at>now()-interval '1 hour')>=10 then raise exception 'BOOKING_RATE_LIMIT' using errcode='22023'; end if;
  if (select count(*) from public.appointments where client_user_id=v_uid and clinic_id=s.clinic_id and status='confirmed' and starts_at>now())>=3 then raise exception 'BOOKING_LIMIT' using errcode='22023'; end if;
  if p_starts_at is null or not (public.get_booking_slots(p_slug,(p_starts_at at time zone s.timezone)::date) @> jsonb_build_array(p_starts_at)) then
    raise exception 'SLOT_UNAVAILABLE' using errcode='22023';
  end if;
  select email into v_email from auth.users where id=v_uid;
  insert into public.clinic_client_accounts(clinic_id,user_id) values(s.clinic_id,v_uid) on conflict do nothing;
  insert into public.appointments(clinic_id,provider_id,client_user_id,contact_name,contact_dni,contact_email,contact_phone,
    starts_at,ends_at,source,created_by,updated_by)
    values(s.clinic_id,s.provider_id,v_uid,a.full_name,a.dni,v_email,a.phone,p_starts_at,p_starts_at+interval '30 minutes','web',v_uid,v_uid) returning id into v_id;
  return v_id;
end;
$$;

create function public.get_my_appointments() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,
    'version',a.version,'source',a.source,'clinic_name',c.settings->>'name','phone',c.settings->>'phone','address',c.settings->>'address',
    'timezone',s.timezone,'slug',s.slug,'cancel_hours',s.cancel_hours,
    'notification_state',(select n.state from private.appointment_notifications n where n.appointment_id=a.id order by n.version desc limit 1)) order by a.starts_at desc),'[]'::jsonb)
  from public.appointments a join public.clinics c on c.id=a.clinic_id join public.booking_settings s on s.clinic_id=a.clinic_id
  where a.client_user_id=auth.uid() and a.kind='consultation';
$$;

create function public.change_my_appointment(p_id uuid,p_version integer,p_starts_at timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=private.verified_user(); a public.appointments; s public.booking_settings;
begin
  select bs.* into s from public.booking_settings bs join public.appointments ap on ap.clinic_id=bs.clinic_id where ap.id=p_id for share of bs;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if (select count(*) from public.appointment_events where actor_id=v_uid and created_at>now()-interval '1 hour')>=10 then raise exception 'BOOKING_RATE_LIMIT' using errcode='22023'; end if;
  select * into a from public.appointments where id=p_id and client_user_id=v_uid for update;
  if not found then raise exception 'Access denied' using errcode='42501'; end if;
  if a.version is distinct from p_version then raise exception 'CONFLICT'; end if;
  if a.status<>'confirmed' or a.starts_at<=now()+s.cancel_hours*interval '1 hour' then raise exception 'CHANGE_DEADLINE' using errcode='22023'; end if;
  if p_starts_at is null then
    update public.appointments set status='cancelled',version=version+1,updated_at=now(),updated_by=v_uid where id=p_id;
  else
    if a.source<>'web' or a.ends_at-a.starts_at<>interval '30 minutes' or a.provider_id<>s.provider_id
      or not(public.get_booking_slots(s.slug,(p_starts_at at time zone s.timezone)::date) @> jsonb_build_array(p_starts_at)) then
      raise exception 'SLOT_UNAVAILABLE' using errcode='22023';
    end if;
    update public.appointments set starts_at=p_starts_at,ends_at=p_starts_at+interval '30 minutes',version=version+1,updated_at=now(),updated_by=v_uid where id=p_id;
  end if;
end;
$$;

create function public.list_agenda(p_clinic_id uuid,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '32 days' then raise exception 'Invalid range' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('notification_state',
    (select n.state from private.appointment_notifications n where n.appointment_id=a.id order by n.version desc limit 1)) order by a.starts_at),'[]'::jsonb)
    into v_result from public.appointments a where a.clinic_id=p_clinic_id and a.starts_at<p_to and a.ends_at>p_from;
  return v_result;
end;
$$;

create function public.save_staff_appointment(p_clinic_id uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_provider uuid; v_start timestamptz; v_duration integer; v_kind text; v_status text; a public.appointments; v_client uuid; v_profile public.patient_accounts; v_email text;
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501'; end if;
  v_provider:=(p_data->>'provider_id')::uuid; v_start:=(p_data->>'starts_at')::timestamptz;
  v_duration:=(p_data->>'duration_minutes')::integer; v_kind:=coalesce(p_data->>'kind','consultation'); v_status:=coalesce(p_data->>'status','confirmed');
  if not exists(select 1 from public.clinic_members where clinic_id=p_clinic_id and user_id=v_provider and active)
    or (not private.is_owner(p_clinic_id) and v_provider<>auth.uid()) then raise exception 'Access denied' using errcode='42501'; end if;
  if v_start is null or v_duration is null or v_duration<15 or v_duration%15<>0 or v_duration>(case when v_kind='block' then 44640 else 480 end)
    or v_kind not in ('consultation','block') or v_status not in ('confirmed','cancelled','completed','no_show')
    or length(coalesce(p_data->>'name',''))>200 or (v_kind='consultation' and length(btrim(coalesce(p_data->>'name','')))<2)
    or coalesce(p_data->>'dni','') !~ '^([0-9]{6,10})?$' or length(coalesce(p_data->>'phone',''))>40
    or length(coalesce(p_data->>'email',''))>254 or (coalesce(p_data->>'email','')<>'' and (p_data->>'email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
    or length(coalesce(p_data->>'notes',''))>2000 then raise exception 'Invalid appointment' using errcode='22023'; end if;
  if v_status in ('completed','no_show') and v_start>now() then raise exception 'FUTURE_ATTENDANCE' using errcode='22023'; end if;
  v_client:=nullif(p_data->>'client_user_id','')::uuid;
  if v_client is not null then
    select pa.* into v_profile from public.patient_accounts pa join public.clinic_client_accounts ca on ca.user_id=pa.user_id
      join auth.users u on u.id=pa.user_id where pa.user_id=v_client and ca.clinic_id=p_clinic_id and u.email_confirmed_at is not null;
    if not found or v_kind='block' then raise exception 'Access denied' using errcode='42501'; end if;
    select email into v_email from auth.users where id=v_client;
    p_data:=p_data||jsonb_build_object('name',v_profile.full_name,'dni',v_profile.dni,'email',v_email,'phone',v_profile.phone);
  end if;
  if p_id is null then
    if p_version is distinct from 0 then raise exception 'CONFLICT'; end if;
    insert into public.appointments(clinic_id,provider_id,client_user_id,contact_name,contact_dni,contact_email,contact_phone,starts_at,ends_at,kind,source,status,private_notes,created_by,updated_by)
      values(p_clinic_id,v_provider,v_client,coalesce(p_data->>'name',''),coalesce(p_data->>'dni',''),coalesce(p_data->>'email',''),coalesce(p_data->>'phone',''),
        v_start,v_start+v_duration*interval '1 minute',v_kind,'staff',v_status,coalesce(p_data->>'notes',''),auth.uid(),auth.uid()) returning id into v_id;
  else
    select * into a from public.appointments where id=p_id and clinic_id=p_clinic_id for update;
    if not found then raise exception 'Access denied' using errcode='42501'; end if;
    if a.version is distinct from p_version then raise exception 'CONFLICT'; end if;
    if not private.is_owner(p_clinic_id) and a.provider_id<>auth.uid() then raise exception 'Access denied' using errcode='42501'; end if;
    if a.client_user_id is not null and v_client is distinct from a.client_user_id then raise exception 'PARTICIPANT_IMMUTABLE' using errcode='22023'; end if;
    if a.client_user_id is not null and v_kind='block' then raise exception 'PARTICIPANT_IMMUTABLE' using errcode='22023'; end if;
    update public.appointments set provider_id=v_provider,client_user_id=v_client,contact_name=coalesce(p_data->>'name',''),contact_dni=coalesce(p_data->>'dni',''),
      contact_email=coalesce(p_data->>'email',''),contact_phone=coalesce(p_data->>'phone',''),starts_at=v_start,ends_at=v_start+v_duration*interval '1 minute',
      kind=v_kind,status=v_status,private_notes=coalesce(p_data->>'notes',''),version=version+1,
      source=case when a.source='web' and v_kind='consultation' and v_duration=30 then 'web' else 'staff' end,updated_at=now(),updated_by=auth.uid()
      where id=p_id returning id into v_id;
  end if;
  return v_id;
end;
$$;

create function public.save_booking_settings(p_clinic_id uuid,p_version integer,p_data jsonb,p_hours jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_provider uuid; v_zone text; v_hour jsonb; v_version integer;
begin
  if not private.is_owner(p_clinic_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select version into v_version from public.booking_settings where clinic_id=p_clinic_id for update;
  if not found or v_version is distinct from p_version then raise exception 'CONFLICT'; end if;
  v_provider:=nullif(p_data->>'provider_id','')::uuid; v_zone:=p_data->>'timezone';
  if v_provider is not null and not exists(select 1 from public.clinic_members where user_id=v_provider and clinic_id=p_clinic_id and active) then raise exception 'Invalid provider' using errcode='22023'; end if;
  if coalesce(p_data->>'slug','') !~ '^[a-z0-9][a-z0-9-]{2,59}$' or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_zone)
    or length(coalesce(p_data->>'provider_name',''))>120 or jsonb_typeof(p_hours) is distinct from 'array' or jsonb_array_length(p_hours)>28
    or ((p_data->>'enabled')::boolean and (v_provider is null or btrim(coalesce(p_data->>'provider_name',''))='' or jsonb_array_length(p_hours)=0)) then
    raise exception 'Invalid booking settings' using errcode='22023';
  end if;
  update public.booking_settings set slug=p_data->>'slug',enabled=(p_data->>'enabled')::boolean,provider_id=v_provider,provider_name=coalesce(p_data->>'provider_name',''),
    timezone=v_zone,advance_days=(p_data->>'advance_days')::integer,lead_minutes=(p_data->>'lead_minutes')::integer,cancel_hours=(p_data->>'cancel_hours')::integer,version=version+1
    where clinic_id=p_clinic_id;
  delete from public.booking_hours where clinic_id=p_clinic_id;
  for v_hour in select value from jsonb_array_elements(p_hours) loop
    insert into public.booking_hours(clinic_id,weekday,opens,closes) values(p_clinic_id,(v_hour->>'weekday')::integer,(v_hour->>'opens')::time,(v_hour->>'closes')::time);
  end loop;
  if exists(select 1 from public.booking_hours a join public.booking_hours b on a.clinic_id=b.clinic_id and a.weekday=b.weekday and a.id<>b.id
    where a.clinic_id=p_clinic_id and a.opens<b.closes and b.opens<a.closes) then raise exception 'OVERLAPPING_HOURS' using errcode='22023'; end if;
end;
$$;

create function public.list_practitioners(p_clinic_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role) order by u.email),'[]'::jsonb)
    into v_result from public.clinic_members m join auth.users u on u.id=m.user_id where m.clinic_id=p_clinic_id and m.active;
  return v_result;
end;
$$;
create function public.list_team(p_clinic_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not private.is_owner(p_clinic_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role,'active',m.active,
    'confirmed',u.email_confirmed_at is not null,'is_self',m.user_id=auth.uid()) order by u.email),'[]'::jsonb)
    into v_result from public.clinic_members m join auth.users u on u.id=m.user_id where m.clinic_id=p_clinic_id;
  return v_result;
end;
$$;

create function public.search_registered_patients(p_clinic_id uuid,p_query text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(contacts)),'[]'::jsonb) into v_result from (
    select a.user_id,a.full_name,a.dni,a.phone,u.email from public.clinic_client_accounts ca
      join public.patient_accounts a on a.user_id=ca.user_id join auth.users u on u.id=a.user_id
    where ca.clinic_id=p_clinic_id and u.email_confirmed_at is not null
      and (translate(lower(a.full_name),'áéíóúüñ','aeiouun') like '%'||translate(lower(left(coalesce(p_query,''),100)),'áéíóúüñ','aeiouun')||'%'
        or a.dni ilike '%'||left(coalesce(p_query,''),100)||'%' or u.email ilike '%'||left(coalesce(p_query,''),100)||'%')
    order by a.full_name limit 50
  ) contacts;
  return v_result;
end;
$$;
revoke all on function public.search_registered_patients(uuid,text) from public,anon,authenticated;
grant execute on function public.search_registered_patients(uuid,text) to authenticated;

create function public.manage_team_member(p_actor uuid,p_target uuid,p_role text,p_active boolean,p_clinic_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_member public.clinic_members;
begin
  perform 1 from public.clinics where id=p_clinic_id for update;
  if not exists(select 1 from public.clinic_members where clinic_id=p_clinic_id and user_id=p_actor and role='owner' and active) then raise exception 'Access denied' using errcode='42501'; end if;
  if p_role not in ('owner','professional') or p_role is null or p_active is null or (p_target=p_actor and (not p_active or p_role<>'owner')) then raise exception 'Invalid role' using errcode='22023'; end if;
  select * into v_member from public.clinic_members where user_id=p_target for update;
  if found and v_member.clinic_id<>p_clinic_id then raise exception 'MEMBER_OTHER_CLINIC' using errcode='22023'; end if;
  if v_member.role='owner' and v_member.active and (p_role<>'owner' or not p_active)
    and (select count(*) from public.clinic_members where clinic_id=p_clinic_id and role='owner' and active)<=1 then raise exception 'LAST_OWNER' using errcode='22023'; end if;
  if not p_active and exists(select 1 from public.appointments where provider_id=p_target and status='confirmed' and ends_at>now()) then raise exception 'MEMBER_HAS_APPOINTMENTS' using errcode='22023'; end if;
  insert into public.clinic_members(user_id,clinic_id,role,active) values(p_target,p_clinic_id,p_role,p_active)
    on conflict(user_id) do update set role=excluded.role,active=excluded.active;
end;
$$;

create table private.team_invite_requests(actor_id uuid not null, created_at timestamptz not null default now());
revoke all on private.team_invite_requests from public,anon,authenticated;
create function public.authorize_team_invite(p_actor uuid,p_clinic_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.clinic_members where user_id=p_actor and clinic_id=p_clinic_id and active and role='owner') then raise exception 'Access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext('invite-'||p_actor::text));
  if (select count(*) from private.team_invite_requests where actor_id=p_actor and created_at>now()-interval '1 hour')>=5 then raise exception 'INVITE_LIMIT' using errcode='22023'; end if;
  insert into private.team_invite_requests(actor_id) values(p_actor);
end;
$$;
revoke all on function public.authorize_team_invite(uuid,uuid) from public,anon,authenticated;
grant execute on function public.authorize_team_invite(uuid,uuid) to service_role;
create function public.resolve_team_user(p_actor uuid,p_clinic_id uuid,p_email text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.clinic_members where user_id=p_actor and clinic_id=p_clinic_id and active and role='owner') then raise exception 'Access denied' using errcode='42501'; end if;
  select id into v_id from auth.users where lower(email)=lower(p_email);
  if exists(select 1 from public.clinic_members where user_id=v_id and clinic_id<>p_clinic_id) then raise exception 'MEMBER_OTHER_CLINIC' using errcode='22023'; end if;
  return v_id;
end;
$$;
revoke all on function public.resolve_team_user(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_team_user(uuid,uuid,text) to service_role;

create function public.claim_appointment_notifications(p_actor uuid,p_appointment uuid default null,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  update private.appointment_notifications set state='failed',error_code='WORKER_TIMEOUT',locked_until=null
    where state='processing' and locked_until<now() and attempts>=8;
  with jobs as (
    select n.id from private.appointment_notifications n join public.appointments a on a.id=n.appointment_id
    where ((n.state='pending' and n.next_attempt_at<=now()) or (n.state='processing' and n.locked_until<now())) and n.attempts<8
      and (p_appointment is null or a.id=p_appointment)
      and (p_actor is null or a.client_user_id=p_actor or exists(select 1 from public.clinic_members m where m.user_id=p_actor and m.clinic_id=a.clinic_id and m.active))
    order by n.created_at limit least(greatest(coalesce(p_limit,10),1),20) for update of n skip locked
  ), claimed as (
    update private.appointment_notifications n set state='processing',attempts=attempts+1,locked_until=now()+interval '5 minutes'
      from jobs j where n.id=j.id returning n.id,n.recipient,n.payload,n.attempts
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into v_result from claimed;
  return v_result;
end;
$$;
create function public.finish_appointment_notification(p_id uuid,p_sent boolean,p_provider_id text default null,p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.appointment_notifications set state=case when p_sent then 'sent' when attempts>=8 then 'failed' else 'pending' end,
    provider_id=left(p_provider_id,200),error_code=left(p_error,60),locked_until=null,
    next_attempt_at=now()+least(power(2,attempts)::integer,360)*interval '1 minute' where id=p_id and state='processing';
end;
$$;

-- Functions are the only client write path. Role metadata from signup is never trusted.
revoke all on function public.save_patient_account(text,text,text,text), public.get_patient_account(), public.list_booking_pages(), public.get_booking_slots(text,date),
  public.book_appointment(text,timestamptz), public.get_my_appointments(),public.change_my_appointment(uuid,integer,timestamptz),
  public.list_agenda(uuid,timestamptz,timestamptz),public.save_staff_appointment(uuid,uuid,integer,jsonb),
  public.save_booking_settings(uuid,integer,jsonb,jsonb),public.list_practitioners(uuid),public.list_team(uuid),
  public.manage_team_member(uuid,uuid,text,boolean,uuid),public.claim_appointment_notifications(uuid,uuid,integer),
  public.finish_appointment_notification(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.list_booking_pages(), public.get_booking_slots(text,date) to anon,authenticated;
grant execute on function public.save_patient_account(text,text,text,text),public.get_patient_account(),public.book_appointment(text,timestamptz),
  public.get_my_appointments(),public.change_my_appointment(uuid,integer,timestamptz),public.list_agenda(uuid,timestamptz,timestamptz),
  public.save_staff_appointment(uuid,uuid,integer,jsonb),public.save_booking_settings(uuid,integer,jsonb,jsonb),
  public.list_practitioners(uuid),public.list_team(uuid) to authenticated;
grant execute on function public.manage_team_member(uuid,uuid,text,boolean,uuid),public.claim_appointment_notifications(uuid,uuid,integer),
  public.finish_appointment_notification(uuid,boolean,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
