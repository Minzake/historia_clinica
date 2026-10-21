-- New writes are validated without cancelling or rewriting existing appointments.
begin;

create index appointments_active_patient on public.appointments(provider_id,contact_dni)
  where kind='consultation' and status='confirmed';

create function private.validate_appointment() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_dni text;
begin
  if new.kind='block' then
    if new.status not in ('confirmed','cancelled') then raise exception 'INVALID_BLOCK_STATUS' using errcode='22023'; end if;
    return new;
  end if;
  if new.status<>'confirmed' or new.starts_at<=now() then return new; end if;
  v_dni:=new.contact_dni;
  if new.client_user_id is not null then
    select dni into v_dni from public.patient_accounts where user_id=new.client_user_id;
  elsif new.patient_id is not null then
    select dni into v_dni from public.patients where id=new.patient_id and clinic_id=new.clinic_id;
  end if;
  if coalesce(v_dni,'') !~ '^[0-9]{6,10}$' then raise exception 'APPOINTMENT_DNI_REQUIRED' using errcode='22023'; end if;
  new.contact_dni:=v_dni;

  -- Every write path uses the same identity and lock, including manual/unlinked bookings.
  -- VOLATILE trigger queries see commits made while waiting for this transaction lock.
  perform pg_advisory_xact_lock(hashtextextended('appointment:'||new.provider_id::text||':'||v_dni,0));
  if tg_op='UPDATE' then
    -- Moving an existing active booking does not create a second booking. This also
    -- lets staff resolve legacy duplicates without cancelling them automatically.
    if old.kind='consultation' and old.status='confirmed' and old.starts_at>now()
      and old.provider_id=new.provider_id and old.contact_dni=v_dni
      and old.client_user_id is not distinct from new.client_user_id
      and old.patient_id is not distinct from new.patient_id then return new; end if;
  end if;
  if exists(select 1 from public.appointments a
    left join public.patient_accounts pa on pa.user_id=a.client_user_id
    left join public.patients p on p.id=a.patient_id and p.clinic_id=a.clinic_id
    where a.id<>new.id and a.provider_id=new.provider_id and a.kind='consultation'
      and a.status='confirmed' and a.starts_at>now()
      and (a.contact_dni=v_dni or pa.dni=v_dni or p.dni=v_dni)) then
    raise exception 'BOOKING_LIMIT' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_appointment() from public,anon,authenticated;
create trigger appointment_validation before insert or update on public.appointments
  for each row execute function private.validate_appointment();

create or replace function public.book_appointment(p_slug text,p_starts_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.verified_user(); s public.booking_settings; a public.patient_accounts; v_id uuid; v_email text;
begin
  select * into s from public.booking_settings where slug=p_slug and enabled for share;
  if not found then raise exception 'BOOKING_CLOSED' using errcode='22023'; end if;
  select * into a from public.patient_accounts where user_id=v_uid;
  if not found then raise exception 'PROFILE_REQUIRED' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  if (select count(*) from public.appointment_events where actor_id=v_uid and created_at>now()-interval '1 hour')>=10 then
    raise exception 'BOOKING_RATE_LIMIT' using errcode='22023';
  end if;
  if p_starts_at is null or not(public.get_booking_slots(p_slug,(p_starts_at at time zone s.timezone)::date) @> jsonb_build_array(p_starts_at)) then
    raise exception 'SLOT_UNAVAILABLE' using errcode='22023';
  end if;
  select email into v_email from auth.users where id=v_uid;
  insert into public.clinic_client_accounts(clinic_id,user_id) values(s.clinic_id,v_uid) on conflict do nothing;
  insert into public.appointments(clinic_id,provider_id,client_user_id,contact_name,contact_dni,contact_email,contact_phone,
    starts_at,ends_at,source,created_by,updated_by)
    values(s.clinic_id,s.provider_id,v_uid,a.full_name,a.dni,v_email,a.phone,p_starts_at,p_starts_at+interval '30 minutes','web',v_uid,v_uid)
    returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_booking_pages() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug',s.slug,'name',coalesce(nullif(c.settings->>'name',''),'Consultorio'),
    'address',c.settings->>'address','phone',c.settings->>'phone','provider_id',s.provider_id,'provider_name',s.provider_name,'timezone',s.timezone,
    'advance_days',s.advance_days,'lead_minutes',s.lead_minutes,'cancel_hours',s.cancel_hours,'duration_minutes',30) order by s.slug),'[]'::jsonb)
  from public.booking_settings s join public.clinics c on c.id=s.clinic_id
  join public.clinic_members m on m.user_id=s.provider_id and m.clinic_id=s.clinic_id and m.active where s.enabled;
$$;

create or replace function public.get_my_appointments() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,
    'version',a.version,'source',a.source,'clinic_name',c.settings->>'name','phone',c.settings->>'phone','address',c.settings->>'address',
    'provider_id',a.provider_id,'provider_name',case when a.provider_id=s.provider_id then s.provider_name else 'Profesional del consultorio' end,
    'timezone',s.timezone,'slug',s.slug,'cancel_hours',s.cancel_hours,'advance_days',s.advance_days,
    'can_reschedule',a.source='web' and a.ends_at-a.starts_at=interval '30 minutes' and a.provider_id=s.provider_id and s.enabled
      and exists(select 1 from public.clinic_members m where m.clinic_id=a.clinic_id and m.user_id=a.provider_id and m.active),
    'notification_state',(select n.state from private.appointment_notifications n where n.appointment_id=a.id order by n.version desc limit 1)) order by a.starts_at desc),'[]'::jsonb)
  from public.appointments a join public.clinics c on c.id=a.clinic_id join public.booking_settings s on s.clinic_id=a.clinic_id
  where a.client_user_id=auth.uid() and a.kind='consultation';
$$;

create function private.validate_questionnaires() returns trigger
language plpgsql set search_path='' as $$
declare v_labels text[]:=array['Diabetes','VPP - NPP','Enfermedades cardíacas','Hipertensión','Hipotensión','Convulsiones','Asma','Alergias','VIH / Sida - Sífilis - Otras','Hepatitis','Tuberculosis','Infecciones','Fracturas / Esguinces','Luxaciones','Colesterol','Tiroides','Está anticoagulado','Otros (detallar)'];
  v_vaccines text[]:=array['Antitetánica','Hepatitis B','Otras (detallar)']; v_i integer;
begin
  if jsonb_typeof(new.antecedents) is distinct from 'array' or jsonb_typeof(new.vaccines) is distinct from 'array' then
    raise exception 'QUESTIONNAIRE_INVALID' using errcode='22023';
  end if;
  if jsonb_array_length(new.antecedents)<>18 or jsonb_array_length(new.vaccines)<>3 then
    raise exception 'QUESTIONNAIRE_INVALID' using errcode='22023';
  end if;
  for v_i in 0..17 loop
    if new.antecedents->v_i->>'id' is distinct from v_i::text or new.antecedents->v_i->>'label' is distinct from v_labels[v_i+1] then
      raise exception 'QUESTIONNAIRE_INVALID' using errcode='22023';
    end if;
  end loop;
  for v_i in 0..2 loop
    if new.vaccines->v_i->>'id' is distinct from 'v'||v_i::text or new.vaccines->v_i->>'label' is distinct from v_vaccines[v_i+1] then
      raise exception 'QUESTIONNAIRE_INVALID' using errcode='22023';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.validate_questionnaires() from public,anon,authenticated;
create trigger questionnaire_validation before insert or update on public.clinical_records
  for each row execute function private.validate_questionnaires();

create function private.validate_clinic_email() returns trigger
language plpgsql set search_path='' as $$
begin
  if coalesce(new.settings->>'email','')<>'' and (new.settings->>'email') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'INVALID_EMAIL' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_clinic_email() from public,anon,authenticated;
create trigger clinic_email_validation before insert or update of settings on public.clinics
  for each row execute function private.validate_clinic_email();

notify pgrst, 'reload schema';
commit;
