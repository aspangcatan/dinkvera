-- Purpose: who runs the platform, the plans businesses subscribe to, the
-- businesses themselves (tenants), their booking rules and their staff,
-- plus the role helpers every RLS policy is built on.
--
-- Multi-tenancy model: every business-owned row carries tenant_id. RLS
-- lets a signed-in user see a tenant's private data only when they are an
-- active staff member of that tenant (or a platform admin), and each
-- staff role maps to a fixed set of permissions (role_permissions below,
-- mirrored by src/utils/permissions.ts).

-- ---------------------------------------------------------------------------
-- Platform admins (Sideline's own team)
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'Sideline staff with access to every tenant. Rows are added by hand in '
  'the SQL Editor (see docs/database.md), never from the app.';

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins where user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Plans (product configuration, so they live in the migration)
-- ---------------------------------------------------------------------------
create table public.plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (char_length(name) between 1 and 50),
  description text not null default '',
  monthly_price_centavos integer not null check (monthly_price_centavos >= 0),
  annual_price_centavos integer not null check (annual_price_centavos >= 0),
  -- NULL = unlimited.
  limit_locations integer check (limit_locations >= 0),
  limit_courts integer check (limit_courts >= 0),
  limit_staff integer check (limit_staff >= 0),
  limit_bookings_per_month integer check (limit_bookings_per_month >= 0),
  features text[] not null default '{}',
  highlighted boolean not null default false,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_plans_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

insert into public.plans (
  id, name, description, monthly_price_centavos, annual_price_centavos,
  limit_locations, limit_courts, limit_staff, limit_bookings_per_month,
  features, highlighted, is_public, sort_order
) values
  ('starter', 'Starter', 'For a single venue getting online bookings off the ground.',
    149000, 1490000, 1, 4, 3, 400,
    array['Online booking page', 'Court calendar', 'GCash & cash payments', 'Customer list', 'Email confirmations'],
    false, true, 1),
  ('growth', 'Growth', 'For growing clubs adding courts, staff and a second site.',
    399000, 3990000, 3, 12, 10, 2000,
    array['Everything in Starter', 'Up to 3 locations', 'Custom branding', 'Peak & off-peak pricing', 'Staff roles', 'Revenue reports'],
    true, true, 2),
  ('pro', 'Pro', 'For multi-site operators who need deeper control.',
    799000, 7990000, 6, 30, 30, null,
    array['Everything in Growth', 'Unlimited bookings', 'Card payments', 'Advanced analytics', 'Priority support'],
    false, true, 3),
  ('enterprise', 'Enterprise', 'Custom limits, onboarding and SLAs for large networks.',
    1499000, 14990000, null, null, null, null,
    array['Everything in Pro', 'Unlimited locations & courts', 'Dedicated success manager', 'Custom domain', 'SLA & audit exports'],
    false, false, 4);

-- ---------------------------------------------------------------------------
-- Tenants (one row per pickleball business)
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  name text not null check (char_length(name) between 2 and 100),
  legal_name text not null default '' check (char_length(legal_name) <= 150),
  status text not null default 'trialing'
    check (status in ('active', 'trialing', 'past_due', 'suspended', 'cancelled')),
  owner_name text not null default '' check (char_length(owner_name) <= 100),
  owner_email text not null default '' check (char_length(owner_email) <= 254),
  phone text not null default '' check (char_length(phone) <= 30),
  city text not null default '' check (char_length(city) <= 100),
  timezone text not null default 'Asia/Manila',
  currency text not null default 'PHP' check (currency = 'PHP'),
  about text not null default '' check (char_length(about) <= 1000),
  brand_primary text not null default '#1f5641' check (brand_primary ~ '^#[0-9a-fA-F]{6}$'),
  brand_accent text not null default '#c9e86a' check (brand_accent ~ '^#[0-9a-fA-F]{6}$'),
  brand_monogram text not null default '' check (char_length(brand_monogram) <= 2),
  brand_tagline text not null default '' check (char_length(brand_tagline) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenants is
  'Pickleball businesses. Public-readable (it is their public profile); '
  'status changes only through set_tenant_status() / billing functions.';

create trigger set_tenants_updated_at
  before update on public.tenants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Booking rules (1:1 with tenants)
-- ---------------------------------------------------------------------------
create table public.booking_rules (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  min_duration_minutes integer not null default 60 check (min_duration_minutes between 30 and 720),
  max_duration_minutes integer not null default 180 check (max_duration_minutes between 30 and 720),
  advance_booking_days integer not null default 30 check (advance_booking_days between 1 and 365),
  cancellation_window_hours integer not null default 24 check (cancellation_window_hours between 0 and 336),
  hold_minutes integer not null default 15 check (hold_minutes between 5 and 1440),
  require_prepayment boolean not null default true,
  allow_walk_ins boolean not null default true,
  peak_start_hour smallint not null default 17 check (peak_start_hour between 0 and 23),
  peak_days text not null default 'all' check (peak_days in ('all', 'weekdays', 'weekends')),
  payment_methods text[] not null default array['gcash', 'maya', 'bank_transfer', 'cash']
    check (
      cardinality(payment_methods) > 0
      and payment_methods <@ array['gcash', 'maya', 'card', 'bank_transfer', 'cash']
    ),
  updated_at timestamptz not null default now(),
  constraint booking_rules_duration_order check (min_duration_minutes <= max_duration_minutes)
);

create trigger set_booking_rules_updated_at
  before update on public.booking_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Staff (tenant members). user_id is filled in when the invited person
-- signs in with the same email (see link_staff_on_signup()).
-- ---------------------------------------------------------------------------
create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (email ~ '^\S+@\S+\.\S+$' and char_length(email) <= 254),
  phone text not null default '' check (char_length(phone) <= 30),
  role text not null check (role in ('owner', 'manager', 'front_desk', 'coach')),
  -- Locations this person works at; empty = all locations.
  location_ids uuid[] not null default '{}',
  status text not null default 'invited' check (status in ('active', 'invited', 'disabled')),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index staff_members_tenant_email_key on public.staff_members (tenant_id, lower(email));
create index staff_members_user_id_idx on public.staff_members (user_id);

create trigger set_staff_members_updated_at
  before update on public.staff_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so policies can call them without
-- recursing into staff_members' own RLS).
-- ---------------------------------------------------------------------------
create or replace function public.staff_role(p_tenant uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.staff_members
  where tenant_id = p_tenant
    and user_id = (select auth.uid())
    and status = 'active'
  limit 1;
$$;

-- Mirrors rolePermissions in src/utils/permissions.ts.
create or replace function public.role_permissions(p_role text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then array['dashboard', 'calendar', 'bookings', 'customers', 'payments',
                            'venues', 'staff', 'reports', 'settings', 'billing']
    when 'manager' then array['dashboard', 'calendar', 'bookings', 'customers', 'payments',
                              'venues', 'staff', 'reports']
    when 'front_desk' then array['dashboard', 'calendar', 'bookings', 'customers', 'payments']
    when 'coach' then array['dashboard', 'calendar']
    else array[]::text[]
  end;
$$;

create or replace function public.has_permission(p_tenant uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
    or coalesce(p_permission = any (public.role_permissions(public.staff_role(p_tenant))), false);
$$;

create or replace function public.is_tenant_member(p_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin() or public.staff_role(p_tenant) is not null;
$$;

comment on function public.has_permission(uuid, text) is
  'True for platform admins, or an active staff member whose role grants '
  'the permission (see role_permissions).';

-- ---------------------------------------------------------------------------
-- Staff guard rails: nobody makes themselves owner, and the owner can't
-- be removed or demoted from the app. auth.uid() IS NULL means a trusted
-- server context (SQL Editor, migrations, seed), which is allowed.
-- ---------------------------------------------------------------------------
create or replace function public.guard_staff_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_platform_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'The owner can''t be removed.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' and new.role = 'owner' then
    raise exception 'Only Sideline can add an owner.' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if old.role = 'owner' and new.role <> 'owner' then
      raise exception 'The owner''s role can''t be changed here.' using errcode = 'P0001';
    end if;
    if old.role <> 'owner' and new.role = 'owner' then
      raise exception 'Only Sideline can make someone an owner.' using errcode = 'P0001';
    end if;
    if old.role = 'owner' and new.status <> 'active' then
      raise exception 'The owner can''t be disabled.' using errcode = 'P0001';
    end if;
    if new.email is distinct from old.email or new.user_id is distinct from old.user_id then
      raise exception 'Email and login can''t be changed here.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_staff_owner
  before insert or update or delete on public.staff_members
  for each row execute function public.guard_staff_owner();
