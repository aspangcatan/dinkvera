-- Purpose: row-level security and table privileges — the real tenant
-- isolation boundary (route guards in the app are only a convenience).
--
-- Approach: start from nothing (revoke everything from the API roles),
-- then grant each role exactly what its RLS policies allow. Column-level
-- grants keep sensitive columns (tenant status, staff user_id, …)
-- writable only through SECURITY DEFINER functions. match-pickleball
-- found that hosted Supabase needs these grants spelled out, so nothing
-- here relies on default privileges.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.tenants enable row level security;
alter table public.booking_rules enable row level security;
alter table public.staff_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.locations enable row level security;
alter table public.courts enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.page_view_stats enable row level security;
alter table public.platform_activity enable row level security;

-- ---------------------------------------------------------------------------
-- Public (booking site) data: plans, tenant profiles, rules, venues
-- ---------------------------------------------------------------------------
create policy plans_select on public.plans
  for select to anon, authenticated
  using (is_public or public.is_platform_admin());
create policy plans_update_admin on public.plans
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy tenants_select on public.tenants
  for select to anon, authenticated using (true);
create policy tenants_update on public.tenants
  for update to authenticated
  using (public.has_permission(id, 'settings')) with check (public.has_permission(id, 'settings'));

create policy booking_rules_select on public.booking_rules
  for select to anon, authenticated using (true);
create policy booking_rules_update on public.booking_rules
  for update to authenticated
  using (public.has_permission(tenant_id, 'settings'))
  with check (public.has_permission(tenant_id, 'settings'));

create policy locations_select on public.locations
  for select to anon, authenticated using (true);
create policy locations_insert on public.locations
  for insert to authenticated with check (public.has_permission(tenant_id, 'venues'));
create policy locations_update on public.locations
  for update to authenticated
  using (public.has_permission(tenant_id, 'venues')) with check (public.has_permission(tenant_id, 'venues'));
create policy locations_delete on public.locations
  for delete to authenticated using (public.has_permission(tenant_id, 'venues'));

create policy courts_select on public.courts
  for select to anon, authenticated using (true);
create policy courts_insert on public.courts
  for insert to authenticated with check (public.has_permission(tenant_id, 'venues'));
create policy courts_update on public.courts
  for update to authenticated
  using (public.has_permission(tenant_id, 'venues')) with check (public.has_permission(tenant_id, 'venues'));
create policy courts_delete on public.courts
  for delete to authenticated using (public.has_permission(tenant_id, 'venues'));

grant select on public.plans, public.tenants, public.booking_rules, public.locations, public.courts
  to anon, authenticated;

grant update (name, description, monthly_price_centavos, annual_price_centavos, limit_locations,
              limit_courts, limit_staff, limit_bookings_per_month, features, highlighted, is_public)
  on public.plans to authenticated;
grant update (name, legal_name, owner_name, owner_email, phone, city, about,
              brand_primary, brand_accent, brand_monogram, brand_tagline)
  on public.tenants to authenticated;
grant update on public.booking_rules to authenticated;
grant insert, update, delete on public.locations, public.courts to authenticated;

-- ---------------------------------------------------------------------------
-- Tenant-private data (signed-in staff of that tenant, or platform admins)
-- ---------------------------------------------------------------------------
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_platform_admin());

create policy staff_select on public.staff_members
  for select to authenticated using (public.is_tenant_member(tenant_id));
create policy staff_insert on public.staff_members
  for insert to authenticated with check (public.has_permission(tenant_id, 'staff'));
create policy staff_update on public.staff_members
  for update to authenticated
  using (public.has_permission(tenant_id, 'staff')) with check (public.has_permission(tenant_id, 'staff'));
create policy staff_delete on public.staff_members
  for delete to authenticated using (public.has_permission(tenant_id, 'staff'));

create policy subscriptions_select on public.subscriptions
  for select to authenticated using (public.is_tenant_member(tenant_id));

create policy invoices_select on public.invoices
  for select to authenticated using (public.has_permission(tenant_id, 'billing'));

create policy customers_select on public.customers
  for select to authenticated using (public.has_permission(tenant_id, 'customers'));
create policy customers_insert on public.customers
  for insert to authenticated with check (public.has_permission(tenant_id, 'customers'));
create policy customers_update on public.customers
  for update to authenticated
  using (public.has_permission(tenant_id, 'customers'))
  with check (public.has_permission(tenant_id, 'customers'));

-- Every member sees the schedule (coaches use the calendar too).
create policy bookings_select on public.bookings
  for select to authenticated using (public.is_tenant_member(tenant_id));

create policy payments_select on public.payments
  for select to authenticated using (public.has_permission(tenant_id, 'payments'));

create policy page_view_stats_select on public.page_view_stats
  for select to authenticated using (public.has_permission(tenant_id, 'reports'));

create policy platform_activity_select on public.platform_activity
  for select to authenticated using (public.is_platform_admin());

grant select on public.platform_admins, public.staff_members, public.subscriptions,
                public.invoices, public.customers, public.bookings, public.payments,
                public.page_view_stats, public.platform_activity
  to authenticated;

-- Staff: invited by insert (status/user_id stay server-controlled).
grant insert (tenant_id, name, email, phone, role, location_ids) on public.staff_members to authenticated;
grant update (name, phone, role, location_ids, status) on public.staff_members to authenticated;
grant delete on public.staff_members to authenticated;

grant insert (tenant_id, name, email, phone, tags) on public.customers to authenticated;
grant update (name, email, phone, tags) on public.customers to authenticated;

-- Deliberately not granted: any write on subscriptions, invoices,
-- bookings, payments, platform_admins, page_view_stats or
-- platform_activity. Those change only through the functions in the
-- following migrations, which check permissions themselves.
