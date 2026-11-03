-- =============================================================================
-- CourtDesk: pretend a business's trial ended long ago, then run billing.
--
-- Run in Supabase Dashboard -> SQL Editor of the CourtDesk project
-- (hnddghpqohpfstijqpbh), NOT the match-pickleball project. Test data only: it rewrites the
-- business's subscription dates and creates real invoices.
--
-- 1. Put the business's slug below (Super Admin -> Businesses, or
--    select slug, name, status from public.tenants;).
-- 2. Set how many days ago the trial ended.
-- 3. Run the whole file.
-- =============================================================================

-- Move the trial into the past.
with target as (
  select s.id, s.trial_ends_at
  from public.subscriptions s
  join public.tenants t on t.id = s.tenant_id
  where t.slug = 'match-pickleball'      -- <- change
    and s.status = 'trialing'
)
update public.subscriptions s
set started_at           = public.local_today() - 45 - 14,  -- trial started 14 days before it ended
    current_period_start = public.local_today() - 45 - 14,
    current_period_end   = public.local_today() - 45,
    trial_ends_at        = public.local_today() - 45         -- <- trial ended 45 days ago
from target
where s.id = target.id;

-- Same thing the nightly job / "Run billing now" does.
select public.run_billing_cycle() as result;

-- What happened.
select t.name, t.status as business_status, s.status as subscription_status,
       s.trial_ends_at, s.current_period_start, s.current_period_end
from public.tenants t
join public.subscriptions s on s.tenant_id = t.id
where t.slug = 'match-pickleball';      -- <- change

select i.number, i.plan_id, i.amount_centavos / 100.0 as amount_php, i.status,
       i.period_start, i.due_at
from public.invoices i
join public.tenants t on t.id = i.tenant_id
where t.slug = 'match-pickleball'       -- <- change
order by i.period_start;
