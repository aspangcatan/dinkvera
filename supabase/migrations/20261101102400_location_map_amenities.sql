-- Purpose: a map pin per location (owners drop it on a map; the booking
-- site shows the map and "Get directions"), and limits on amenities now
-- that owners can type their own.

alter table public.locations
  add column latitude numeric(9, 6) check (latitude between -90 and 90),
  add column longitude numeric(9, 6) check (longitude between -180 and 180),
  add constraint locations_pin_complete
    check ((latitude is null) = (longitude is null));

comment on column public.locations.latitude is
  'Map pin set by the owner (WGS84). NULL = no pin; the booking site falls back to the address.';

-- At most 20 amenities, each 1–40 characters.
create or replace function public.valid_amenities(p_amenities text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(p_amenities) <= 20
    and not exists (
      select 1 from unnest(p_amenities) as a where char_length(btrim(a)) not between 1 and 40
    );
$$;

alter table public.locations
  add constraint locations_amenities_valid check (public.valid_amenities(amenities));
