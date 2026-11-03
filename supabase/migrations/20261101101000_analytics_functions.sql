-- Purpose: dashboard and report numbers, computed in the database (the
-- API returns at most 1,000 rows per request, so the app can't download
-- every booking to add them up). The JSON shapes match TenantAnalytics
-- and PlatformOverview in src/services/analyticsService.ts.

-- KPIs for one tenant over a date range (optionally one location).
create or replace function public.tenant_kpis(
  p_tenant_id uuid, p_from date, p_to date, p_location_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select * from public.bookings
    where tenant_id = p_tenant_id
      and business_date between p_from and p_to
      and (p_location_id is null or location_id = p_location_id)
  ),
  agg as (
    select
      coalesce(sum(amount_centavos) filter (where payment_status = 'paid'), 0) as revenue,
      count(*) filter (where status <> 'cancelled') as live,
      count(*) as total,
      count(*) filter (where status = 'cancelled') as cancelled,
      count(*) filter (where status = 'no_show') as no_shows,
      coalesce(sum(duration_hours) filter (where status <> 'cancelled'), 0) as hours,
      count(distinct customer_id) filter (where status <> 'cancelled') as customers
    from b
  ),
  cap as (
    select coalesce(sum((l.close_hour - l.open_hour) * (p_to - p_from + 1)), 0) as hours
    from public.courts c join public.locations l on l.id = c.location_id
    where c.tenant_id = p_tenant_id and c.status = 'active'
      and (p_location_id is null or c.location_id = p_location_id)
  )
  select jsonb_build_object(
    'revenue', agg.revenue,
    'bookings', agg.live,
    'bookedHours', agg.hours,
    'occupancy', case when cap.hours > 0 then agg.hours::numeric / cap.hours else 0 end,
    'averageBookingValue', case when agg.live > 0 then agg.revenue::numeric / agg.live else 0 end,
    'cancellationRate', case when agg.total > 0 then agg.cancelled::numeric / agg.total else 0 end,
    'noShowRate', case when agg.live > 0 then agg.no_shows::numeric / agg.live else 0 end,
    'uniqueCustomers', agg.customers
  )
  from agg, cap;
$$;

create or replace function public.tenant_analytics(
  p_tenant_id uuid, p_from date, p_to date, p_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_span integer := p_to - p_from + 1;
  v_result jsonb;
begin
  if not public.has_permission(p_tenant_id, 'dashboard') then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  if v_span < 1 or v_span > 400 then
    raise exception 'Pick a range of 1 to 400 days.' using errcode = '22023';
  end if;

  with b as (
    select * from public.bookings
    where tenant_id = p_tenant_id
      and business_date between p_from and p_to
      and (p_location_id is null or location_id = p_location_id)
  ),
  locs as (
    select * from public.locations
    where tenant_id = p_tenant_id and (p_location_id is null or id = p_location_id)
  ),
  hours as (
    select gs.h % 24 as hour, count(*) as n
    from b cross join generate_series(b.start_hour, b.start_hour + b.duration_hours - 1) as gs (h)
    where b.status <> 'cancelled'
    group by 1
  )
  select jsonb_build_object(
    'current', public.tenant_kpis(p_tenant_id, p_from, p_to, p_location_id),
    'previous', public.tenant_kpis(p_tenant_id, p_from - v_span, p_from - 1, p_location_id),

    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d::date,
        'revenue', coalesce((select sum(amount_centavos) from b
                             where b.business_date = d::date and b.payment_status = 'paid'), 0),
        'bookings', (select count(*) from b where b.business_date = d::date and b.status <> 'cancelled')
      ) order by d), '[]'::jsonb)
      from generate_series(p_from, p_to, interval '1 day') as d
    ),

    'byLocation', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'locationId', l.id,
        'name', l.name,
        'revenue', (public.tenant_kpis(p_tenant_id, p_from, p_to, l.id)->>'revenue')::numeric,
        'bookings', (public.tenant_kpis(p_tenant_id, p_from, p_to, l.id)->>'bookings')::numeric,
        'occupancy', (public.tenant_kpis(p_tenant_id, p_from, p_to, l.id)->>'occupancy')::numeric
      ) order by l.name), '[]'::jsonb)
      from locs l
    ),

    'byCourt', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'courtId', c.id,
        'name', c.name,
        'locationName', l.name,
        'occupancy', case when c.status = 'active' and l.close_hour > l.open_hour
          then coalesce((select sum(duration_hours) from b where b.court_id = c.id and b.status <> 'cancelled'), 0)::numeric
               / ((l.close_hour - l.open_hour) * v_span)
          else 0 end,
        'revenue', coalesce((select sum(amount_centavos) from b
                             where b.court_id = c.id and b.status <> 'cancelled'
                               and b.payment_status = 'paid'), 0)
      ) order by l.name, c.name), '[]'::jsonb)
      from public.courts c join locs l on l.id = c.location_id
    ),

    'byHour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', g.h, 'bookings', coalesce(hours.n, 0))
                                order by g.h), '[]'::jsonb)
      from generate_series(
        coalesce((select min(hour) from hours), 0),
        coalesce((select max(hour) from hours), -1)
      ) as g (h)
      left join hours on hours.hour = g.h
    ),

    'bySource', (
      select jsonb_agg(jsonb_build_object(
        'key', s.key,
        'value', (select count(*) from b where b.source = s.key and b.status <> 'cancelled')
      ) order by s.ord)
      from (values ('online', 1), ('walk_in', 2), ('phone', 3)) as s (key, ord)
    ),

    'byMethod', (
      select coalesce(jsonb_agg(jsonb_build_object('key', m.method, 'value', m.total)
                                order by m.total desc), '[]'::jsonb)
      from (
        select p.method, sum(p.amount_centavos) as total
        from public.payments p join b on b.id = p.booking_id
        where p.status = 'paid'
        group by p.method
      ) m
    ),

    'funnel', (
      select jsonb_build_object(
        'pageViews', coalesce(sum(page_views), 0),
        'bookingStarts', coalesce(sum(booking_starts), 0),
        'bookingsCompleted', coalesce(sum(bookings_completed), 0)
      )
      from public.page_view_stats
      where tenant_id = p_tenant_id
        and month in (date_trunc('month', p_from)::date, date_trunc('month', p_to)::date)
    )
  )
  into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform overview (Super Admin)
-- ---------------------------------------------------------------------------
create or replace function public.subscription_mrr(p_plan public.plans, p_billing_cycle text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_billing_cycle = 'annual'
              then round(p_plan.annual_price_centavos / 12.0)::integer
              else p_plan.monthly_price_centavos end;
$$;

create or replace function public.platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.local_today();
  v_from30 date := v_today - 29;
  v_from60 date := v_today - 59;
  v_this_week date := date_trunc('week', v_today)::date;
  v_result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;

  with rows as (
    select
      t.id as tenant_id,
      case when s.status in ('active', 'past_due') then public.subscription_mrr(p, s.billing_cycle) else 0 end as mrr,
      (select count(*) from public.locations l where l.tenant_id = t.id) as locations,
      (select count(*) from public.courts c where c.tenant_id = t.id) as courts,
      (select count(*) from public.bookings b
        where b.tenant_id = t.id and b.business_date between v_from30 and v_today
          and b.status <> 'cancelled') as bookings30d,
      (select coalesce(sum(b.amount_centavos), 0) from public.bookings b
        where b.tenant_id = t.id and b.business_date between v_from30 and v_today
          and b.payment_status = 'paid') as gmv30d,
      public.compute_usage(t.id) as usage,
      p.id as plan_id
    from public.tenants t
    left join public.subscriptions s on s.tenant_id = t.id
    left join public.plans p on p.id = s.plan_id
  ),
  months as (
    select (date_trunc('month', v_today) - make_interval(months => 11 - i))::date as month
    from generate_series(0, 11) as i
  ),
  mrr_series as (
    select m.month, coalesce(sum(public.subscription_mrr(p, s.billing_cycle)), 0) as mrr
    from months m
    left join public.subscriptions s
      on date_trunc('month', s.started_at) <= m.month
     and s.status <> 'trialing'
     and not (s.status = 'cancelled' and m.month >= date_trunc('month', s.current_period_start))
    left join public.plans p on p.id = s.plan_id
    group by m.month
  ),
  weeks as (
    select v_this_week - (9 - i) * 7 as week_start from generate_series(0, 9) as i
  ),
  gmv_series as (
    select w.week_start,
           coalesce(sum(b.amount_centavos) filter (where b.payment_status = 'paid'), 0) as gmv,
           count(b.id) filter (where b.status <> 'cancelled') as bookings
    from weeks w
    left join public.bookings b
      on b.business_date >= w.week_start and b.business_date < w.week_start + 7
     and b.business_date <= v_today
    group by w.week_start
  )
  select jsonb_build_object(
    'mrr', (select coalesce(sum(mrr), 0) from rows),
    'previousMrr', coalesce((select mrr from mrr_series order by month desc offset 1 limit 1), 0),
    'tenants', jsonb_build_object(
      'total', (select count(*) from public.tenants),
      'active', (select count(*) from public.tenants where status = 'active'),
      'trialing', (select count(*) from public.tenants where status = 'trialing'),
      'pastDue', (select count(*) from public.tenants where status = 'past_due'),
      'suspended', (select count(*) from public.tenants where status in ('suspended', 'cancelled'))
    ),
    'gmv30d', (select coalesce(sum(amount_centavos), 0) from public.bookings
               where business_date between v_from30 and v_today and payment_status = 'paid'),
    'previousGmv30d', (select coalesce(sum(amount_centavos), 0) from public.bookings
                       where business_date between v_from60 and v_from30 - 1 and payment_status = 'paid'),
    'bookings30d', (select coalesce(sum(bookings30d), 0) from rows),
    'mrrSeries', (select jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'mrr', mrr)
                                   order by month) from mrr_series),
    'gmvSeries', (select jsonb_agg(jsonb_build_object('weekStart', week_start, 'gmv', gmv, 'bookings', bookings)
                                   order by week_start) from gmv_series),
    'planMix', (
      select jsonb_agg(jsonb_build_object(
        'planId', p.id, 'name', p.name,
        'tenants', (select count(*) from rows r where r.plan_id = p.id),
        'mrr', (select coalesce(sum(r.mrr), 0) from rows r where r.plan_id = p.id)
      ) order by p.sort_order)
      from public.plans p
    ),
    'rows', (select jsonb_agg(jsonb_build_object(
      'tenantId', tenant_id, 'mrr', mrr, 'locations', locations, 'courts', courts,
      'bookings30d', bookings30d, 'gmv30d', gmv30d, 'usage', usage
    )) from rows)
  )
  into v_result;

  return v_result;
end;
$$;
