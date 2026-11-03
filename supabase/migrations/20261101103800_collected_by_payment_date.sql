-- Purpose: "Collected today / this month" on the business dashboard count
-- money on the day it was received (a proof approved, or a payment
-- recorded), not on the day the court is played.
--
--   * payments.paid_at: set when a payment becomes paid. Existing paid rows
--     get their last update time, the closest record we have.
--   * tenant_collected(): today, yesterday, this month and last month up to
--     the same day, in one call. Refunded payments don't count.

alter table public.payments add column paid_at timestamptz;

update public.payments set paid_at = updated_at where status = 'paid' and paid_at is null;

comment on column public.payments.paid_at is
  'When the payment became paid (proof approved or payment recorded). NULL while not paid.';

create or replace function public.payments_set_paid_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    new.paid_at := now();
  elsif new.status <> 'paid' and new.status <> 'refunded' then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

create trigger set_payments_paid_at
  before insert or update of status on public.payments
  for each row execute function public.payments_set_paid_at();

create index payments_tenant_paid_idx on public.payments (tenant_id, paid_at) where status = 'paid';

-- Amounts in centavos, by Manila calendar day of paid_at.
create or replace function public.tenant_collected(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.local_today();
  v_month date := date_trunc('month', public.local_today())::date;
  v_last_month date := (date_trunc('month', public.local_today()) - interval '1 month')::date;
begin
  if not public.has_permission(p_tenant_id, 'dashboard') then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  return (
    with p as (
      select amount_centavos as amount, (paid_at at time zone 'Asia/Manila')::date as day
      from public.payments
      where tenant_id = p_tenant_id
        and status = 'paid'
        and paid_at >= (v_last_month::timestamp at time zone 'Asia/Manila')
    )
    select jsonb_build_object(
      'today', coalesce(sum(amount) filter (where day = v_today), 0),
      'yesterday', coalesce(sum(amount) filter (where day = v_today - 1), 0),
      'month', coalesce(sum(amount) filter (where day >= v_month), 0),
      -- Same number of days into last month, so the comparison is fair.
      'lastMonthToDate', coalesce(sum(amount) filter (
        where day >= v_last_month
          and day <= least(v_last_month + (v_today - v_month), v_month - 1)
      ), 0)
    )
    from p
  );
end;
$$;

revoke execute on function public.tenant_collected(uuid) from public, anon;
grant execute on function public.tenant_collected(uuid) to authenticated;
