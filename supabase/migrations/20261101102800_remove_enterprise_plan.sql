-- Purpose: drop the hidden Enterprise plan. Large or special clients now get
-- a "Custom" build instead: their own booking software, domain and database,
-- quoted per project by Sideline. That's outside CourtDesk, so it isn't a
-- plan here; the pricing page links it to the Contact form.
--
-- Subscriptions, invoices and plan requests reference plans without
-- cascading, so a plan still in use is kept (hidden) rather than deleted.

do $$
begin
  if exists (select 1 from public.subscriptions where plan_id = 'enterprise')
     or exists (select 1 from public.invoices where plan_id = 'enterprise')
     or exists (select 1 from public.plan_requests
                where plan_id = 'enterprise' or from_plan_id = 'enterprise') then
    update public.plans set is_public = false where id = 'enterprise';
    raise notice 'Enterprise is still used by a business, so it was kept (hidden). Move them to another plan, then delete it.';
  else
    delete from public.plans where id = 'enterprise';
  end if;
end $$;
