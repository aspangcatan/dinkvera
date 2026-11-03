-- Purpose: the invoice-checkout Edge Function saved the PayMongo checkout
-- id with a direct table update, which failed ("permission denied for
-- table invoices") because this project grants table access explicitly
-- and the service role has none on invoices. Save it through a function
-- instead, like record_invoice_online_payment(). Server only.

create or replace function public.set_invoice_checkout(p_invoice_id uuid, p_checkout_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(p_checkout_id, '')) not between 1 and 100 then
    raise exception 'Invalid checkout id' using errcode = '22023';
  end if;
  update public.invoices
  set paymongo_checkout_id = p_checkout_id
  where id = p_invoice_id and status in ('open', 'overdue');
  if not found then
    raise exception 'This invoice doesn''t need paying.' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.set_invoice_checkout(uuid, text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.set_invoice_checkout(uuid, text) to service_role;
  end if;
end;
$$;
