-- Purpose: where customers send money — each business's GCash / Maya /
-- bank details and QR code images, shown on the booking site's payment
-- step (match-pickleball's venue payment details + payment-qr bucket,
-- made per tenant).
--
-- Card payments are deliberately not here: they need a payment provider
-- (e.g. PayMongo) and Sideline never stores card details.

create table public.payment_accounts (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  method text not null check (method in ('gcash', 'maya', 'bank_transfer')),
  account_name text not null default '' check (char_length(account_name) <= 100),
  account_number text not null default '' check (char_length(account_number) <= 50),
  -- Bank transfers only, e.g. "BDO", "GoTyme".
  bank_name text not null default '' check (char_length(bank_name) <= 60),
  instructions text not null default '' check (char_length(instructions) <= 300),
  -- Object path in the public payment-qr bucket ("<tenant_id>/<file>"), or NULL.
  qr_path text check (qr_path is null or char_length(qr_path) <= 200),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, method),
  constraint payment_accounts_qr_in_own_folder
    check (qr_path is null or qr_path like tenant_id::text || '/%')
);

comment on table public.payment_accounts is
  'Payment details customers need to pay a business (public). Writable by '
  'staff with the settings permission.';

create trigger set_payment_accounts_updated_at
  before update on public.payment_accounts
  for each row execute function public.set_updated_at();

alter table public.payment_accounts enable row level security;

create policy payment_accounts_select on public.payment_accounts
  for select to anon, authenticated using (true);
create policy payment_accounts_insert on public.payment_accounts
  for insert to authenticated with check (public.has_permission(tenant_id, 'settings'));
create policy payment_accounts_update on public.payment_accounts
  for update to authenticated
  using (public.has_permission(tenant_id, 'settings'))
  with check (public.has_permission(tenant_id, 'settings'));
create policy payment_accounts_delete on public.payment_accounts
  for delete to authenticated using (public.has_permission(tenant_id, 'settings'));

grant select on public.payment_accounts to anon, authenticated;
grant insert, update, delete on public.payment_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- QR images: public bucket (they're meant to be shown to every customer),
-- one folder per tenant; only that tenant's staff with the settings
-- permission may write into it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The tenant a payment-qr object belongs to (its first folder), or NULL
-- for a malformed path. CASE keeps the uuid cast from ever erroring.
create or replace function public.payment_qr_tenant(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

grant execute on function public.payment_qr_tenant(text) to anon, authenticated;

create policy payment_qr_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'payment-qr');

create policy payment_qr_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-qr'
    and coalesce(public.has_permission(public.payment_qr_tenant(name), 'settings'), false)
  );

create policy payment_qr_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'payment-qr'
    and coalesce(public.has_permission(public.payment_qr_tenant(name), 'settings'), false)
  )
  with check (
    bucket_id = 'payment-qr'
    and coalesce(public.has_permission(public.payment_qr_tenant(name), 'settings'), false)
  );

create policy payment_qr_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'payment-qr'
    and coalesce(public.has_permission(public.payment_qr_tenant(name), 'settings'), false)
  );
