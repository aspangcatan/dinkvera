-- Purpose: billing that runs itself.
--
-- run_billing_cycle() — daily (pg_cron, 00:05 Manila) or from Super Admin:
--   * trials that ended: first invoice + subscription active (or cancelled
--     if the business chose to cancel);
--   * billing periods that ended: renewal invoice for the next period (or
--     cancelled if set to end);
--   * open invoices past their due date: overdue, and the business past due;
--   * unpaid booking holds that timed out are released.
-- Approving a plan change now also issues the invoice for the new plan.
--
-- Invoices are due INVOICE_DUE_DAYS (7) after the period starts. Each
-- billing period gets at most one (non-void) invoice, so running twice is
-- harmless. Suspended businesses are left alone.

alter table public.invoices add column period_start date;

comment on column public.invoices.period_start is
  'First day of the billing period this invoice covers (automatic invoices). NULL for older/manual ones.';

create unique index invoices_one_per_period
  on public.invoices (subscription_id, period_start)
  where period_start is not null and status <> 'void';

-- ---------------------------------------------------------------------------
-- issue_invoice(): the invoice for one billing period at the plan's price.
-- Returns the new invoice id, or NULL if that period already has one.
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
          public.local_today(), p_period_start + 7, p_period_start)
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

-- ---------------------------------------------------------------------------
-- run_billing_cycle(): see the header. Platform admins may run it by hand;
-- the scheduler runs it as the database owner (no signed-in user).
-- ---------------------------------------------------------------------------
create or replace function public.run_billing_cycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.local_today();
  v_sub public.subscriptions;
  v_step interval;
  v_issued integer := 0;
  v_trials integer := 0;
  v_renewed integer := 0;
  v_cancelled integer := 0;
  v_overdue integer := 0;
  v_inv record;
begin
  if (select auth.uid()) is not null and not public.is_platform_admin() then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;

  perform public.expire_stale_holds();

  -- 1. Trials that have ended.
  for v_sub in
    select s.* from public.subscriptions s
    join public.tenants t on t.id = s.tenant_id
    where s.status = 'trialing' and s.trial_ends_at <= v_today and t.status <> 'suspended'
    for update of s
  loop
    v_trials := v_trials + 1;
    if v_sub.cancel_at_period_end then
      update public.subscriptions set status = 'cancelled' where id = v_sub.id;
      update public.tenants set status = 'cancelled' where id = v_sub.tenant_id;
      perform public.log_activity(v_sub.tenant_id, 'support', 'Trial ended; plan cancelled');
      v_cancelled := v_cancelled + 1;
      continue;
    end if;
    v_step := case when v_sub.billing_cycle = 'annual' then interval '1 year' else interval '1 month' end;
    update public.subscriptions
    set status = 'active',
        current_period_start = v_sub.trial_ends_at,
        current_period_end = (v_sub.trial_ends_at + v_step)::date
    where id = v_sub.id;
    update public.tenants set status = 'active' where id = v_sub.tenant_id and status = 'trialing';
    if public.issue_invoice(v_sub.id, v_sub.trial_ends_at) is not null then
      v_issued := v_issued + 1;
    end if;
  end loop;

  -- 2. Billing periods that have ended (catches up if runs were missed).
  for v_sub in
    select s.* from public.subscriptions s
    join public.tenants t on t.id = s.tenant_id
    where s.status in ('active', 'past_due') and s.current_period_end <= v_today
      and t.status <> 'suspended'
    for update of s
  loop
    if v_sub.cancel_at_period_end then
      update public.subscriptions set status = 'cancelled' where id = v_sub.id;
      update public.tenants set status = 'cancelled' where id = v_sub.tenant_id;
      perform public.log_activity(v_sub.tenant_id, 'support', 'Plan ended (cancelled at period end)');
      v_cancelled := v_cancelled + 1;
      continue;
    end if;
    v_step := case when v_sub.billing_cycle = 'annual' then interval '1 year' else interval '1 month' end;
    while v_sub.current_period_end <= v_today loop
      v_sub.current_period_start := v_sub.current_period_end;
      v_sub.current_period_end := (v_sub.current_period_end + v_step)::date;
      if public.issue_invoice(v_sub.id, v_sub.current_period_start) is not null then
        v_issued := v_issued + 1;
      end if;
    end loop;
    update public.subscriptions
    set current_period_start = v_sub.current_period_start,
        current_period_end = v_sub.current_period_end
    where id = v_sub.id;
    v_renewed := v_renewed + 1;
  end loop;

  -- 3. Open invoices past their due date.
  for v_inv in
    update public.invoices set status = 'overdue'
    where status = 'open' and due_at < v_today
    returning tenant_id, subscription_id, number
  loop
    v_overdue := v_overdue + 1;
    perform public.log_activity(v_inv.tenant_id, 'payment_failed',
      format('Invoice %s is overdue', v_inv.number));
  end loop;
  update public.subscriptions s set status = 'past_due'
  where s.status = 'active'
    and exists (select 1 from public.invoices i where i.subscription_id = s.id and i.status = 'overdue');
  update public.tenants t set status = 'past_due'
  where t.status = 'active'
    and exists (select 1 from public.subscriptions s where s.tenant_id = t.id and s.status = 'past_due');

  return jsonb_build_object(
    'invoicesIssued', v_issued,
    'trialsEnded', v_trials,
    'renewed', v_renewed,
    'cancelled', v_cancelled,
    'overdue', v_overdue
  );
end;
$$;

revoke execute on function public.run_billing_cycle() from public, anon;
grant execute on function public.run_billing_cycle() to authenticated;

-- ---------------------------------------------------------------------------
-- Approving a plan change also bills the new plan (unless still in trial,
-- where the first invoice comes when the trial ends). change_plan() starts
-- a fresh period today; an unpaid invoice already issued for today's period
-- (e.g. a renewal at the old price) is voided and replaced.
-- ---------------------------------------------------------------------------
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
  v_sub public.subscriptions;
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
    select * into v_sub from public.subscriptions where tenant_id = v_req.tenant_id;
    if v_sub.status <> 'trialing' then
      update public.invoices
      set status = 'void'
      where subscription_id = v_sub.id and period_start = v_sub.current_period_start
        and status = 'open' and proof_submitted_at is null and paymongo_payment_id is null;
      perform public.issue_invoice(v_sub.id, v_sub.current_period_start);
    end if;
  end if;
  update public.plan_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decision_note = left(btrim(coalesce(p_note, '')), 500),
      decided_by = (select auth.uid()),
      decided_at = now()
  where id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule: every day at 00:05 Asia/Manila (16:05 UTC). Needs the pg_cron
-- extension (Supabase: Database → Extensions / Integrations → Cron). If it
-- can't be enabled here, a NOTICE says so and nothing else fails.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available: schedule run_billing_cycle() another way.';
    return;
  end if;
  begin
    create extension if not exists pg_cron;
    perform cron.schedule('courtdesk-billing', '5 16 * * *', 'select public.run_billing_cycle()');
  exception when others then
    raise notice 'Could not schedule billing (%). Enable pg_cron in the dashboard, then run: select cron.schedule(''courtdesk-billing'', ''5 16 * * *'', ''select public.run_billing_cycle()'');', sqlerrm;
  end;
end;
$$;
