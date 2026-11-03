-- Purpose: each business's own rules & policies (house rules, cancellations
-- and refunds, dress code…), written under Settings → Policies and shown on
-- its booking site and at checkout.
--
-- Stored as an ordered list of sections on the tenant:
--   [{"title": "House rules", "body": "- Non-marking shoes only\n- …"}, …]
-- Bodies are plain text (blank line = new paragraph, "- " = bullet); the
-- booking site never renders them as HTML.

-- True when p is a list of at most 10 sections, each with a 1–80 character
-- title and a body of at most 4000 characters (and no other keys).
create or replace function public.valid_policies(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
    and jsonb_array_length(p) <= 10
    and coalesce((
      select bool_and(
        jsonb_typeof(s) = 'object'
        and jsonb_typeof(s -> 'title') = 'string'
        and jsonb_typeof(s -> 'body') = 'string'
        and char_length(btrim(s ->> 'title')) between 1 and 80
        and char_length(s ->> 'body') <= 4000
        and (select count(*) from jsonb_object_keys(s)) = 2
      )
      from jsonb_array_elements(p) as s
    ), true);
$$;

alter table public.tenants
  add column policies jsonb not null default '[]'::jsonb,
  add constraint tenants_policies_valid check (public.valid_policies(policies));

comment on column public.tenants.policies is
  'Rules & policies shown on the booking site: ordered [{title, body}], max 10.';

-- Owner-editable like the rest of the business profile (tenants_update RLS
-- already limits updates to the business's settings staff).
grant update (policies) on public.tenants to authenticated;
