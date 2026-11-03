-- Purpose: stop anyone from listing every file in the public buckets
-- "payment-qr" and "branding" (Supabase security advisor: "Clients can list
-- all files in this bucket").
--
-- Public buckets serve files by URL without any policy, so the booking site
-- and QR codes keep loading. The SELECT policy is still needed by the people
-- who manage the files: Storage's remove() only deletes rows they can select.
-- So SELECT now matches who may delete: the business (settings permission)
-- for its own folder, and platform admins for Sideline's QR (sideline/...).

drop policy if exists payment_qr_select on storage.objects;
create policy payment_qr_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-qr'
    and (
      coalesce(public.has_permission(public.payment_qr_tenant(name), 'settings'), false)
      or (name like 'sideline/%' and public.is_platform_admin())
    )
  );

drop policy if exists branding_select on storage.objects;
create policy branding_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'branding'
    and coalesce(public.has_permission(public.storage_tenant(name), 'settings'), false)
  );
