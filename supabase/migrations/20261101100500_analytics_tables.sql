-- Purpose: analytics that can't be derived from bookings — monthly
-- booking-site traffic per tenant (filled by a page-view collector
-- later; seeded for demos) — and the platform activity feed shown in the
-- Super Admin console.

create table public.page_view_stats (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- First day of the month.
  month date not null check (extract(day from month) = 1),
  page_views integer not null default 0 check (page_views >= 0),
  booking_starts integer not null default 0 check (booking_starts >= 0),
  bookings_completed integer not null default 0 check (bookings_completed >= 0),
  primary key (tenant_id, month)
);

create table public.platform_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null
    check (kind in ('signup', 'upgrade', 'downgrade', 'payment_failed', 'payment', 'suspended', 'support')),
  message text not null check (char_length(message) <= 300),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index platform_activity_created_idx on public.platform_activity (created_at desc);
create index platform_activity_tenant_idx on public.platform_activity (tenant_id, created_at desc);

-- Internal helper for the functions that log activity.
create or replace function public.log_activity(p_tenant uuid, p_kind text, p_message text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.platform_activity (tenant_id, kind, message, actor_id)
  values (p_tenant, p_kind, p_message, (select auth.uid()));
$$;
