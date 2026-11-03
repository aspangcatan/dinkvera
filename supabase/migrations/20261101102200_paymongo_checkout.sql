-- Purpose: pay invoices online with PayMongo Checkout, confirmed
-- automatically (no proof upload, no admin review). Runs next to the
-- manual proof flow, which is unchanged.
--
-- Flow: the business clicks "Pay online"; the invoice-checkout Edge
-- Function creates a PayMongo checkout session (the invoice id in its
-- metadata) and stores its id here. When PayMongo reports the payment
-- (paymongo-webhook Edge Function, or invoice-checkout's "sync" when the
-- business lands back on CourtDesk), the server calls
-- record_invoice_online_payment() with the service role key. Browsers can
-- never call it.

alter table public.invoices
  add column paymongo_checkout_id text check (char_length(paymongo_checkout_id) <= 100),
  add column paymongo_payment_id text unique check (char_length(paymongo_payment_id) <= 100);

comment on column public.invoices.paymongo_payment_id is
  'PayMongo payment that settled this invoice (online payment); NULL if paid another way.';

-- ---------------------------------------------------------------------------
-- settle_invoice(): the one place an invoice becomes paid. A paid-up
-- past_due business goes back to active. Internal: no API access.
-- ---------------------------------------------------------------------------
create or replace function public.settle_invoice(p_invoice_id uuid, p_activity text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if v_invoice.status = 'paid' then
    return;
  end if;
  if v_invoice.status = 'void' then
    raise exception 'This invoice was voided.' using errcode = 'P0001';
  end if;

  update public.invoices
  set status = 'paid', paid_at = public.local_today(), proof_submitted_at = null, review_note = ''
  where id = p_invoice_id;

  if not exists (
    select 1 from public.invoices
    where subscription_id = v_invoice.subscription_id and status = 'overdue'
  ) then
    update public.subscriptions set status = 'active'
    where id = v_invoice.subscription_id and status = 'past_due';
    update public.tenants set status = 'active'
    where id = v_invoice.tenant_id and status = 'past_due';
  end if;
  perform public.log_activity(v_invoice.tenant_id, 'payment', format(p_activity, v_invoice.number));
end;
$$;

revoke execute on function public.settle_invoice(uuid, text) from public, anon, authenticated;

-- Same behaviour as before, now through settle_invoice().
create or replace function public.mark_invoice_paid(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Sideline confirms payments. Send your proof of payment instead.'
      using errcode = '42501';
  end if;
  perform public.settle_invoice(p_invoice_id, 'Paid invoice %s');
end;
$$;

-- ---------------------------------------------------------------------------
-- Server only (service role): a PayMongo payment for an invoice succeeded.
-- Safe to call twice for the same payment (webhook + return-page sync).
-- ---------------------------------------------------------------------------
create or replace function public.record_invoice_online_payment(
  p_invoice_id uuid,
  p_checkout_id text,
  p_payment_id text,
  p_amount_centavos integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if v_invoice.paymongo_payment_id = p_payment_id then
    return;
  end if;
  if v_invoice.status not in ('open', 'overdue') then
    -- Already settled another way: keep it, but log the extra payment so
    -- Sideline can refund it from the PayMongo dashboard.
    perform public.log_activity(v_invoice.tenant_id, 'support',
      format('Extra online payment %s received for invoice %s (already %s) — refund it in PayMongo',
             p_payment_id, v_invoice.number, v_invoice.status));
    return;
  end if;
  if p_amount_centavos is distinct from v_invoice.amount_centavos then
    raise exception 'Payment amount % does not match invoice % (%).',
      p_amount_centavos, v_invoice.number, v_invoice.amount_centavos using errcode = 'P0001';
  end if;

  update public.invoices
  set paymongo_checkout_id = coalesce(p_checkout_id, paymongo_checkout_id),
      paymongo_payment_id = p_payment_id
  where id = p_invoice_id;
  perform public.settle_invoice(p_invoice_id, 'Paid invoice %s online (PayMongo)');
end;
$$;

revoke execute on function public.record_invoice_online_payment(uuid, text, text, integer)
  from public, anon, authenticated;

-- Supabase's service role (used only by Edge Functions) may call it.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function
      public.settle_invoice(uuid, text),
      public.record_invoice_online_payment(uuid, text, text, integer)
    to service_role;
  end if;
end;
$$;
