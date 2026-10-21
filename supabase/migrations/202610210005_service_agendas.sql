-- Independent public agendas per professional/service. Legacy URLs and bookings survive.
begin;
create table public.services(
  id uuid primary key default gen_random_uuid(),clinic_id uuid not null,specialty_id text not null,
  name text not null check(length(btrim(name)) between 2 and 120),
  duration_minutes integer not null default 30 check(duration_minutes between 15 and 480 and duration_minutes%15=0),
  active boolean not null default true,version integer not null default 1,
  unique(id,clinic_id),foreign key(clinic_id,specialty_id) references public.clinic_specialties(clinic_id,specialty_id)
);
insert into public.services(clinic_id,specialty_id,name) select id,'podologia','Consulta de podología' from public.clinics;
create table public.practitioner_services(
  clinic_id uuid not null,user_id uuid not null,service_id uuid not null,
  primary key(user_id,service_id),foreign key(clinic_id,user_id) references public.clinic_practitioners(clinic_id,user_id),
  foreign key(service_id,clinic_id) references public.services(id,clinic_id)
);
create table public.booking_pages(
  id uuid primary key default gen_random_uuid(),clinic_id uuid not null references public.clinics(id),service_id uuid not null,
  slug text not null unique check(slug~'^[a-z0-9][a-z0-9-]{2,59}$'),enabled boolean not null default false,
  provider_id uuid,provider_name text not null default '' check(length(provider_name)<=120),
  timezone text not null default 'America/Argentina/Buenos_Aires',
  advance_days integer not null default 30 check(advance_days between 1 and 180),
  lead_minutes integer not null default 120 check(lead_minutes between 0 and 10080),cancel_hours integer not null default 12 check(cancel_hours between 0 and 168),
  version integer not null default 1,is_legacy boolean not null default false,
  unique(id,clinic_id),foreign key(service_id,clinic_id) references public.services(id,clinic_id),
  foreign key(clinic_id,provider_id) references public.clinic_practitioners(clinic_id,user_id),
  check(not enabled or (provider_id is not null and btrim(provider_name)<>''))
);
create unique index booking_page_legacy on public.booking_pages(clinic_id) where is_legacy;
create table public.booking_page_aliases(slug text primary key,booking_page_id uuid not null references public.booking_pages(id));
alter table public.booking_page_aliases enable row level security;
revoke all on public.booking_page_aliases from public,anon,authenticated;
grant select on public.booking_page_aliases to service_role;
create function private.booking_page_for_slug(p_slug text) returns uuid language sql stable security definer set search_path='' as $$
  select id from public.booking_pages where slug=p_slug union all select booking_page_id from public.booking_page_aliases where slug=p_slug limit 1;
$$;
revoke all on function private.booking_page_for_slug(text) from public,anon,authenticated;
create table public.availability_rules(
  id uuid primary key default gen_random_uuid(),clinic_id uuid not null,booking_page_id uuid not null,
  weekday integer not null check(weekday between 0 and 6),opens time not null,closes time not null check(closes>opens),
  foreign key(booking_page_id,clinic_id) references public.booking_pages(id,clinic_id),unique(booking_page_id,weekday,opens)
);
insert into public.booking_pages(clinic_id,service_id,slug,enabled,provider_id,provider_name,timezone,advance_days,lead_minutes,cancel_hours,version,is_legacy)
  select b.clinic_id,s.id,b.slug,b.enabled,b.provider_id,b.provider_name,b.timezone,b.advance_days,b.lead_minutes,b.cancel_hours,b.version,true
  from public.booking_settings b join public.services s on s.clinic_id=b.clinic_id;
insert into public.practitioner_services select p.clinic_id,p.provider_id,p.service_id from public.booking_pages p where p.provider_id is not null;
insert into public.availability_rules(id,clinic_id,booking_page_id,weekday,opens,closes)
  select h.id,h.clinic_id,p.id,h.weekday,h.opens,h.closes from public.booking_hours h join public.booking_pages p on p.clinic_id=h.clinic_id and p.is_legacy;

alter table public.appointments add column service_id uuid,add column booking_page_id uuid,add column booking_context jsonb;
alter table public.appointments add foreign key(service_id,clinic_id) references public.services(id,clinic_id);
alter table public.appointments add foreign key(booking_page_id,clinic_id) references public.booking_pages(id,clinic_id);
-- Existing appointments are intentionally not UPDATEd: no extra audit events/emails are generated.
-- Their legacy agenda is resolved at read time; new reservations carry immutable context.

alter table public.services enable row level security;
alter table public.practitioner_services enable row level security;
alter table public.booking_pages enable row level security;
alter table public.availability_rules enable row level security;
revoke all on public.services,public.practitioner_services,public.booking_pages,public.availability_rules from public,anon,authenticated;
grant select on public.services,public.practitioner_services,public.booking_pages,public.availability_rules to service_role;

create function private.can_offer_service(p_clinic_id uuid,p_provider uuid,p_service uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.services s
    join public.clinic_specialties cs on cs.clinic_id=s.clinic_id and cs.specialty_id=s.specialty_id and cs.enabled
    join public.clinic_practitioners p on p.clinic_id=s.clinic_id and p.user_id=p_provider and p.active
    join public.clinic_members m on m.clinic_id=p.clinic_id and m.user_id=p.user_id and m.active and m.role<>'reception'
    join public.practitioner_specialties ps on ps.clinic_id=p.clinic_id and ps.user_id=p.user_id and ps.specialty_id=s.specialty_id
    where s.id=p_service and s.clinic_id=p_clinic_id and s.active);
$$;
create or replace function public.list_practitioners(p_clinic_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role,'display_name',p.display_name,
    'specialty_ids',coalesce((select jsonb_agg(specialty_id) from public.practitioner_specialties where clinic_id=p.clinic_id and user_id=p.user_id),'[]'::jsonb)) order by u.email)
    from public.clinic_members m join public.clinic_practitioners p on p.clinic_id=m.clinic_id and p.user_id=m.user_id and p.active
    join auth.users u on u.id=m.user_id where m.clinic_id=p_clinic_id and m.active and m.role<>'reception'),'[]'::jsonb);
end;$$;

create function public.get_booking_configuration(p_clinic_id uuid,p_page_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.booking_pages;
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  select * into p from public.booking_pages where clinic_id=p_clinic_id and (p_page_id is null or id=p_page_id) order by is_legacy desc,id limit 1;
  if not found then raise exception 'Agenda not found' using errcode='22023';end if;
  return jsonb_build_object('settings',to_jsonb(p)||jsonb_build_object('page_id',p.id,'duration_minutes',(select duration_minutes from public.services where id=p.service_id)),
    'hours',coalesce((select jsonb_agg(jsonb_build_object('weekday',weekday,'opens',to_char(opens,'HH24:MI'),'closes',to_char(closes,'HH24:MI')) order by weekday,opens) from public.availability_rules where booking_page_id=p.id),'[]'::jsonb),
    'practitioners',public.list_practitioners(p_clinic_id),
    'pages',coalesce((select jsonb_agg(jsonb_build_object('page_id',id,'slug',slug,'provider_name',provider_name,'service_id',service_id,'enabled',enabled) order by is_legacy desc,slug) from public.booking_pages where clinic_id=p_clinic_id),'[]'::jsonb),
    'services',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('legacy_default',exists(select 1 from public.booking_pages where service_id=s.id and is_legacy)) order by s.name) from public.services s where s.clinic_id=p_clinic_id),'[]'::jsonb));
end;$$;

create function public.save_service(p_clinic_id uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not private.is_owner(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  if p_id is not null and exists(select 1 from public.booking_pages where service_id=p_id and is_legacy) and (p_data->>'duration_minutes')::integer<>30 then raise exception 'LEGACY_DURATION_FIXED' using errcode='22023';end if;
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'name') is distinct from 'string'
    or jsonb_typeof(p_data->'active') is distinct from 'boolean' or jsonb_typeof(p_data->'duration_minutes') is distinct from 'number'
    or p_data->>'duration_minutes' !~'^[0-9]+$' then raise exception 'Invalid service' using errcode='22023';end if;
  if p_id is null then
    if p_version is distinct from 0 then raise exception 'CONFLICT';end if;
    insert into public.services(clinic_id,specialty_id,name,duration_minutes,active)
      values(p_clinic_id,p_data->>'specialty_id',btrim(p_data->>'name'),(p_data->>'duration_minutes')::integer,(p_data->>'active')::boolean) returning id into v_id;
  else
    update public.services set name=btrim(p_data->>'name'),duration_minutes=(p_data->>'duration_minutes')::integer,active=(p_data->>'active')::boolean,version=version+1
      where clinic_id=p_clinic_id and id=p_id and version=p_version and specialty_id=p_data->>'specialty_id' returning id into v_id;
    if not found then raise exception 'CONFLICT';end if;
  end if;
  return v_id;
end;$$;

create function public.save_booking_page(p_clinic_id uuid,p_id uuid,p_version integer,p_data jsonb,p_hours jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.booking_pages;s public.services;v_provider uuid;v_hour jsonb;v_id uuid;v_zone text;
begin
  if not private.is_owner(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_hours) is distinct from 'array' or jsonb_array_length(p_hours)>28
    or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'Invalid page' using errcode='22023';end if;
  if p_id is not null then
    select * into p from public.booking_pages where id=p_id and clinic_id=p_clinic_id for update;
    if not found or p.version is distinct from p_version then raise exception 'CONFLICT';end if;
  elsif p_version is distinct from 0 then raise exception 'CONFLICT';end if;
  select * into s from public.services where id=(p_data->>'service_id')::uuid and clinic_id=p_clinic_id;
  if not found then raise exception 'Invalid service' using errcode='22023';end if;
  v_provider:=nullif(p_data->>'provider_id','')::uuid;v_zone:=p_data->>'timezone';
  if coalesce(p_data->>'slug','')!~'^[a-z0-9][a-z0-9-]{2,59}$' or not exists(select 1 from pg_catalog.pg_timezone_names where name=v_zone)
    or length(coalesce(p_data->>'provider_name',''))>120 or ((p_data->>'enabled')::boolean and
      (not private.can_offer_service(p_clinic_id,v_provider,s.id) or v_provider is null or btrim(coalesce(p_data->>'provider_name',''))='' or jsonb_array_length(p_hours)=0)) then raise exception 'Invalid booking settings' using errcode='22023';end if;
  if v_provider is not null and not private.can_offer_service(p_clinic_id,v_provider,s.id) then raise exception 'Invalid provider' using errcode='22023';end if;
  foreach v_zone in array array['advance_days','lead_minutes','cancel_hours'] loop
    if jsonb_typeof(p_data->v_zone) is distinct from 'number' or p_data->>v_zone !~'^[0-9]+$' then raise exception 'Invalid booking rule' using errcode='22023';end if;
  end loop;
  for v_hour in select value from jsonb_array_elements(p_hours) loop
    if jsonb_typeof(v_hour->'weekday') is distinct from 'number' or v_hour->>'weekday' !~'^[0-6]$'
      or coalesce(v_hour->>'opens','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(v_hour->>'closes','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or (v_hour->>'closes')::time-(v_hour->>'opens')::time<s.duration_minutes*interval '1 minute' then raise exception 'Invalid opening hours' using errcode='22023';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_hours) with ordinality a(value,n) join jsonb_array_elements(p_hours) with ordinality b(value,n)
    on a.n<b.n and a.value->>'weekday'=b.value->>'weekday' where (a.value->>'opens')::time<(b.value->>'closes')::time and (b.value->>'opens')::time<(a.value->>'closes')::time) then raise exception 'OVERLAPPING_HOURS' using errcode='22023';end if;
  if exists(select 1 from public.booking_page_aliases where slug=p_data->>'slug' and booking_page_id is distinct from p_id) then raise exception 'Duplicate slug' using errcode='23505';end if;
  if p_id is null then
    insert into public.booking_pages(clinic_id,service_id,slug,enabled,provider_id,provider_name,timezone,advance_days,lead_minutes,cancel_hours)
      values(p_clinic_id,s.id,p_data->>'slug',(p_data->>'enabled')::boolean,v_provider,coalesce(p_data->>'provider_name',''),p_data->>'timezone',
        (p_data->>'advance_days')::integer,(p_data->>'lead_minutes')::integer,(p_data->>'cancel_hours')::integer) returning id into v_id;
  else
    -- A public URL keeps its service/professional identity once bookings exist.
    if (p.service_id<>s.id or p.provider_id is distinct from v_provider) and exists(select 1 from public.appointments where booking_page_id=p.id or (booking_page_id is null and clinic_id=p_clinic_id and source='web' and p.is_legacy)) then raise exception 'AGENDA_HAS_APPOINTMENTS' using errcode='22023';end if;
    if p.slug<>p_data->>'slug' then insert into public.booking_page_aliases values(p.slug,p.id) on conflict do nothing;end if;
    update public.booking_pages set service_id=s.id,slug=p_data->>'slug',enabled=(p_data->>'enabled')::boolean,provider_id=v_provider,provider_name=coalesce(p_data->>'provider_name',''),
      timezone=p_data->>'timezone',advance_days=(p_data->>'advance_days')::integer,lead_minutes=(p_data->>'lead_minutes')::integer,cancel_hours=(p_data->>'cancel_hours')::integer,version=version+1 where id=p.id returning id into v_id;
  end if;
  if v_provider is not null then insert into public.practitioner_services values(p_clinic_id,v_provider,s.id) on conflict do nothing;end if;
  delete from public.availability_rules where booking_page_id=v_id;
  insert into public.availability_rules(clinic_id,booking_page_id,weekday,opens,closes) select p_clinic_id,v_id,(value->>'weekday')::integer,(value->>'opens')::time,(value->>'closes')::time from jsonb_array_elements(p_hours);
  if p.is_legacy then
    update public.booking_settings set slug=p_data->>'slug',enabled=(p_data->>'enabled')::boolean,provider_id=v_provider,provider_name=coalesce(p_data->>'provider_name',''),timezone=p_data->>'timezone',
      advance_days=(p_data->>'advance_days')::integer,lead_minutes=(p_data->>'lead_minutes')::integer,cancel_hours=(p_data->>'cancel_hours')::integer,version=version+1 where clinic_id=p_clinic_id;
    delete from public.booking_hours where clinic_id=p_clinic_id;
    insert into public.booking_hours(clinic_id,weekday,opens,closes) select p_clinic_id,weekday,opens,closes from public.availability_rules where booking_page_id=v_id;
  end if;
  return v_id;
end;$$;
create or replace function public.save_booking_settings(p_clinic_id uuid,p_version integer,p_data jsonb,p_hours jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p public.booking_pages;
begin
  select * into p from public.booking_pages where clinic_id=p_clinic_id and is_legacy;
  perform public.save_booking_page(p_clinic_id,p.id,p_version,p_data||jsonb_build_object('service_id',p.service_id),p_hours);
end;$$;

create or replace function public.list_booking_pages() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug',p.slug,'name',coalesce(nullif(c.settings->>'name',''),'Consultorio'),'address',c.settings->>'address','phone',c.settings->>'phone',
    'provider_id',p.provider_id,'provider_name',p.provider_name,'timezone',p.timezone,'advance_days',p.advance_days,'lead_minutes',p.lead_minutes,'cancel_hours',p.cancel_hours,
    'aliases',coalesce((select jsonb_agg(slug) from public.booking_page_aliases where booking_page_id=p.id),'[]'::jsonb),'duration_minutes',s.duration_minutes,'service_id',s.id,'service_name',s.name,'specialty_id',s.specialty_id) order by c.settings->>'name',s.name,p.provider_name,p.slug),'[]'::jsonb)
    from public.booking_pages p join public.services s on s.id=p.service_id join public.clinics c on c.id=p.clinic_id
    join public.practitioner_services ps on ps.service_id=s.id and ps.user_id=p.provider_id
    where p.enabled and private.can_offer_service(p.clinic_id,p.provider_id,p.service_id);
$$;
create or replace function public.get_booking_slots(p_slug text,p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.booking_pages;v_duration integer;v_result jsonb;
begin
  select * into p from public.booking_pages where id=private.booking_page_for_slug(p_slug) and enabled;
  if not found or not private.can_offer_service(p.clinic_id,p.provider_id,p.service_id) then return '[]'::jsonb;end if;
  if p_date is null or p_date<(now() at time zone p.timezone)::date or p_date>(now() at time zone p.timezone)::date+p.advance_days then return '[]'::jsonb;end if;
  select duration_minutes into v_duration from public.services where id=p.service_id;
  select coalesce(jsonb_agg(distinct slot order by slot),'[]'::jsonb) into v_result from public.availability_rules h
    cross join lateral generate_series((p_date+h.opens) at time zone p.timezone,((p_date+h.closes) at time zone p.timezone)-v_duration*interval '1 minute',v_duration*interval '1 minute') slot
    where h.booking_page_id=p.id and h.weekday=extract(dow from p_date) and slot>=now()+p.lead_minutes*interval '1 minute'
      and not exists(select 1 from public.appointments a where a.provider_id=p.provider_id and a.status<>'cancelled' and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(slot,slot+v_duration*interval '1 minute','[)'));
  return v_result;
end;$$;
create or replace function public.book_appointment(p_slug text,p_starts_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.verified_user();p public.booking_pages;s public.services;a public.patient_accounts;v_id uuid;v_email text;
begin
  select * into p from public.booking_pages where id=private.booking_page_for_slug(p_slug) and enabled for share;
  if not found then raise exception 'BOOKING_CLOSED' using errcode='22023';end if;
  select * into s from public.services where id=p.service_id for share;
  select * into a from public.patient_accounts where user_id=v_uid;
  if not found then raise exception 'PROFILE_REQUIRED' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if (select count(*) from public.appointment_events where actor_id=v_uid and created_at>now()-interval '1 hour')>=10 then raise exception 'BOOKING_RATE_LIMIT' using errcode='22023';end if;
  if p_starts_at is null or not(public.get_booking_slots(p_slug,(p_starts_at at time zone p.timezone)::date)@>jsonb_build_array(p_starts_at)) then raise exception 'SLOT_UNAVAILABLE' using errcode='22023';end if;
  select email into v_email from auth.users where id=v_uid;
  insert into public.clinic_client_accounts values(p.clinic_id,v_uid,now()) on conflict do nothing;
  insert into public.appointments(clinic_id,provider_id,client_user_id,contact_name,contact_dni,contact_email,contact_phone,starts_at,ends_at,source,created_by,updated_by,service_id,booking_page_id,booking_context)
    values(p.clinic_id,p.provider_id,v_uid,a.full_name,a.dni,v_email,a.phone,p_starts_at,p_starts_at+s.duration_minutes*interval '1 minute','web',v_uid,v_uid,s.id,p.id,
      jsonb_build_object('service_name',s.name,'provider_name',p.provider_name,'timezone',p.timezone,'cancel_hours',p.cancel_hours)) returning id into v_id;
  return v_id;
end;$$;
create or replace function public.get_my_appointments() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,'version',a.version,'source',a.source,
    'clinic_name',c.settings->>'name','phone',c.settings->>'phone','address',c.settings->>'address','provider_id',a.provider_id,
    'provider_name',coalesce(a.booking_context->>'provider_name',case when p.provider_id=a.provider_id then p.provider_name else 'Profesional del consultorio' end),
    'service_name',coalesce(a.booking_context->>'service_name',s.name),'timezone',coalesce(a.booking_context->>'timezone',p.timezone),
    'slug',p.slug,'cancel_hours',coalesce((a.booking_context->>'cancel_hours')::integer,p.cancel_hours),'advance_days',p.advance_days,
    'can_reschedule',a.source='web' and a.ends_at-a.starts_at=s.duration_minutes*interval '1 minute' and a.provider_id=p.provider_id and p.enabled and private.can_offer_service(p.clinic_id,a.provider_id,p.service_id),
    'notification_state',(select n.state from private.appointment_notifications n where n.appointment_id=a.id order by n.version desc limit 1)) order by a.starts_at desc),'[]'::jsonb)
    from public.appointments a join public.clinics c on c.id=a.clinic_id
    left join public.booking_pages p on p.clinic_id=a.clinic_id and (p.id=a.booking_page_id or (a.booking_page_id is null and p.is_legacy))
    left join public.services s on s.id=p.service_id where a.client_user_id=auth.uid() and a.kind='consultation';
$$;
create or replace function public.change_my_appointment(p_id uuid,p_version integer,p_starts_at timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.verified_user();a public.appointments;p public.booking_pages;v_cancel integer;
begin
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if (select count(*) from public.appointment_events where actor_id=v_uid and created_at>now()-interval '1 hour')>=10 then raise exception 'BOOKING_RATE_LIMIT' using errcode='22023';end if;
  select * into a from public.appointments where id=p_id and client_user_id=v_uid for update;
  if not found then raise exception 'Access denied' using errcode='42501';end if;
  select * into p from public.booking_pages where clinic_id=a.clinic_id and (id=a.booking_page_id or(a.booking_page_id is null and is_legacy)) for share;
  if a.version is distinct from p_version then raise exception 'CONFLICT';end if;
  v_cancel:=coalesce((a.booking_context->>'cancel_hours')::integer,p.cancel_hours);
  if a.status<>'confirmed' or a.starts_at<=now()+v_cancel*interval '1 hour' then raise exception 'CHANGE_DEADLINE' using errcode='22023';end if;
  if p_starts_at is null then
    update public.appointments set status='cancelled',version=version+1,updated_at=now(),updated_by=v_uid where id=p_id;
  else
    if a.source<>'web' or p.id is null or a.provider_id<>p.provider_id or a.ends_at-a.starts_at<>(select duration_minutes*interval '1 minute' from public.services where id=p.service_id)
      or not(public.get_booking_slots(p.slug,(p_starts_at at time zone p.timezone)::date)@>jsonb_build_array(p_starts_at)) then raise exception 'SLOT_UNAVAILABLE' using errcode='22023';end if;
    update public.appointments set starts_at=p_starts_at,ends_at=p_starts_at+(a.ends_at-a.starts_at),version=version+1,updated_at=now(),updated_by=v_uid where id=p_id;
  end if;
end;$$;

-- Staff writer, redacted agenda and notification context follow below.

create function private.validate_service_appointment() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.services;p public.booking_pages;
begin
  if new.kind='block' then new.service_id:=null;new.booking_page_id:=null;new.booking_context:=null;return new;end if;
  if new.service_id is null then select service_id into new.service_id from public.booking_pages where clinic_id=new.clinic_id and is_legacy;end if;
  select * into s from public.services where id=new.service_id and clinic_id=new.clinic_id;
  if not found then raise exception 'Invalid service' using errcode='22023';end if;
  if tg_op='INSERT' then
    if not private.can_offer_service(new.clinic_id,new.provider_id,new.service_id) then raise exception 'Invalid provider' using errcode='22023';end if;
  elsif (new.provider_id,new.service_id) is distinct from (old.provider_id,old.service_id) and (old.service_id is not null or new.provider_id<>old.provider_id) then
    if not private.can_offer_service(new.clinic_id,new.provider_id,new.service_id) then raise exception 'Invalid provider' using errcode='22023';end if;
  end if;
  if tg_op='UPDATE' and (new.provider_id,new.service_id) is distinct from (old.provider_id,old.service_id) then new.booking_context:=null;end if;
  if new.booking_page_id is not null then
    select * into p from public.booking_pages where id=new.booking_page_id and clinic_id=new.clinic_id;
    if p.service_id<>new.service_id or p.provider_id<>new.provider_id then
      if new.source='web' then raise exception 'Invalid booking page' using errcode='22023';end if;
      new.booking_page_id:=null;
    end if;
  end if;
  if new.booking_context is null then
    new.booking_context:=jsonb_build_object('service_name',s.name,'timezone',coalesce(p.timezone,(select timezone from public.booking_settings where clinic_id=new.clinic_id)),
      'cancel_hours',coalesce(p.cancel_hours,(select cancel_hours from public.booking_settings where clinic_id=new.clinic_id)),
      'provider_name',coalesce(nullif((select display_name from public.clinic_practitioners where clinic_id=new.clinic_id and user_id=new.provider_id),''),'Profesional del consultorio'));
  end if;
  return new;
end;$$;
create trigger appointment_service_context before insert or update on public.appointments for each row execute function private.validate_service_appointment();

create function private.can_manage_appointment_notes(p_clinic_id uuid,p_provider_id uuid,p_service_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.clinic_members m where m.clinic_id=p_clinic_id and m.user_id=auth.uid() and m.active and m.role<>'reception' and
    (p_provider_id=auth.uid() or exists(select 1 from public.member_specialties ms where ms.clinic_id=m.clinic_id and ms.user_id=m.user_id and ms.can_read and ms.scope='all'
      and ms.specialty_id=coalesce((select specialty_id from public.services where id=p_service_id),'podologia'))));
$$;
revoke all on function private.can_manage_appointment_notes(uuid,uuid,uuid) from public,anon,authenticated;
create or replace function public.list_agenda(p_clinic_id uuid,p_from timestamptz,p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_reception boolean:=private.is_reception(p_clinic_id);
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '32 days' then raise exception 'Invalid range' using errcode='22023';end if;
  return coalesce((select jsonb_agg((case when v_reception or not private.can_manage_appointment_notes(a.clinic_id,a.provider_id,a.service_id) then to_jsonb(a)-'private_notes' else to_jsonb(a) end)||jsonb_build_object('can_manage_notes',private.can_manage_appointment_notes(a.clinic_id,a.provider_id,a.service_id),'notification_state',
    (select n.state from private.appointment_notifications n where n.appointment_id=a.id order by n.version desc limit 1)) order by a.starts_at,a.id)
    from public.appointments a where a.clinic_id=p_clinic_id and a.starts_at<p_to and a.ends_at>p_from),'[]'::jsonb);
end;$$;

create function private.initialize_service_agenda() returns trigger language plpgsql security definer set search_path='' as $$
declare v_service uuid;
begin
  insert into public.services(clinic_id,specialty_id,name) values(new.clinic_id,'podologia','Consulta de podología') returning id into v_service;
  insert into public.booking_pages(clinic_id,service_id,slug,is_legacy,timezone) values(new.clinic_id,v_service,new.slug,true,new.timezone);
  return new;
end;$$;
create trigger service_agenda_defaults after insert on public.booking_settings for each row execute function private.initialize_service_agenda();

create function private.is_reception(p_clinic_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.clinic_members where clinic_id=p_clinic_id and user_id=auth.uid() and active and role='reception')$$;

create or replace function public.save_staff_appointment(p_clinic_id uuid,p_id uuid,p_version integer,p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_provider uuid; v_start timestamptz; v_duration integer; v_kind text; v_status text; a public.appointments; v_service uuid; v_client uuid; v_profile public.patient_accounts; v_email text;
begin
  if not private.is_member(p_clinic_id) then raise exception 'Access denied' using errcode='42501'; end if;
  if private.is_reception(p_clinic_id) and coalesce(p_data->>'notes','')<>'' then raise exception 'Access denied' using errcode='42501'; end if;
  v_service:=nullif(p_data->>'service_id','')::uuid;
  v_provider:=(p_data->>'provider_id')::uuid; v_start:=(p_data->>'starts_at')::timestamptz;
  v_duration:=(p_data->>'duration_minutes')::integer; v_kind:=coalesce(p_data->>'kind','consultation'); v_status:=coalesce(p_data->>'status','confirmed');
  if not exists(select 1 from public.clinic_members m join public.clinic_practitioners p on p.clinic_id=m.clinic_id and p.user_id=m.user_id and p.active where m.clinic_id=p_clinic_id and m.user_id=v_provider and m.active and m.role<>'reception')
    or (not (private.is_owner(p_clinic_id) or private.is_reception(p_clinic_id)) and v_provider<>auth.uid()) then raise exception 'Access denied' using errcode='42501'; end if;
  if not private.can_manage_appointment_notes(p_clinic_id,v_provider,v_service) and coalesce(p_data->>'notes','')<>'' then raise exception 'Access denied' using errcode='42501';end if;
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
    insert into public.appointments(clinic_id,provider_id,client_user_id,contact_name,contact_dni,contact_email,contact_phone,starts_at,ends_at,kind,source,status,private_notes,created_by,updated_by,service_id)
      values(p_clinic_id,v_provider,v_client,coalesce(p_data->>'name',''),coalesce(p_data->>'dni',''),coalesce(p_data->>'email',''),coalesce(p_data->>'phone',''),
        v_start,v_start+v_duration*interval '1 minute',v_kind,'staff',v_status,coalesce(p_data->>'notes',''),auth.uid(),auth.uid(),v_service) returning id into v_id;
  else
    select * into a from public.appointments where id=p_id and clinic_id=p_clinic_id for update;
    if not found then raise exception 'Access denied' using errcode='42501'; end if;
    if a.version is distinct from p_version then raise exception 'CONFLICT'; end if;
    if not (private.is_owner(p_clinic_id) or private.is_reception(p_clinic_id)) and a.provider_id<>auth.uid() then raise exception 'Access denied' using errcode='42501'; end if;
    if a.client_user_id is not null and v_client is distinct from a.client_user_id then raise exception 'PARTICIPANT_IMMUTABLE' using errcode='22023'; end if;
    if a.client_user_id is not null and v_kind='block' then raise exception 'PARTICIPANT_IMMUTABLE' using errcode='22023'; end if;
    update public.appointments set provider_id=v_provider,client_user_id=v_client,contact_name=coalesce(p_data->>'name',''),contact_dni=coalesce(p_data->>'dni',''),
      contact_email=coalesce(p_data->>'email',''),contact_phone=coalesce(p_data->>'phone',''),starts_at=v_start,ends_at=v_start+v_duration*interval '1 minute',
      kind=v_kind,status=v_status,service_id=coalesce(v_service,a.service_id),private_notes=case when private.can_manage_appointment_notes(p_clinic_id,v_provider,coalesce(v_service,a.service_id)) then coalesce(p_data->>'notes','') else a.private_notes end,version=version+1,
      source=case when a.source='web' and v_kind='consultation' and v_duration=extract(epoch from(a.ends_at-a.starts_at))/60 and v_provider=a.provider_id and (v_service is null or v_service=a.service_id) then 'web' else 'staff' end,updated_at=now(),updated_by=auth.uid()
      where id=p_id returning id into v_id;
  end if;
  return v_id;
end;
$$;
create or replace function public.save_patient_account(p_name text,p_dni text,p_phone text,p_slug text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.verified_user(); v_dni text := regexp_replace(coalesce(p_dni,''),'[.\s-]','','g'); v_result jsonb; v_clinic uuid;
begin
  if p_name is null or length(btrim(p_name)) not between 2 and 200 or v_dni !~ '^[0-9]{6,10}$' or p_phone is null or length(p_phone)>40 then raise exception 'Invalid profile' using errcode='22023'; end if;
  if exists(select 1 from public.patient_accounts where user_id=v_uid and dni<>v_dni) then raise exception 'DNI_IMMUTABLE' using errcode='22023'; end if;
  insert into public.patient_accounts(user_id,full_name,dni,phone) values(v_uid,btrim(p_name),v_dni,btrim(p_phone))
    on conflict(user_id) do update set full_name=excluded.full_name, phone=excluded.phone, updated_at=now();
  if p_slug is not null then select clinic_id into v_clinic from public.booking_pages where id=private.booking_page_for_slug(p_slug);
  elsif (select count(*) from public.clinics)=1 then select id into v_clinic from public.clinics limit 1;
  end if;
  -- Sharing contact data with the selected consultorio never creates a clinical link.
  if v_clinic is not null then insert into public.clinic_client_accounts(clinic_id,user_id) values(v_clinic,v_uid) on conflict do nothing; end if;
  select to_jsonb(a) || jsonb_build_object('email',u.email) into v_result from public.patient_accounts a join auth.users u on u.id=a.user_id where a.user_id=v_uid;
  return v_result;
end;
$$;
create or replace function private.record_appointment_event() returns trigger
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
      'starts_at',new.starts_at,'ends_at',new.ends_at,'timezone',coalesce(new.booking_context->>'timezone',s.timezone,'America/Argentina/Buenos_Aires')));
  return new;
end;
$$;

revoke all on function private.is_reception(uuid),private.can_offer_service(uuid,uuid,uuid),private.validate_service_appointment(),private.initialize_service_agenda() from public,anon,authenticated;
revoke all on function public.get_booking_configuration(uuid,uuid),public.save_service(uuid,uuid,integer,jsonb),public.save_booking_page(uuid,uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.get_booking_configuration(uuid,uuid),public.save_service(uuid,uuid,integer,jsonb),public.save_booking_page(uuid,uuid,integer,jsonb,jsonb) to authenticated;
commit;
