-- Purpose: accounts and subscriptions — linking Supabase Auth users to
-- their staff invites, "who am I", plan usage and changes, invoices, and
-- onboarding/suspending businesses.

-- ---------------------------------------------------------------------------
-- Staff <-> auth users
-- ---------------------------------------------------------------------------

-- When someone signs up (or changes email), attach any staff invites for
-- that email to their account and activate them.
create or replace function public.link_staff_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;
  update public.staff_members
  set user_id = new.id,
      status = case when status = 'invited' then 'active' else status end
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end;
$$;

create trigger on_auth_user_link_staff
  after insert or update of email on auth.users
  for each row execute function public.link_staff_on_signup();

-- And the other way round: inviting an email that already has an account
-- links it right away.
create or replace function public.link_staff_to_existing_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(new.email) limit 1;
  if v_user is not null then
    new.user_id := v_user;
    if new.status = 'invited' then
      new.status := 'active';
    end if;
  end if;
  return new;
end;
$$;

create trigger link_staff_to_existing_user
  before insert on public.staff_members
  for each row execute function public.link_staff_to_existing_user();

-- Who the signed-in user is: platform admin and/or staff memberships.
-- Also records "last active" for the staff list.
create or replace function public.my_memberships()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return jsonb_build_object('isPlatformAdmin', false, 'memberships', '[]'::jsonb);
  end if;

  update public.staff_members set last_active_at = now()
  where user_id = v_uid and status = 'active';

  return jsonb_build_object(
    'isPlatformAdmin', public.is_platform_admin(),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'staffId', s.id,
        'tenantId', t.id,
        'tenantSlug', t.slug,
        'tenantName', t.name,
        'role', s.role,
        'name', s.name,
        'email', s.email
      ) order by t.name)
      from public.staff_members s
      join public.tenants t on t.id = s.tenant_id
      where s.user_id = v_uid and s.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Plans and usage
-- ---------------------------------------------------------------------------
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
    jsonb_build_object('key', 'staff',
      'used', (select count(*) from public.staff_members
               where tenant_id = p_tenant_id and status <> 'disabled'),
      'limit', (select limit_staff from p)),
    jsonb_build_object('key', 'bookingsPerMonth',
      'used', (select count(*) from public.bookings
               where tenant_id = p_tenant_id and status <> 'cancelled'
                 and date_trunc('month', business_date)
                     = date_trunc('month', public.local_today((select timezone from tz)))),
      'limit', (select limit_bookings_per_month from p))
  );
$$;

create or replace function public.tenant_usage(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_tenant_member(p_tenant_id) then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  return public.compute_usage(p_tenant_id);
end;
$$;

-- Switch plan / billing cycle. Plans whose limits are below current
-- usage are refused; non-public plans (Enterprise) are admin-only.
create or replace function public.change_plan(p_tenant_id uuid, p_plan_id text, p_billing_cycle text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_old public.plans;
  v_new public.plans;
  v_usage jsonb := public.compute_usage(p_tenant_id);
  v_item jsonb;
  v_limit integer;
  v_today date := public.local_today();
begin
  if not public.has_permission(p_tenant_id, 'billing') then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  if p_billing_cycle not in ('monthly', 'annual') then
    raise exception 'Unknown billing cycle' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where tenant_id = p_tenant_id for update;
  if not found then
    raise exception 'No subscription for this business' using errcode = 'P0002';
  end if;
  select * into v_old from public.plans where id = v_sub.plan_id;
  select * into v_new from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  if not v_new.is_public and not public.is_platform_admin() then
    raise exception 'Contact Sideline to switch to the % plan.', v_new.name using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(v_usage) loop
    continue when v_item->>'key' = 'bookingsPerMonth';
    v_limit := case v_item->>'key'
      when 'locations' then v_new.limit_locations
      when 'courts' then v_new.limit_courts
      when 'staff' then v_new.limit_staff
    end;
    if v_limit is not null and (v_item->>'used')::integer > v_limit then
      raise exception 'Can''t switch: you''re using % % and the % plan allows %.',
        v_item->>'used', v_item->>'key', v_new.name, v_limit using errcode = 'P0001';
    end if;
  end loop;

  update public.subscriptions
  set plan_id = p_plan_id,
      billing_cycle = p_billing_cycle,
      cancel_at_period_end = false,
      status = case when status = 'trialing' then status else 'active' end,
      current_period_start = case when status = 'trialing' then current_period_start else v_today end,
      current_period_end = case
        when status = 'trialing' then current_period_end
        when p_billing_cycle = 'annual' then (v_today + interval '1 year')::date
        else (v_today + interval '1 month')::date
      end
  where id = v_sub.id;

  perform public.log_activity(
    p_tenant_id,
    case when v_new.monthly_price_centavos >= v_old.monthly_price_centavos then 'upgrade' else 'downgrade' end,
    format('Changed plan from %s to %s (%s)', v_old.name, v_new.name, p_billing_cycle)
  );
end;
$$;

create or replace function public.set_cancel_at_period_end(p_tenant_id uuid, p_cancel boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission(p_tenant_id, 'billing') then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  update public.subscriptions set cancel_at_period_end = p_cancel where tenant_id = p_tenant_id;
end;
$$;

-- Marks an invoice paid (admin, or the tenant's own "Pay now" until a
-- payment provider is wired in). Clears past-due once nothing is overdue.
create or replace function public.mark_invoice_paid(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_invoice.tenant_id, 'billing') then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;

  update public.invoices set status = 'paid', paid_at = public.local_today() where id = p_invoice_id;

  if not exists (
    select 1 from public.invoices
    where subscription_id = v_invoice.subscription_id and status = 'overdue'
  ) then
    update public.subscriptions set status = 'active'
    where id = v_invoice.subscription_id and status = 'past_due';
    update public.tenants set status = 'active'
    where id = v_invoice.tenant_id and status = 'past_due';
  end if;
  perform public.log_activity(v_invoice.tenant_id, 'payment', format('Paid invoice %s', v_invoice.number));
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform admin: onboarding and status
-- ---------------------------------------------------------------------------
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Creates a business with a 14-day trial and invites its owner (they get
-- access when they sign in with that email).
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
  values (v_tenant_id, p_plan_id, 'trialing', 'monthly', v_today, v_today, v_today + 14, v_today + 14);

  insert into public.staff_members (tenant_id, name, email, phone, role)
  values (v_tenant_id, btrim(p_owner_name), lower(btrim(p_owner_email)), coalesce(p_phone, ''), 'owner');

  perform public.log_activity(v_tenant_id, 'signup', 'Created by platform admin — 14-day trial started');
  return v_tenant_id;
end;
$$;

create or replace function public.set_tenant_status(p_tenant_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'trialing', 'past_due', 'suspended', 'cancelled') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.tenants set status = p_status where id = p_tenant_id;
  perform public.log_activity(
    p_tenant_id,
    case when p_status = 'suspended' then 'suspended' else 'support' end,
    case when p_status = 'suspended' then 'Suspended by platform admin' else format('Status set to %s', p_status) end
  );
end;
$$;
