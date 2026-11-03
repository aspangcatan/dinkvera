-- Purpose: players (per tenant), their court bookings and payments.
--
-- Bookings are stored the way the app thinks about them — a business
-- date, a start hour and a length in hours — and a trigger derives the
-- real starts_at/ends_at instants in the tenant's timezone. The exclusion
-- constraint runs on those instants, so a court can never be booked twice
-- for overlapping time, including slots that run past midnight.

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 100 and name !~ '[<>]'),
  email text not null default '' check (email = '' or (email ~ '^\S+@\S+\.\S+$' and char_length(email) <= 254)),
  phone text not null check (char_length(public.phone_key(phone)) = 10),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_id_tenant_key unique (id, tenant_id)
);

-- One customer record per phone number per business.
create unique index customers_tenant_phone_key on public.customers (tenant_id, public.phone_key(phone));
create index customers_tenant_email_idx on public.customers (tenant_id, lower(email)) where email <> '';

create trigger set_customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null,
  court_id uuid not null,
  customer_id uuid not null,
  -- Shared by bookings made together ("Add date"); they also share `reference`.
  group_id uuid,
  reference text not null check (reference ~ '^[A-Z]{1,2}-[A-Z0-9]{4,10}$'),
  business_date date not null,
  start_hour smallint not null check (start_hour between 0 and 29),
  duration_hours smallint not null check (duration_hours between 1 and 12),
  -- Derived by bookings_set_times(); don't write these directly.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  amount_centavos integer not null check (amount_centavos >= 0),
  players smallint not null default 4 check (players between 1 and 8),
  source text not null default 'online' check (source in ('online', 'walk_in', 'phone')),
  notes text not null default '' check (char_length(notes) <= 500),
  -- Unpaid online holds are released after this (see expire_stale_holds()).
  hold_expires_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_location_fkey foreign key (location_id, tenant_id)
    references public.locations (id, tenant_id),
  constraint bookings_court_fkey foreign key (court_id, tenant_id)
    references public.courts (id, tenant_id),
  constraint bookings_court_location_fkey foreign key (court_id, location_id)
    references public.courts (id, location_id),
  constraint bookings_customer_fkey foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id),
  constraint bookings_id_tenant_key unique (id, tenant_id),
  constraint bookings_valid_range check (ends_at > starts_at)
);

comment on table public.bookings is
  'Court bookings. Created only through create_booking_group(); staff '
  'changes go through the booking functions. Courts and locations with '
  'booking history can''t be deleted (set them inactive instead).';

create index bookings_tenant_date_idx on public.bookings (tenant_id, business_date);
create index bookings_location_date_idx on public.bookings (location_id, business_date);
create index bookings_court_starts_idx on public.bookings (court_id, starts_at);
create index bookings_customer_idx on public.bookings (customer_id);
create index bookings_tenant_reference_idx on public.bookings (tenant_id, reference);
create index bookings_group_idx on public.bookings (group_id) where group_id is not null;

create or replace function public.bookings_set_times()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tz text;
begin
  select timezone into v_tz from public.tenants where id = new.tenant_id;
  new.starts_at := (new.business_date::timestamp + make_interval(hours => new.start_hour))
                   at time zone coalesce(v_tz, 'Asia/Manila');
  new.ends_at := new.starts_at + make_interval(hours => new.duration_hours);
  return new;
end;
$$;

create trigger bookings_set_times
  before insert or update of business_date, start_hour, duration_hours, tenant_id
  on public.bookings
  for each row execute function public.bookings_set_times();

create trigger set_bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- THE double-booking guard: enforced by the index at insert/update time,
-- so two simultaneous requests for the same court and time can't both
-- succeed. Only bookings that occupy the court count.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    court_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('pending', 'confirmed', 'completed'));

-- ---------------------------------------------------------------------------
-- Payments (one row per booking; a multi-date booking's rows share the
-- provider `reference`, since one transfer paid for all of them)
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  booking_id uuid not null,
  customer_id uuid not null,
  amount_centavos integer not null check (amount_centavos >= 0),
  method text not null check (method in ('gcash', 'maya', 'card', 'bank_transfer', 'cash')),
  status text not null check (status in ('paid', 'pending', 'refunded', 'failed')),
  reference text not null default '' check (char_length(reference) <= 100),
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_booking_fkey foreign key (booking_id, tenant_id)
    references public.bookings (id, tenant_id) on delete cascade,
  constraint payments_customer_fkey foreign key (customer_id, tenant_id)
    references public.customers (id, tenant_id)
);

create index payments_tenant_created_idx on public.payments (tenant_id, created_at desc);
create index payments_booking_idx on public.payments (booking_id);
create index payments_pending_idx on public.payments (tenant_id) where status = 'pending';

create trigger set_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();
