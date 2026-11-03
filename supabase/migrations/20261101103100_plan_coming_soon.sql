-- Purpose: a plan can be shown as "Coming soon" (Pro, until card payments
-- for businesses exist). It stays on the pricing page with a badge, but
-- businesses can't request it. Toggle it in Super Admin -> Plans & limits.

alter table public.plans add column coming_soon boolean not null default false;

grant update (coming_soon) on public.plans to authenticated;

update public.plans set coming_soon = true where id = 'pro';

-- Same as before, refusing plans that are coming soon.
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
  if v_new.coming_soon and v_sub.plan_id <> p_plan_id then
    raise exception 'The % plan is coming soon.', v_new.name using errcode = 'P0001';
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
