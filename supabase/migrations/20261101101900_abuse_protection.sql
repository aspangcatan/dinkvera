-- Purpose: limits on the public booking site, enforced in the database
-- (the app's publishable key is public, so browser-only checks can be
-- skipped by calling the API directly).
--
--   * Booking: one phone number can hold at most 3 unpaid upcoming online
--     bookings per business, and one network (IP) can make at most 15
--     online bookings per business per hour.
--   * "Find my booking": at most 30 lookups per network per 10 minutes and
--     10 per booking reference per hour (stops guessing phone numbers).
--   * Payment proofs: uploads only into a folder named after a real booking
--     made in the last 2 hours that isn't paid yet, at most 3 files each;
--     attaching is limited like lookups.
--
-- Staff and platform admins are never limited. Requests without an IP
-- (SQL Editor, tests) skip the per-network limits only.

-- ---------------------------------------------------------------------------
-- Rate-limit counters (private: no API access)
-- ---------------------------------------------------------------------------
create table public.rate_limit_hits (
  bucket text not null,
  -- sha256 of the limited key (IP, reference…), never the raw value.
  key_hash text not null,
  hit_at timestamptz not null default now()
);
create index rate_limit_hits_lookup on public.rate_limit_hits (bucket, key_hash, hit_at);
alter table public.rate_limit_hits enable row level security;

-- The caller's IP as seen by Supabase's API gateway, or null.
create or replace function public.client_ip()
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if v_headers is null then
    return null;
  end if;
  return nullif(btrim(coalesce(
    v_headers->>'cf-connecting-ip',
    v_headers->>'x-real-ip',
    split_part(v_headers->>'x-forwarded-for', ',', 1)
  )), '');
end;
$$;

-- Records one hit for (bucket, key); raises once `p_max` hits fall inside
-- `p_window`. A null key (no IP) is never limited.
create or replace function public.hit_rate_limit(
  p_bucket text, p_key text, p_max integer, p_window interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if p_key is null or p_key = '' then
    return;
  end if;
  v_hash := encode(sha256(convert_to(p_bucket || ':' || p_key, 'UTF8')), 'hex');
  -- Housekeeping: nothing is limited over more than a day.
  delete from public.rate_limit_hits where hit_at < now() - interval '1 day';
  if (select count(*) from public.rate_limit_hits
      where bucket = p_bucket and key_hash = v_hash and hit_at > now() - p_window) >= p_max then
    raise exception 'Too many attempts. Please wait a few minutes and try again.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.rate_limit_hits (bucket, key_hash) values (p_bucket, v_hash);
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking
-- ---------------------------------------------------------------------------
alter function public.create_booking_group(uuid, jsonb, text, text, text, integer, text, text, text, boolean)
  rename to create_booking_group_core;
revoke execute on function
  public.create_booking_group_core(uuid, jsonb, text, text, text, integer, text, text, text, boolean)
  from public, anon, authenticated;

create or replace function public.create_booking_group(
  p_tenant_id uuid,
  p_slots jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default '',
  p_players integer default 4,
  p_notes text default '',
  p_source text default 'online',
  p_payment_method text default null,
  p_payment_pending boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open integer;
begin
  if p_source = 'online' and not public.has_permission(p_tenant_id, 'bookings') then
    perform public.expire_stale_holds();
    -- Unpaid upcoming online bookings (counted per reference) for this phone.
    select count(distinct b.reference) into v_open
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.tenant_id = p_tenant_id
      and b.source = 'online'
      and b.status in ('pending', 'confirmed')
      and b.payment_status = 'unpaid'
      and b.business_date >= public.local_today()
      and char_length(public.phone_key(p_customer_phone)) = 10
      and public.phone_key(c.phone) = public.phone_key(p_customer_phone);
    if v_open >= 3 then
      raise exception 'This number already has 3 unpaid bookings here. Pay for or cancel one first, or contact the venue.'
        using errcode = 'P0001', hint = 'rate_limited';
    end if;
    perform public.hit_rate_limit('booking', p_tenant_id::text || '|' || public.client_ip(),
                                  15, interval '1 hour');
  end if;
  return public.create_booking_group_core(p_tenant_id, p_slots, p_customer_name, p_customer_phone,
    p_customer_email, p_players, p_notes, p_source, p_payment_method, p_payment_pending);
end;
$$;

-- ---------------------------------------------------------------------------
-- Find my booking
-- ---------------------------------------------------------------------------
alter function public.lookup_booking(uuid, text, text) rename to lookup_booking_core;
revoke execute on function public.lookup_booking_core(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.lookup_booking(p_tenant_id uuid, p_reference text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.hit_rate_limit('lookup:ip', public.client_ip(), 30, interval '10 minutes');
  perform public.hit_rate_limit('lookup:ref',
    p_tenant_id::text || '|' || upper(btrim(coalesce(p_reference, ''))), 10, interval '1 hour');
  return public.lookup_booking_core(p_tenant_id, p_reference, p_phone);
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment proofs
-- ---------------------------------------------------------------------------
alter function public.attach_payment_proof(uuid, text, text, text, text)
  rename to attach_payment_proof_core;
revoke execute on function public.attach_payment_proof_core(uuid, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.attach_payment_proof(
  p_tenant_id uuid,
  p_reference text,
  p_phone text,
  p_proof_path text,
  p_transaction_reference text default ''
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(p_tenant_id, 'payments') then
    perform public.hit_rate_limit('proof:ip', public.client_ip(), 20, interval '1 hour');
    perform public.hit_rate_limit('proof:ref',
      p_tenant_id::text || '|' || upper(btrim(coalesce(p_reference, ''))), 5, interval '1 hour');
  end if;
  return public.attach_payment_proof_core(p_tenant_id, p_reference, p_phone, p_proof_path,
    p_transaction_reference);
end;
$$;

-- Uploads go to "<tenant_id>/<booking reference>/<random>.<ext>". Allowed
-- only for a booking of that business made in the last 2 hours that is
-- still unpaid, and at most 3 files per booking.
create or replace function public.proof_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.bookings b
      where b.tenant_id = public.storage_tenant(p_name)
        and b.reference = upper(split_part(p_name, '/', 2))
        and b.payment_status = 'unpaid'
        and b.status in ('pending', 'confirmed')
        and b.created_at > now() - interval '2 hours'
    )
    and (select count(*) from storage.objects o
         where o.bucket_id = 'payment-proofs'
           and o.name like split_part(p_name, '/', 1) || '/' || split_part(p_name, '/', 2) || '/%') < 3;
$$;

drop policy if exists payment_proofs_insert on storage.objects;
create policy payment_proofs_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'payment-proofs'
    and coalesce(public.proof_upload_allowed(name), false)
  );

grant execute on function
  public.create_booking_group(uuid, jsonb, text, text, text, integer, text, text, text, boolean),
  public.lookup_booking(uuid, text, text),
  public.attach_payment_proof(uuid, text, text, text, text),
  public.proof_upload_allowed(text)
to anon, authenticated;
