-- Purpose: "Start your free trial" on the marketing site. Trials aren't
-- self-serve: a court owner sends a request (Contact page), a platform
-- admin follows up and adds the business (which starts its trial), then
-- marks the request converted — or declined.

create table public.trial_requests (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(business_name) between 1 and 100),
  contact_name text not null check (char_length(contact_name) between 1 and 100),
  email text not null check (char_length(email) <= 254 and email ~ '^\S+@\S+\.\S+$'),
  phone text not null default '' check (char_length(phone) <= 30),
  city text not null default '' check (char_length(city) <= 60),
  courts integer check (courts between 1 and 500),
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'converted', 'declined')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users (id) on delete set null
);

create index trial_requests_created_idx on public.trial_requests (created_at desc);

alter table public.trial_requests enable row level security;

-- Platform admins only; requests come in through submit_trial_request().
create policy trial_requests_select on public.trial_requests
  for select to authenticated using (public.is_platform_admin());
grant select on public.trial_requests to authenticated;

-- Public (signed out). Limited per network and per email address.
create or replace function public.submit_trial_request(
  p_business_name text,
  p_contact_name text,
  p_email text,
  p_phone text default '',
  p_city text default '',
  p_courts integer default null,
  p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if btrim(coalesce(p_business_name, '')) = '' or btrim(coalesce(p_contact_name, '')) = '' then
    raise exception 'Enter your business name and your name.' using errcode = 'P0001';
  end if;
  if v_email !~ '^\S+@\S+\.\S+$' then
    raise exception 'Enter a valid email address.' using errcode = 'P0001';
  end if;
  if p_courts is not null and (p_courts < 1 or p_courts > 500) then
    raise exception 'Enter how many courts you have (1–500).' using errcode = 'P0001';
  end if;
  perform public.hit_rate_limit('trial:ip', public.client_ip(), 5, interval '1 hour');
  perform public.hit_rate_limit('trial:email', v_email, 3, interval '1 day');

  insert into public.trial_requests (business_name, contact_name, email, phone, city, courts, message)
  values (
    left(btrim(p_business_name), 100),
    left(btrim(p_contact_name), 100),
    left(v_email, 254),
    left(btrim(coalesce(p_phone, '')), 30),
    left(btrim(coalesce(p_city, '')), 60),
    p_courts,
    left(btrim(coalesce(p_message, '')), 1000)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Platform admin moves a request along.
create or replace function public.set_trial_request_status(p_request_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  if p_status not in ('new', 'contacted', 'converted', 'declined') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.trial_requests
  set status = p_status,
      handled_at = case when p_status = 'new' then null else now() end,
      handled_by = case when p_status = 'new' then null else (select auth.uid()) end
  where id = p_request_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function
  public.submit_trial_request(text, text, text, text, text, integer, text),
  public.set_trial_request_status(uuid, text)
from public;
grant execute on function public.submit_trial_request(text, text, text, text, text, integer, text)
  to anon, authenticated;
grant execute on function public.set_trial_request_status(uuid, text) to authenticated;
