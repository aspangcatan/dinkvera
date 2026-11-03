-- Purpose: booking-site homepage banner style per business — the plain
-- brand color (as before) or a photo carousel of up to 3 images, chosen
-- under Settings → Branding.
--
-- Photos live in the public `branding` Storage bucket (they're shown to
-- every visitor), one folder per business ("<tenant_id>/…"); only that
-- business's staff with the settings permission may upload or delete.
-- tenants.hero_images stores object paths, not URLs.

-- True when every path is inside the business's own folder.
create or replace function public.paths_in_folder(p_paths text[], p_tenant_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(p like p_tenant_id::text || '/%'), true)
  from unnest(p_paths) as p;
$$;

alter table public.tenants
  add column hero_style text not null default 'color' check (hero_style in ('color', 'carousel')),
  add column hero_images text[] not null default '{}',
  add constraint tenants_hero_images_max check (cardinality(hero_images) <= 3),
  add constraint tenants_hero_images_in_own_folder check (public.paths_in_folder(hero_images, id));

comment on column public.tenants.hero_style is
  'Booking-site homepage banner: color (brand color) or carousel (hero_images).';
comment on column public.tenants.hero_images is
  'Up to 3 object paths in the public branding bucket, in display order.';

-- The branding columns are owner-editable like the rest of the brand.
grant update (hero_style, hero_images) on public.tenants to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy branding_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'branding');

create policy branding_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and coalesce(public.has_permission(public.storage_tenant(name), 'settings'), false)
  );

create policy branding_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding'
    and coalesce(public.has_permission(public.storage_tenant(name), 'settings'), false)
  );
