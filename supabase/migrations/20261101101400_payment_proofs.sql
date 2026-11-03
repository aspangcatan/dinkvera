-- Purpose: customers upload proof of payment (GCash / Maya / bank transfer
-- screenshot) and staff view it when approving — match-pickleball's
-- payment-proofs flow, made per tenant.
--
-- Flow: the booking site uploads the file into the private payment-proofs
-- bucket under "<tenant_id>/<random>", creates the booking, then calls
-- attach_payment_proof() with the booking reference + phone number. Only
-- that business's staff with the payments permission can read the files
-- (signed URLs); customers can upload but never list or view.

alter table public.payments
  add column proof_path text check (proof_path is null or char_length(proof_path) <= 200),
  add column transaction_reference text not null default ''
    check (char_length(transaction_reference) <= 100),
  add constraint payments_proof_in_own_folder
    check (proof_path is null or proof_path like tenant_id::text || '/%');

comment on column public.payments.proof_path is
  'Object path of the customer''s payment screenshot in the private payment-proofs bucket.';

-- payment_rows lists p.*, which was expanded when the view was created;
-- recreate it so it includes the new columns.
drop view public.payment_rows;
create view public.payment_rows
with (security_invoker = true) as
select
  p.*,
  b.reference as booking_reference,
  b.business_date as booking_date,
  b.location_id,
  c.name as customer_name
from public.payments p
join public.bookings b on b.id = p.booking_id
join public.customers c on c.id = p.customer_id;

grant select on public.payment_rows to authenticated;

-- ---------------------------------------------------------------------------
-- Private bucket: anyone may upload into an existing business's folder;
-- only that business's payments staff may read.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- Same "<tenant_id>/…" folder convention as payment-qr.
create or replace function public.storage_tenant(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select public.payment_qr_tenant(p_name);
$$;

create or replace function public.tenant_exists(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tenants where id = p_tenant_id and status not in ('suspended', 'cancelled'));
$$;

grant execute on function public.storage_tenant(text), public.tenant_exists(uuid) to anon, authenticated;

create policy payment_proofs_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'payment-proofs'
    and coalesce(public.tenant_exists(public.storage_tenant(name)), false)
  );

create policy payment_proofs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and coalesce(public.has_permission(public.storage_tenant(name), 'payments'), false)
  );

-- ---------------------------------------------------------------------------
-- attach_payment_proof(): links an uploaded screenshot to the pending
-- payment(s) of a booking. Needs the booking reference AND the phone
-- number used (same check as lookup_booking), and the file must exist in
-- that business's folder. Covers every date of a multi-date booking.
-- ---------------------------------------------------------------------------
create or replace function public.attach_payment_proof(
  p_tenant_id uuid,
  p_reference text,
  p_phone text,
  p_proof_path text,
  p_transaction_reference text default ''
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if char_length(coalesce(p_transaction_reference, '')) > 100 then
    raise exception 'The reference number is too long.' using errcode = 'P0001';
  end if;
  if public.storage_tenant(p_proof_path) is distinct from p_tenant_id
     or not exists (
       select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_proof_path
     ) then
    raise exception 'Upload your payment screenshot first.' using errcode = 'P0001';
  end if;

  update public.payments p
  set proof_path = p_proof_path,
      transaction_reference = coalesce(btrim(p_transaction_reference), '')
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where p.booking_id = b.id
    and p.status = 'pending'
    and b.tenant_id = p_tenant_id
    and b.reference = upper(btrim(p_reference))
    and char_length(public.phone_key(p_phone)) = 10
    and public.phone_key(c.phone) = public.phone_key(p_phone);
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'No payment waiting for proof on that booking.' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

revoke execute on function public.attach_payment_proof(uuid, text, text, text, text) from public;
grant execute on function public.attach_payment_proof(uuid, text, text, text, text) to anon, authenticated;
