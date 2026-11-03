-- =============================================================================
-- CourtDesk: wipe all businesses for a from-scratch test run.
--
-- Run in Supabase Dashboard -> SQL Editor (project hnddghpqohpfstijqpbh).
-- DESTRUCTIVE and not reversible.
--
-- Deletes:  every tenant (business) and everything under it via ON DELETE
--           CASCADE: booking rules, locations, courts, customers, bookings,
--           payments, payment accounts, subscriptions, invoices, plan
--           requests, business accounts, analytics, activity.
--           Also trial requests, rate-limit counters, and every auth user
--           who is NOT a platform admin (owners and extra business accounts).
-- Keeps:    plans, platform admins (your Super Admin login), Sideline's own
--           payment accounts + QR (payment-qr/sideline/...), the billing cron.
-- =============================================================================

-- 1) Preview what will go (run this alone first if you want to check).
select
  (select count(*) from public.tenants)        as businesses,
  (select count(*) from public.bookings)       as bookings,
  (select count(*) from public.customers)      as customers,
  (select count(*) from public.invoices)       as invoices,
  (select count(*) from auth.users u
    where not exists (select 1 from public.platform_admins pa where pa.user_id = u.id)) as non_admin_logins;

-- 2) Wipe.
begin;

delete from public.tenants;          -- cascades to all business data
delete from public.rate_limit_hits;

-- trial_requests only exists once 20261101102100_trial_requests.sql is applied.
do $$
begin
  if to_regclass('public.trial_requests') is not null then
    delete from public.trial_requests;
  end if;
end $$;

-- Owner / business-account logins (platform admins are kept).
delete from auth.users u
where not exists (select 1 from public.platform_admins pa where pa.user_id = u.id);

-- Invoice numbers start again at SL-1040.
alter sequence public.invoice_number_seq restart with 1040;

commit;

-- 3) Uploaded files (optional). Supabase blocks plain DELETEs on
--    storage.objects, so the files stay behind as orphans unless you remove
--    them. Easiest: Dashboard -> Storage -> empty the buckets "branding",
--    "payment-proofs" and "invoice-proofs", and in "payment-qr" delete every
--    folder EXCEPT "sideline/" (that's Sideline's own QR).
