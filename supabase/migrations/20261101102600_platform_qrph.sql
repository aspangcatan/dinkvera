-- Purpose: Sideline's manual payment details get a "QR Ph" option (one QR
-- any bank or e-wallet app can scan, e.g. a PayMongo in-store QR), next to
-- GCash / Maya / bank transfer. Platform accounts and invoice payments only;
-- businesses' own payment methods for players are unchanged.

alter table public.platform_payment_accounts
  drop constraint platform_payment_accounts_method_check,
  add constraint platform_payment_accounts_method_check
    check (method in ('qrph', 'gcash', 'maya', 'bank_transfer'));

alter table public.invoices
  drop constraint invoices_payment_method_check,
  add constraint invoices_payment_method_check
    check (payment_method in ('qrph', 'gcash', 'maya', 'bank_transfer'));

-- Same as before, accepting 'qrph'.
create or replace function public.submit_invoice_payment(
  p_invoice_id uuid,
  p_method text,
  p_proof_path text,
  p_transaction_reference text default ''
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
  if not found or not public.has_permission(v_invoice.tenant_id, 'billing') then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if v_invoice.status not in ('open', 'overdue') then
    raise exception 'This invoice doesn''t need paying.' using errcode = 'P0001';
  end if;
  if p_method not in ('qrph', 'gcash', 'maya', 'bank_transfer') then
    raise exception 'Choose how you paid.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_transaction_reference, '')) > 100 then
    raise exception 'The reference number is too long.' using errcode = 'P0001';
  end if;
  if p_proof_path is null
     or p_proof_path not like v_invoice.tenant_id::text || '/' || v_invoice.id::text || '/%'
     or not exists (
       select 1 from storage.objects where bucket_id = 'invoice-proofs' and name = p_proof_path
     ) then
    raise exception 'Upload your proof of payment first.' using errcode = 'P0001';
  end if;

  update public.invoices
  set payment_method = p_method,
      proof_path = p_proof_path,
      transaction_reference = coalesce(btrim(p_transaction_reference), ''),
      proof_submitted_at = now(),
      review_note = ''
  where id = p_invoice_id;

  perform public.log_activity(v_invoice.tenant_id, 'payment',
    format('Sent proof of payment for invoice %s', v_invoice.number));
end;
$$;
