-- Purpose: each tenant's locations and courts, and plan-limit enforcement.
--
-- Composite foreign keys (child.parent_id, child.tenant_id) -> parent(id,
-- tenant_id) make it structurally impossible for a court to point at
-- another tenant's location (or a booking at another tenant's court),
-- whatever the application sends.

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  address text not null default '' check (char_length(address) <= 200),
  city text not null default '' check (char_length(city) <= 100),
  phone text not null default '' check (char_length(phone) <= 30),
  -- Hours of the business day; close_hour may pass midnight (25 = 1 AM).
  open_hour smallint not null check (open_hour between 0 and 23),
  close_hour smallint not null check (close_hour between 1 and 30),
  status text not null default 'active' check (status in ('active', 'inactive')),
  amenities text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_hours_order check (close_hour > open_hour),
  constraint locations_tenant_slug_key unique (tenant_id, slug),
  constraint locations_id_tenant_key unique (id, tenant_id)
);

create trigger set_locations_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  type text not null default 'outdoor' check (type in ('indoor', 'outdoor', 'covered')),
  surface text not null default '' check (char_length(surface) <= 60),
  hourly_rate_centavos integer not null check (hourly_rate_centavos > 0),
  peak_rate_centavos integer not null check (peak_rate_centavos > 0),
  status text not null default 'active' check (status in ('active', 'maintenance', 'inactive')),
  features text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courts_location_fkey foreign key (location_id, tenant_id)
    references public.locations (id, tenant_id) on delete cascade,
  constraint courts_id_tenant_key unique (id, tenant_id),
  constraint courts_id_location_key unique (id, location_id)
);

create index courts_location_id_idx on public.courts (location_id);

create trigger set_courts_updated_at
  before update on public.courts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Plan limits: adding one more location / court / active staff seat than
-- the tenant's plan allows is rejected here, so the limit holds even if a
-- request skips the UI. The subscription row is locked first so two
-- simultaneous inserts can't both squeeze under the limit.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := tg_argv[0];
  v_plan_name text;
  v_limit integer;
  v_used integer;
  v_label text;
begin
  -- Re-enabling a disabled staff member takes a seat again; other updates don't.
  if tg_op = 'UPDATE' then
    if v_key <> 'staff' or old.status <> 'disabled' or new.status = 'disabled' then
      return new;
    end if;
  end if;

  select p.name,
         case v_key
           when 'locations' then p.limit_locations
           when 'courts' then p.limit_courts
           when 'staff' then p.limit_staff
         end
    into v_plan_name, v_limit
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.tenant_id = new.tenant_id
  for update of s;

  if v_limit is null then
    return new;
  end if;

  if v_key = 'locations' then
    select count(*) into v_used from public.locations where tenant_id = new.tenant_id;
    v_label := 'locations';
  elsif v_key = 'courts' then
    select count(*) into v_used from public.courts where tenant_id = new.tenant_id;
    v_label := 'courts';
  else
    select count(*) into v_used
    from public.staff_members
    where tenant_id = new.tenant_id and status <> 'disabled' and id <> new.id;
    v_label := 'staff seats';
  end if;

  if v_used >= v_limit then
    raise exception 'Your % plan includes % %. Upgrade to add more.', v_plan_name, v_limit, v_label
      using errcode = 'P0001', hint = 'limit_reached';
  end if;
  return new;
end;
$$;

create trigger enforce_location_limit
  before insert on public.locations
  for each row execute function public.enforce_plan_limit('locations');

create trigger enforce_court_limit
  before insert on public.courts
  for each row execute function public.enforce_plan_limit('courts');

create trigger enforce_staff_limit
  before insert or update of status on public.staff_members
  for each row execute function public.enforce_plan_limit('staff');
