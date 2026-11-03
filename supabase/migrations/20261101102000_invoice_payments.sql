-- Purpose: businesses pay their Sideline invoices manually, like players
-- pay businesses. Sideline publishes its own GCash / Maya / bank details
-- (platform_payment_accounts); the business pays, uploads proof on the
-- invoice, and a platform admin approves (invoice paid) or declines with
-- a reason. Businesses can no longer mark their own invoices paid.

-- ---------------------------------------------------------------------------
-- Where businesses send money to Sideline
-- ---------------------------------------------------------------------------
create table public.platform_payment_accounts (
  method text primary key check (method in ('gcash', 'maya', 'bank_transfer')),
  account_name text not null default '' check (char_length(account_name) <= 100),
  account_number text not null default '' check (char_length(account_number) <= 50),
  bank_name text not null default '' check (char_length(bank_name) <= 60),
  instructions text not null default '' check (char_length(instructions) <= 300),
  -- Object path in the public payment-qr bucket ("sideline/<file>"), or NULL.
  qr_path text check (qr_path is null or qr_path like 'sideline/%'),
  updated_at timestamptz not null default now()
);

comment on table public.platform_payment_accounts is
  'Sideline''s own payment details, shown to businesses paying an invoice. '
  'Writable by platform admins only.';

create trigger set_platform_payment_accounts_updated_at
  before update on public.platform_payment_accounts
  for each row execute function public.set_updated_at();

alter table public.platform_payment_accounts enable row level security;

create policy platform_payment_accounts_select on public.platform_payment_accounts
  for select to authenticated using (true);
create policy platform_payment_accounts_insert on public.platform_payment_accounts
  for insert to authenticated with check (public.is_platform_admin());
create policy platform_payment_accounts_update on public.platform_payment_accounts
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy platform_payment_accounts_delete on public.platform_payment_accounts
  for delete to authenticated using (public.is_platform_admin());

grant select, insert, update, delete on public.platform_payment_accounts to authenticated;

-- Sideline's QR images live in the public payment-qr bucket's "sideline/" folder.
create policy payment_qr_platform_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'payment-qr' and name like 'sideline/%' and public.is_platform_admin());
create policy payment_qr_platform_update on storage.objects
  for update to authenticated
  using (bucket_id = 'payment-qr' and name like 'sideline/%' and public.is_platform_admin())
  with check (bucket_id = 'payment-qr' and name like 'sideline/%' and public.is_platform_admin());
create policy payment_qr_platform_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-qr' and name like 'sideline/%' and public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Proof of payment on invoices
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column payment_method text check (payment_method in ('gcash', 'maya', 'bank_transfer')),
  add column proof_path text check (proof_path is null or char_length(proof_path) <= 200),
  add column transaction_reference text not null default ''
    check (char_length(transaction_reference) <= 100),
  -- Set while a proof waits for review; cleared when it's declined.
  add column proof_submitted_at timestamptz,
  -- Sideline's reason when a proof is declined.
  add column review_note text not null default '' check (char_length(review_note) <= 500),
  add constraint invoices_proof_in_own_folder
    check (proof_path is null or proof_path like tenant_id::text || '/' || id::text || '/%');

comment on column public.invoices.proof_submitted_at is
  'When the business sent proof of payment; NULL when nothing is waiting for review.';

-- Private bucket, one folder per invoice: "<tenant_id>/<invoice_id>/<file>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-proofs', 'invoice-proofs', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Uploads only into an unpaid invoice's folder, by that business's billing
-- account, at most 5 files per invoice.
create or replace function public.invoice_proof_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.invoices i
      where i.tenant_id = public.storage_tenant(p_name)
        and i.id::text = split_part(p_name, '/', 2)
        and i.status in ('open', 'overdue')
        and public.has_permission(i.tenant_id, 'billing')
    )
    and (select count(*) from storage.objects o
         where o.bucket_id = 'invoice-proofs'
           and o.name like split_part(p_name, '/', 1) || '/' || split_part(p_name, '/', 2) || '/%') < 5;
$$;

grant execute on function public.invoice_proof_upload_allowed(text) to authenticated;

create policy invoice_proofs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invoice-proofs' and coalesce(public.invoice_proof_upload_allowed(name), false)
  );

-- The business (billing) and platform admins can view; nobody else.
create policy invoice_proofs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'invoice-proofs'
    and coalesce(public.has_permission(public.storage_tenant(name), 'billing'), false)
  );

-- ---------------------------------------------------------------------------
-- The business sends proof for an unpaid invoice.
-- ---------------------------------------------------------------------------
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
  if p_method not in ('gcash', 'maya', 'bank_transfer') then
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

-- ---------------------------------------------------------------------------
-- Marking an invoice paid is Sideline's call now (manual payments are
-- checked by a person). Same effect as before: a paid-up past_due
-- business goes back to active.
-- ---------------------------------------------------------------------------
create or replace function public.mark_invoice_paid(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  if not public.is_platform_admin() then
    raise exception 'Sideline confirms payments. Send your proof of payment instead.'
      using errcode = '42501';
  end if;
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
  perform public.log_activity(v_invoice.tenant_id, 'payment', format('Paid invoice %s', v_invoice.number));
end;
$$;

-- Platform admin approves a sent proof (invoice paid) or declines it with
-- a reason, which the business sees before sending a new one.
create or replace function public.review_invoice_payment(
  p_invoice_id uuid, p_approve boolean, p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  if not public.is_platform_admin() then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if v_invoice.proof_submitted_at is null or v_invoice.status not in ('open', 'overdue') then
    raise exception 'There''s no payment proof waiting on this invoice.' using errcode = 'P0001';
  end if;

  if p_approve then
    perform public.mark_invoice_paid(p_invoice_id);
  else
    if btrim(coalesce(p_note, '')) = '' then
      raise exception 'Tell the business why the proof was declined.' using errcode = 'P0001';
    end if;
    update public.invoices
    set proof_submitted_at = null, review_note = left(btrim(p_note), 500)
    where id = p_invoice_id;
    perform public.log_activity(v_invoice.tenant_id, 'support',
      format('Payment proof for invoice %s was declined', v_invoice.number));
  end if;
end;
$$;

revoke execute on function
  public.submit_invoice_payment(uuid, text, text, text),
  public.review_invoice_payment(uuid, boolean, text)
from public;
grant execute on function
  public.submit_invoice_payment(uuid, text, text, text),
  public.review_invoice_payment(uuid, boolean, text)
to authenticated;
