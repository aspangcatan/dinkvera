-- Purpose: extensions and small helpers every later migration reuses.
--
-- btree_gist lets bookings use a GiST EXCLUDE constraint that combines an
-- equality column (court_id) with a time-range overlap (&&): double
-- booking is then impossible at the database level, even under
-- concurrent requests (same mechanism as match-pickleball).
create extension if not exists btree_gist;

-- Keeps an `updated_at` column current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger: sets updated_at = now().';

-- Last 10 digits of a phone number, so "+63 917 555 0142" and
-- "0917 555 0142" compare equal.
create or replace function public.phone_key(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
$$;

-- Today and the current hour in a tenant's timezone (business dates are
-- local calendar dates, not UTC ones).
create or replace function public.local_today(p_timezone text default 'Asia/Manila')
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone p_timezone)::date;
$$;
