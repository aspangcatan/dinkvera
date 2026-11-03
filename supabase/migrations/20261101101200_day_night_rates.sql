-- Purpose: simple day / night pricing per court.
--
-- Before: each court had a regular and a peak rate, and the business set
-- one "peak starts at" hour (+ which days) for all its courts.
-- After: each court has a day rate, a night rate and its own
-- night_start_hour. Night runs from that hour until closing — including
-- hours past midnight (24+ on the business day) — every day of the week.
--
-- Existing courts keep their prices: night_start_hour is copied from the
-- business's old peak_start_hour.

alter table public.courts rename column hourly_rate_centavos to day_rate_centavos;
alter table public.courts rename column peak_rate_centavos to night_rate_centavos;

alter table public.courts
  add column night_start_hour smallint not null default 17
    check (night_start_hour between 0 and 30);

comment on column public.courts.night_start_hour is
  'Hour of the business day (24h; 24+ = after midnight) when night_rate_centavos starts.';

update public.courts c
set night_start_hour = r.peak_start_hour
from public.booking_rules r
where r.tenant_id = c.tenant_id;

-- Price of a booking in centavos: each hour is day or night on its own (a
-- booking can start in the day and run into the night). Mirrors
-- src/utils/pricing.ts.
create or replace function public.booking_price(
  p_court_id uuid, p_date date, p_start_hour integer, p_duration_hours integer
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(
    case when h >= c.night_start_hour then c.night_rate_centavos else c.day_rate_centavos end
  ), 0)::integer
  from public.courts c
  cross join generate_series(p_start_hour, p_start_hour + p_duration_hours - 1) as h
  where c.id = p_court_id;
$$;

-- The business-wide peak setting is replaced by the per-court night start.
alter table public.booking_rules drop column peak_start_hour;
alter table public.booking_rules drop column peak_days;

update public.plans
set features = array_replace(features, 'Peak & off-peak pricing', 'Day & night rates')
where 'Peak & off-peak pricing' = any (features);
