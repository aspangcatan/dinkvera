-- Purpose: Super Admin -> Settings is saved for real. One row of
-- platform-wide settings, readable and writable by platform admins only.
-- Trial length now sets new businesses' trials (create_tenant) and the
-- grace period sets when invoices fall due (issue_invoice); the other
-- values are stored for features that aren't built yet (emails,
-- maintenance mode, auto-suspend, self-serve sign-ups, card trials).

create table public.platform_settings (
  id boolean primary key default true check (id),
  company_name text not null default 'Sideline Technologies Inc.'
    check (char_length(btrim(company_name)) between 1 and 120),
  support_email text not null default 'support@courtdesk.app'
    check (support_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(support_email) <= 120),
  billing_currency text not null default 'PHP' check (billing_currency in ('PHP')),
  trial_days integer not null default 14 check (trial_days between 1 and 90),
  grace_days integer not null default 7 check (grace_days between 0 and 60),
  suspend_after_invoices integer not null default 2 check (suspend_after_invoices between 1 and 3),
  require_card_for_trial boolean not null default false,
  allow_signups boolean not null default false,
  maintenance_mode boolean not null default false,
  email_booking_confirmations boolean not null default true,
  email_invoice_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.platform_settings is
  'Platform-wide settings (single row, id = true). Platform admins only.';

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

create trigger set_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

create policy platform_settings_select on public.platform_settings
  for select to authenticated using (public.is_platform_admin());
create policy platform_settings_update on public.platform_settings
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select, update on public.platform_settings to authenticated;

-- ---------------------------------------------------------------------------
-- create_tenant(): same as before, trial length from platform_settings.
-- ---------------------------------------------------------------------------
create or replace function public.create_tenant(
  p_name text,
  p_owner_name text,
  p_owner_email text,
  p_phone text default '',
  p_city text default '',
  p_plan_id text default 'starter',
  p_brand_primary text default '#1f5641'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_slug text := public.slugify(p_name);
  v_today date := public.local_today();
  v_monogram text;
  v_trial_days integer := coalesce((select trial_days from public.platform_settings), 14);
begin
  if not public.is_platform_admin() then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  if v_slug = '' then
    raise exception 'Enter the business name' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.tenants where slug = v_slug) then
    raise exception 'A business with this name already exists' using errcode = 'P0001', hint = 'conflict';
  end if;

  select upper(string_agg(left(w, 1), ''))
    into v_monogram
  from (select w from regexp_split_to_table(btrim(p_name), '\s+') as w limit 2) words;

  insert into public.tenants (slug, name, legal_name, status, owner_name, owner_email, phone,
                              city, brand_primary, brand_monogram)
  values (v_slug, btrim(p_name), btrim(p_name), 'trialing', btrim(p_owner_name),
          lower(btrim(p_owner_email)), coalesce(p_phone, ''), coalesce(p_city, ''),
          p_brand_primary, left(coalesce(v_monogram, ''), 2))
  returning id into v_tenant_id;

  insert into public.booking_rules (tenant_id) values (v_tenant_id);

  insert into public.subscriptions (tenant_id, plan_id, status, billing_cycle, started_at,
                                    current_period_start, current_period_end, trial_ends_at)
  values (v_tenant_id, p_plan_id, 'trialing', 'monthly', v_today, v_today,
          v_today + v_trial_days, v_today + v_trial_days);

  insert into public.staff_members (tenant_id, name, email, phone, role)
  values (v_tenant_id, btrim(p_owner_name), lower(btrim(p_owner_email)), coalesce(p_phone, ''), 'owner');

  perform public.log_activity(v_tenant_id, 'signup',
    format('Created by platform admin — %s-day trial started', v_trial_days));
  return v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_invoice(): same as before, due date = period start + grace period.
-- ---------------------------------------------------------------------------
create or replace function public.issue_invoice(p_subscription_id uuid, p_period_start date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_plan public.plans;
  v_id uuid;
  v_number text;
  v_amount integer;
  v_grace_days integer := coalesce((select grace_days from public.platform_settings), 7);
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id;
  select * into v_plan from public.plans where id = v_sub.plan_id;
  v_amount := case when v_sub.billing_cycle = 'annual'
                   then v_plan.annual_price_centavos else v_plan.monthly_price_centavos end;
  if v_amount <= 0 then
    return null; -- free plan: nothing to bill
  end if;

  insert into public.invoices (tenant_id, subscription_id, plan_id, amount_centavos, status,
                               issued_at, due_at, period_start)
  values (v_sub.tenant_id, v_sub.id, v_sub.plan_id, v_amount, 'open',
          public.local_today(), p_period_start + v_grace_days, p_period_start)
  on conflict (subscription_id, period_start) where period_start is not null and status <> 'void'
  do nothing
  returning id, number into v_id, v_number;

  if v_id is not null then
    perform public.log_activity(v_sub.tenant_id, 'support',
      format('Invoice %s issued (%s, %s)', v_number, v_plan.name, v_sub.billing_cycle));
  end if;
  return v_id;
end;
$$;

revoke execute on function public.issue_invoice(uuid, date) from public, anon, authenticated;
