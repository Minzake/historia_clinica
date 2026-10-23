-- Public visual identity is stored separately from clinical data and PDF snapshots.
begin;
create table public.clinic_branding (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  logo text not null default '' check(length(logo)<=240022),
  favicon text not null default '' check(length(favicon)<=40022),
  updated_at timestamptz not null default now()
);
alter table public.clinic_branding enable row level security;
revoke all on public.clinic_branding from public,anon,authenticated;
grant select,insert,update,delete on public.clinic_branding to service_role;

create function private.validate_brand_image(p_image text,p_dimension integer,p_bytes integer) returns void
language plpgsql immutable set search_path='' as $$
declare data bytea;w bigint;h bigint;
begin
  if p_image='' then return;end if;
  if p_image is null or length(p_image)>22+4*ceil(p_bytes/3.0) or p_image !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'INVALID_BRAND_IMAGE' using errcode='22023';end if;
  begin data:=decode(substr(p_image,23),'base64');exception when others then raise exception 'INVALID_BRAND_IMAGE' using errcode='22023';end;
  if octet_length(data)<45 or octet_length(data)>p_bytes or substr(data,1,8)<>decode('89504e470d0a1a0a','hex') or substr(data,9,8)<>decode('0000000d49484452','hex') or substr(data,octet_length(data)-11,12)<>decode('0000000049454e44ae426082','hex') then raise exception 'INVALID_BRAND_IMAGE' using errcode='22023';end if;
  w:=get_byte(data,16)::bigint*16777216+get_byte(data,17)*65536+get_byte(data,18)*256+get_byte(data,19);
  h:=get_byte(data,20)::bigint*16777216+get_byte(data,21)*65536+get_byte(data,22)*256+get_byte(data,23);
  if w<1 or h<1 or w>p_dimension or h>p_dimension then raise exception 'INVALID_BRAND_IMAGE' using errcode='22023';end if;
end;$$;
revoke all on function private.validate_brand_image(text,integer,integer) from public,anon,authenticated;

create function public.get_clinic_branding(p_clinic_id uuid default null,p_slug text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid;
begin
  if p_clinic_id is not null then target:=p_clinic_id;
  elsif nullif(p_slug,'') is not null then
    select clinic_id into target from public.booking_pages where slug=p_slug;
    if target is null then select p.clinic_id into target from public.booking_page_aliases a join public.booking_pages p on p.id=a.booking_page_id where a.slug=p_slug;end if;
  else
    select min(id::text)::uuid into target from public.clinics having count(*)=1;
  end if;
  return (select jsonb_build_object('clinicId',c.id,'name',coalesce(nullif(c.settings->>'name',''),'Consultorio'),'logo',coalesce(b.logo,''),'favicon',coalesce(b.favicon,''))
    from public.clinics c left join public.clinic_branding b on b.clinic_id=c.id where c.id=target);
end;$$;
revoke all on function public.get_clinic_branding(uuid,text) from public,anon,authenticated;
grant execute on function public.get_clinic_branding(uuid,text) to anon,authenticated;

create function public.save_clinic_profile(p_clinic_id uuid,p_expected_version integer,p_settings jsonb,p_logo text,p_favicon text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_owner(p_clinic_id) then raise exception 'Access denied' using errcode='42501';end if;
  perform private.validate_brand_image(p_logo,512,180000);
  perform private.validate_brand_image(p_favicon,64,30000);
  result:=public.save_clinic_settings(p_clinic_id,p_expected_version,p_settings);
  insert into public.clinic_branding(clinic_id,logo,favicon) values(p_clinic_id,p_logo,p_favicon)
    on conflict(clinic_id) do update set logo=excluded.logo,favicon=excluded.favicon,updated_at=now();
  insert into public.access_events(clinic_id,actor_id,event,details) values(p_clinic_id,auth.uid(),'branding',jsonb_build_object('hasLogo',p_logo<>'','hasFavicon',p_favicon<>''));
  return result;
end;$$;
revoke all on function public.save_clinic_profile(uuid,integer,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.save_clinic_profile(uuid,integer,jsonb,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
