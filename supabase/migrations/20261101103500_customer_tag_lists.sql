-- Purpose: each business picks its own customer tags (Customers → Manage
-- tags) instead of one fixed list for everyone.
--
-- Its own table, not a tenants column: tenants is readable by anyone (the
-- booking site loads it), and tag names like "Late payer" are internal.
-- No row = the default list. "New" is built in (added automatically to
-- first-time bookers) and isn't stored here.
--
-- Removing a tag from the list doesn't strip it from customers who have it;
-- the customer form still shows it there so it can be unticked.

-- True when tags is at most 20 distinct (case-insensitive) names of 1–24
-- characters, none of them "New".
create or replace function public.valid_customer_tags(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(tags), 0) <= 20
    and coalesce((
      select bool_and(char_length(btrim(t)) between 1 and 24 and t = btrim(t) and lower(t) <> 'new')
        and count(distinct lower(t)) = count(*)
      from unnest(tags) as t
    ), true);
$$;

create table public.customer_tag_lists (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  tags text[] not null default array['Regular', 'Member', 'League', 'Clinic', 'Corporate'],
  updated_at timestamptz not null default now(),
  constraint customer_tag_lists_valid check (public.valid_customer_tags(tags))
);

comment on table public.customer_tag_lists is
  'Customer tags a business can pick from (besides the built-in "New"). Private to the business.';

create trigger set_customer_tag_lists_updated_at
  before update on public.customer_tag_lists
  for each row execute function public.set_updated_at();

alter table public.customer_tag_lists enable row level security;

create policy customer_tag_lists_select on public.customer_tag_lists
  for select to authenticated using (public.has_permission(tenant_id, 'customers'));
create policy customer_tag_lists_insert on public.customer_tag_lists
  for insert to authenticated with check (public.has_permission(tenant_id, 'customers'));
create policy customer_tag_lists_update on public.customer_tag_lists
  for update to authenticated
  using (public.has_permission(tenant_id, 'customers'))
  with check (public.has_permission(tenant_id, 'customers'));

grant select, insert (tenant_id, tags), update (tags) on public.customer_tag_lists to authenticated;
