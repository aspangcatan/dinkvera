-- Purpose: plan changes need Sideline's OK while there is no automatic
-- payment. A business sends a plan change request (Subscription page); a
-- platform admin collects payment however they normally do, then approves
-- (the plan switches that day) or declines with a reason. Only platform
-- admins can change a plan directly.

create table public.plan_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  -- Plan at the time of the request, for the admin's "from → to" view.
  from_plan_id text not null references public.plans (id),
  from_billing_cycle text not null check (from_billing_cycle in ('monthly', 'annual')),
  plan_id text not null references public.plans (id),
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decision_note text not null default '' check (char_length(decision_note) <= 500),
  requested_by uuid references auth.users (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- One open request per business at a time.
create unique index plan_requests_one_pending on public.plan_requests (tenant_id)
  where status = 'pending';
create index plan_requests_tenant_idx on public.plan_requests (tenant_id, created_at desc);

alter table public.plan_requests enable row level security;

-- Read-only through the API; changes go through the functions below.
create policy plan_requests_select on public.plan_requests
  for select to authenticated using (public.has_permission(tenant_id, 'billing'));
grant select on public.plan_requests to authenticated;

-- Direct plan changes: platform admins only (also used by approvals).
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
  if not public.is_platform_admin() then
    raise exception 'Plan changes are confirmed by Sideline. Send a plan change request instead.'
      using errcode = '42501';
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

  for v_item in select * from jsonb_array_elements(v_usage) loop
    continue when v_item->>'key' = 'bookingsPerMonth';
    v_limit := case v_item->>'key'
      when 'locations' then v_new.limit_locations
      when 'courts' then v_new.limit_courts
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

-- A business asks to switch plan / billing cycle. Plans below current usage
-- and non-public plans (Enterprise) are refused up front.
create or replace function public.request_plan_change(
  p_tenant_id uuid, p_plan_id text, p_billing_cycle text, p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_new public.plans;
  v_item jsonb;
  v_limit integer;
  v_id uuid;
begin
  if not public.has_permission(p_tenant_id, 'billing') then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  if p_billing_cycle not in ('monthly', 'annual') then
    raise exception 'Unknown billing cycle' using errcode = '22023';
  end if;
  select * into v_sub from public.subscriptions where tenant_id = p_tenant_id;
  if not found then
    raise exception 'No subscription for this business' using errcode = 'P0002';
  end if;
  select * into v_new from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  if not v_new.is_public then
    raise exception 'Contact Sideline to switch to the % plan.', v_new.name using errcode = 'P0001';
  end if;
  if v_sub.plan_id = p_plan_id and v_sub.billing_cycle = p_billing_cycle
     and v_sub.status <> 'trialing' then
    raise exception 'You''re already on this plan.' using errcode = 'P0001';
  end if;
  for v_item in select * from jsonb_array_elements(public.compute_usage(p_tenant_id)) loop
    continue when v_item->>'key' = 'bookingsPerMonth';
    v_limit := case v_item->>'key'
      when 'locations' then v_new.limit_locations
      when 'courts' then v_new.limit_courts
    end;
    if v_limit is not null and (v_item->>'used')::integer > v_limit then
      raise exception 'Can''t switch: you''re using % % and the % plan allows %.',
        v_item->>'used', v_item->>'key', v_new.name, v_limit using errcode = 'P0001';
    end if;
  end loop;
  if exists (select 1 from public.plan_requests
             where tenant_id = p_tenant_id and status = 'pending') then
    raise exception 'You already have a plan change request waiting. Cancel it first to send a new one.'
      using errcode = 'P0001', hint = 'conflict';
  end if;

  insert into public.plan_requests (tenant_id, from_plan_id, from_billing_cycle, plan_id,
                                    billing_cycle, note, requested_by)
  values (p_tenant_id, v_sub.plan_id, v_sub.billing_cycle, p_plan_id, p_billing_cycle,
          left(btrim(coalesce(p_note, '')), 500), (select auth.uid()))
  returning id into v_id;

  perform public.log_activity(p_tenant_id, 'support',
    format('Requested a plan change to %s (%s)', v_new.name, p_billing_cycle));
  return v_id;
end;
$$;

-- The business withdraws its own pending request.
create or replace function public.cancel_plan_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.plan_requests;
begin
  select * into v_req from public.plan_requests where id = p_request_id for update;
  if not found or not public.has_permission(v_req.tenant_id, 'billing') then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already handled.' using errcode = 'P0001';
  end if;
  update public.plan_requests
  set status = 'cancelled', decided_at = now(), decided_by = (select auth.uid())
  where id = p_request_id;
end;
$$;

-- Platform admin approves (switches the plan now) or declines with a reason.
create or replace function public.decide_plan_request(
  p_request_id uuid, p_approve boolean, p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.plan_requests;
begin
  if not public.is_platform_admin() then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  select * into v_req from public.plan_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'This request was already handled.' using errcode = 'P0001';
  end if;
  if p_approve then
    perform public.change_plan(v_req.tenant_id, v_req.plan_id, v_req.billing_cycle);
  end if;
  update public.plan_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decision_note = left(btrim(coalesce(p_note, '')), 500),
      decided_by = (select auth.uid()),
      decided_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function
  public.request_plan_change(uuid, text, text, text),
  public.cancel_plan_request(uuid),
  public.decide_plan_request(uuid, boolean, text)
to authenticated;
