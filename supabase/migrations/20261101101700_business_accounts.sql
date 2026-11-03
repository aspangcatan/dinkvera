-- Purpose: one kind of business account instead of staff roles.
--
-- Every login attached to a business (a staff_members row) now has full
-- access to it: bookings, payments, settings, billing. Businesses can no
-- longer add people themselves; only a platform admin adds, disables or
-- removes accounts (Super Admin → business → Business accounts).
--
-- Existing non-owner rows (manager, front desk, coach) are kept but
-- disabled, so nobody gains access by this change; an admin can switch any
-- of them back on. Staff-seat plan limits go away.

-- 1. Collapse roles. Runs as the SQL Editor's postgres role, which the
--    guard_staff_owner trigger lets through.
update public.staff_members
set status = 'disabled', role = 'owner'
where role <> 'owner';

alter table public.staff_members
  drop constraint if exists staff_members_role_check,
  alter column role set default 'owner',
  add constraint staff_members_role_check check (role = 'owner');

-- Mirrors rolePermissions in src/utils/permissions.ts.
create or replace function public.role_permissions(p_role text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then array['dashboard', 'calendar', 'bookings', 'customers', 'payments',
                            'venues', 'reports', 'settings', 'billing']
    else array[]::text[]
  end;
$$;

-- 2. Only platform admins manage accounts. Members can still see who else
--    has access to their business (staff_select is unchanged).
drop policy if exists staff_insert on public.staff_members;
drop policy if exists staff_update on public.staff_members;
drop policy if exists staff_delete on public.staff_members;

create policy staff_insert on public.staff_members
  for insert to authenticated with check (public.is_platform_admin());
create policy staff_update on public.staff_members
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy staff_delete on public.staff_members
  for delete to authenticated using (public.is_platform_admin());

-- 3. No staff-seat limits: accounts are added by Sideline, not counted
--    against the plan.
update public.plans
set limit_staff = null,
    features = array_remove(features, 'Staff roles'),
    description = replace(description, 'adding courts, staff and a second site',
                          'adding courts and a second site');

create or replace function public.compute_usage(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select pl.*
    from public.subscriptions s join public.plans pl on pl.id = s.plan_id
    where s.tenant_id = p_tenant_id
  ), tz as (
    select timezone from public.tenants where id = p_tenant_id
  )
  select jsonb_build_array(
    jsonb_build_object('key', 'locations',
      'used', (select count(*) from public.locations where tenant_id = p_tenant_id),
      'limit', (select limit_locations from p)),
    jsonb_build_object('key', 'courts',
      'used', (select count(*) from public.courts where tenant_id = p_tenant_id),
      'limit', (select limit_courts from p)),
    jsonb_build_object('key', 'bookingsPerMonth',
      'used', (select count(*) from public.bookings
               where tenant_id = p_tenant_id and status <> 'cancelled'
                 and date_trunc('month', business_date)
                     = date_trunc('month', public.local_today((select timezone from tz)))),
      'limit', (select limit_bookings_per_month from p))
  );
$$;
