-- Sideline demo data — the same 7 businesses as the frontend prototype.
--
-- For development/staging projects only: run it in the SQL Editor AFTER
-- the schema (supabase/apply/schema.sql). Re-running replaces the demo
-- businesses (and everything under them) with fresh data; real businesses
-- are never touched. Dates are relative to today, so the demo always
-- looks current. Takes ~10–30 seconds (it generates ~20k bookings).
--
-- Demo business accounts have no login yet: create a user in Authentication → Users
-- with one of their emails (e.g. bea@rallypoint.ph) and it is linked to
-- that account automatically. See docs/database.md.

begin;

-- Stable ids for demo rows, derived from the prototype's ids.
create or replace function pg_temp.sid(p_key text)
returns uuid
language sql
immutable
as $$ select md5('sideline-demo:' || p_key)::uuid $$;

-- ---------------------------------------------------------------------------
-- Clear previous demo data (cascades to everything under each tenant)
-- ---------------------------------------------------------------------------
delete from public.tenants
where id in (
  select pg_temp.sid(k)
  from unnest(array['tn_rally', 'tn_dink', 'tn_kitchen', 'tn_baseline', 'tn_paddle',
                    'tn_thirdshot', 'tn_coast']) as k
);

-- ---------------------------------------------------------------------------
-- Tenants + booking rules
-- ---------------------------------------------------------------------------
insert into public.tenants (id, slug, name, legal_name, status, owner_name, owner_email, phone, city,
                            about, brand_primary, brand_accent, brand_monogram, brand_tagline, created_at)
values
  (pg_temp.sid('tn_rally'), 'rally-point', 'Rally Point Pickleball', 'Rally Point Sports Inc.', 'active',
   'Bea Villanueva', 'bea@rallypoint.ph', '+63 917 555 0142', 'Cebu City',
   'Rally Point runs covered and indoor courts across Cebu, with open play nights, clinics and league play every week.',
   '#0f766e', '#f59e0b', 'RP', 'Three clubs. Twelve courts. One rally.', '2025-03-14'),
  (pg_temp.sid('tn_dink'), 'dink-and-drive', 'Dink & Drive Courts', 'Dink and Drive Recreation Corp.', 'active',
   'Paolo Mercado', 'paolo@dinkdrive.ph', '+63 918 555 0198', 'Makati',
   'Dink & Drive operates air-conditioned and rooftop courts for after-work players in Makati and Ortigas.',
   '#c2410c', '#0ea5e9', 'DD', 'Rooftop courts in the middle of the city.', '2025-06-02'),
  (pg_temp.sid('tn_kitchen'), 'kitchen-line', 'Kitchen Line Club', 'Kitchen Line Club', 'active',
   'Marivic Dela Cruz', 'marivic@kitchenline.club', '+63 927 555 0110', 'Davao City',
   'A family-run club with four outdoor courts, a coffee bar, and beginner clinics every Saturday morning.',
   '#4338ca', '#84cc16', 'KL', 'Neighborhood courts, open early, open late.', '2025-09-21'),
  (pg_temp.sid('tn_baseline'), 'baseline-hub', 'Baseline Sports Hub', 'Baseline Sports Hub OPC', 'trialing',
   'Jun Abellana', 'jun@baselinehub.ph', '+63 939 555 0177', 'Iloilo City',
   'Six indoor courts with pro lighting, a pro shop, and paddle rentals.',
   '#be123c', '#facc15', 'BH', 'Iloilo''s newest indoor pickleball hub.', now() - interval '9 days'),
  (pg_temp.sid('tn_paddle'), 'paddle-republic', 'Paddle Republic', 'Paddle Republic Holdings Inc.', 'active',
   'Andrea Lim', 'andrea@paddlerepublic.ph', '+63 917 555 0303', 'Taguig (BGC)',
   'Paddle Republic runs four premium venues with members'' lounges, coaching programs and corporate leagues.',
   '#0369a1', '#f97316', 'PR', 'Premium courts across Metro Manila.', '2024-11-05'),
  (pg_temp.sid('tn_thirdshot'), 'third-shot', 'Third Shot Arena', 'Third Shot Arena Corp.', 'past_due',
   'Rico Santos', 'rico@thirdshot.ph', '+63 920 555 0155', 'Angeles, Pampanga',
   'Two covered courts near Clark with night play until 1 AM.',
   '#7c3aed', '#22c55e', 'TS', 'Play hard. Play late.', '2025-04-18'),
  (pg_temp.sid('tn_coast'), 'coastline', 'Coastline Pickle Co.', 'Coastline Pickle Co.', 'suspended',
   'Lianne Ocampo', 'lianne@coastlinepickle.ph', '+63 905 555 0121', 'Panglao, Bohol',
   'Resort-side outdoor courts open to guests and walk-ins.',
   '#0e7490', '#fb7185', 'CP', 'Beachside courts in Panglao.', '2025-01-30');

insert into public.booking_rules (tenant_id, min_duration_minutes, max_duration_minutes, advance_booking_days,
                                  cancellation_window_hours, require_prepayment, payment_methods)
values
  (pg_temp.sid('tn_rally'), 60, 180, 21, 24, true, array['gcash', 'maya', 'bank_transfer', 'cash']),
  (pg_temp.sid('tn_dink'), 60, 120, 30, 12, true, array['gcash', 'maya', 'card']),
  (pg_temp.sid('tn_kitchen'), 60, 180, 14, 24, false, array['gcash', 'cash']),
  (pg_temp.sid('tn_baseline'), 60, 180, 30, 24, true, array['gcash', 'maya', 'cash']),
  (pg_temp.sid('tn_paddle'), 60, 240, 45, 48, true, array['gcash', 'maya', 'card', 'bank_transfer']),
  (pg_temp.sid('tn_thirdshot'), 60, 180, 30, 24, true, array['gcash', 'cash']),
  (pg_temp.sid('tn_coast'), 60, 180, 30, 24, true, array['gcash', 'cash']);

-- ---------------------------------------------------------------------------
-- Subscriptions + invoices (before venues: plan limits check them)
-- ---------------------------------------------------------------------------
insert into public.subscriptions (id, tenant_id, plan_id, status, billing_cycle, started_at,
                                  current_period_start, current_period_end, trial_ends_at, cancel_at_period_end)
select pg_temp.sid('sub_' || s.k), pg_temp.sid(s.k), s.plan, s.status, s.cycle, s.started,
       public.local_today() - s.offset_days,
       case
         when s.cycle = 'annual' then (public.local_today() - s.offset_days + interval '1 year')::date
         when s.status = 'trialing' then public.local_today() - s.offset_days + 14
         else (public.local_today() - s.offset_days + interval '1 month')::date
       end,
       case when s.status = 'trialing' then s.started + 14 end,
       s.status = 'cancelled'
from (values
  ('tn_rally', 'growth', 'active', 'monthly', date '2025-03-14', 12),
  ('tn_dink', 'growth', 'active', 'annual', date '2025-06-02', 150),
  ('tn_kitchen', 'starter', 'active', 'monthly', date '2025-09-21', 20),
  ('tn_baseline', 'pro', 'trialing', 'monthly', public.local_today() - 9, 9),
  ('tn_paddle', 'pro', 'active', 'annual', date '2024-11-05', 362),
  ('tn_thirdshot', 'starter', 'past_due', 'monthly', date '2025-04-18', 34),
  ('tn_coast', 'starter', 'cancelled', 'monthly', date '2025-01-30', 61)
) as s (k, plan, status, cycle, started, offset_days);

insert into public.invoices (tenant_id, subscription_id, plan_id, amount_centavos, status, issued_at, due_at, paid_at)
select s.tenant_id, s.id, s.plan_id,
       case when s.billing_cycle = 'annual' then p.annual_price_centavos else p.monthly_price_centavos end,
       inv.status, inv.issued_at, inv.issued_at + 7,
       case when inv.status = 'paid' then inv.issued_at + 1 + (inv.i % 4) end
from public.subscriptions s
join public.plans p on p.id = s.plan_id
cross join lateral (
  select i,
         (s.current_period_start - make_interval(months => i * case when s.billing_cycle = 'annual' then 12 else 1 end))::date as issued_at,
         case
           when i = 0 and s.status = 'past_due' then 'overdue'
           when s.status = 'cancelled' and i = 0 then 'void'
           when s.status = 'cancelled' and i = 1 then 'overdue'
           else 'paid'
         end as status
  from generate_series(0, case when s.billing_cycle = 'annual' then 1 else 11 end) as i
) inv
where s.status <> 'trialing'
  and s.tenant_id in (select id from public.tenants where slug in
        ('rally-point', 'dink-and-drive', 'kitchen-line', 'paddle-republic', 'third-shot', 'coastline'))
  and inv.issued_at >= s.started_at;

-- ---------------------------------------------------------------------------
-- Locations + courts
-- ---------------------------------------------------------------------------
insert into public.locations (id, tenant_id, name, slug, address, city, phone, open_hour, close_hour, status, amenities)
select pg_temp.sid(l.k), pg_temp.sid(l.t), l.name, l.slug, l.address, l.city, l.phone, l.open_h, l.close_h, l.status, l.amenities
from (values
  ('loc_rp_it', 'tn_rally', 'IT Park', 'it-park', '2F Skyrise Annex, Salinas Drive, Cebu IT Park', 'Cebu City', '+63 917 555 0142', 6, 23, 'active', array['Air-conditioned', 'Pro shop', 'Showers', 'Parking'], 17),
  ('loc_rp_banilad', 'tn_rally', 'Banilad', 'banilad', 'Gov. M. Cuenco Ave., Banilad', 'Cebu City', '+63 917 555 0143', 6, 22, 'active', array['Covered courts', 'Cafe', 'Parking'], 17),
  ('loc_rp_mandaue', 'tn_rally', 'Mandaue', 'mandaue', 'A.S. Fortuna St., Bakilid', 'Mandaue City', '+63 917 555 0144', 7, 22, 'active', array['Outdoor courts', 'Lockers'], 17),
  ('loc_dd_makati', 'tn_dink', 'Makati Rooftop', 'makati', 'Rooftop, The Grid Building, Legazpi Village', 'Makati', '+63 918 555 0198', 7, 24, 'active', array['Rooftop', 'Bar', 'Lockers'], 18),
  ('loc_dd_ortigas', 'tn_dink', 'Ortigas Indoor', 'ortigas', 'Level 3, Emerald Hub, Ortigas Center', 'Pasig', '+63 918 555 0199', 8, 23, 'active', array['Air-conditioned', 'Showers', 'Paddle rental'], 18),
  ('loc_kl_lanang', 'tn_kitchen', 'Lanang', 'lanang', 'J.P. Laurel Ave., Lanang', 'Davao City', '+63 927 555 0110', 5, 23, 'active', array['Coffee bar', 'Parking', 'Paddle rental'], 16),
  ('loc_bh_mandurriao', 'tn_baseline', 'Mandurriao', 'mandurriao', 'Benigno Aquino Ave., Mandurriao', 'Iloilo City', '+63 939 555 0177', 7, 23, 'active', array['Indoor', 'Pro lighting', 'Pro shop'], 17),
  ('loc_pr_bgc', 'tn_paddle', 'BGC Flagship', 'bgc', '32nd St. cor. 9th Ave., Bonifacio Global City', 'Taguig', '+63 917 555 0303', 6, 24, 'active', array['Members'' lounge', 'Showers', 'Pro shop', 'Valet'], 17),
  ('loc_pr_alabang', 'tn_paddle', 'Alabang', 'alabang', 'Commerce Ave., Filinvest City', 'Muntinlupa', '+63 917 555 0304', 6, 23, 'active', array['Covered courts', 'Cafe', 'Parking'], 17),
  ('loc_pr_qc', 'tn_paddle', 'Quezon City', 'quezon-city', 'Scout Tobias St., South Triangle', 'Quezon City', '+63 917 555 0305', 6, 23, 'active', array['Indoor', 'Lockers'], 17),
  ('loc_pr_pasay', 'tn_paddle', 'Bay Area', 'bay-area', 'Seaside Blvd., Mall of Asia Complex', 'Pasay', '+63 917 555 0306', 8, 22, 'inactive', array['Outdoor', 'Bay view'], 17),
  ('loc_ts_clark', 'tn_thirdshot', 'Clark', 'clark', 'M.A. Roxas Highway, Clark Freeport', 'Angeles', '+63 920 555 0155', 8, 25, 'active', array['Covered courts', 'Night lights'], 17),
  ('loc_cp_panglao', 'tn_coast', 'Panglao Beachside', 'panglao', 'Alona Beach Road, Tawala', 'Panglao', '+63 905 555 0121', 6, 21, 'active', array['Outdoor', 'Beach access'], 17)
) as l (k, t, name, slug, address, city, phone, open_h, close_h, status, amenities);

insert into public.courts (id, tenant_id, location_id, name, type, surface, day_rate_centavos,
                           night_rate_centavos, night_start_hour, status, features)
select pg_temp.sid('crt_' || substr(c.loc, 5) || '_' || n),
       l.tenant_id, l.id, 'Court ' || n, c.type,
       coalesce(c.surface, case when c.type = 'indoor' then 'Acrylic hard court' else 'Textured acrylic' end),
       c.day * 100, c.night * 100, c.night_from,
       case when l.status = 'inactive' then 'inactive'
            when n = any (c.maintenance) then 'maintenance'
            else 'active' end,
       c.features
from (values
  ('loc_rp_it', 4, 'indoor', 450, 600, 'Cushioned acrylic', array[]::int[], array['LED lighting', 'Spectator seating'], 17),
  ('loc_rp_banilad', 4, 'covered', 350, 480, null, array[4], array['Roofed', 'Night lights'], 17),
  ('loc_rp_mandaue', 2, 'outdoor', 250, 350, null, array[]::int[], array['Night lights'], 17),
  ('loc_dd_makati', 3, 'outdoor', 500, 700, null, array[]::int[], array['City view', 'Night lights'], 18),
  ('loc_dd_ortigas', 3, 'indoor', 550, 750, null, array[]::int[], array['Air-conditioned', 'Ball machine'], 18),
  ('loc_kl_lanang', 4, 'outdoor', 200, 300, null, array[]::int[], array['Night lights'], 16),
  ('loc_bh_mandurriao', 6, 'indoor', 400, 520, null, array[]::int[], array['Pro lighting', 'Wooden sports floor'], 17),
  ('loc_pr_bgc', 5, 'indoor', 800, 1100, 'Pro cushion', array[]::int[], array['Air-conditioned', 'Broadcast camera', 'Seating'], 17),
  ('loc_pr_alabang', 4, 'covered', 600, 850, null, array[]::int[], array['Roofed', 'Night lights'], 17),
  ('loc_pr_qc', 3, 'indoor', 650, 900, null, array[3], array['Air-conditioned'], 17),
  ('loc_pr_pasay', 2, 'outdoor', 500, 700, null, array[]::int[], array['Bay view'], 17),
  ('loc_ts_clark', 2, 'covered', 300, 400, null, array[]::int[], array['Night lights'], 17),
  ('loc_cp_panglao', 3, 'outdoor', 300, 450, null, array[]::int[], array['Beachfront'], 17)
) as c (loc, cnt, type, day, night, surface, maintenance, features, night_from)
join public.locations l on l.id = pg_temp.sid(c.loc)
cross join generate_series(1, c.cnt) as n;

-- ---------------------------------------------------------------------------
-- Business accounts (no logins yet — see the header)
-- ---------------------------------------------------------------------------
insert into public.staff_members (tenant_id, name, email, phone, role, location_ids, status, last_active_at)
select pg_temp.sid(s.t), s.name, s.email, s.phone, s.role,
       coalesce((select array_agg(pg_temp.sid(x)) from unnest(s.locs) as x), '{}'),
       s.status,
       case when s.status = 'active' then now() - make_interval(hours => s.hours_ago) end
from (values
  ('tn_rally', 'Bea Villanueva', 'bea@rallypoint.ph', '+63 917 555 0142', 'owner', array[]::text[], 'active', 1),
  ('tn_rally', 'Karl Uy', 'karl@rallypoint.ph', '+63 917 555 0201', 'owner', array[]::text[], 'active', 3),
  ('tn_dink', 'Paolo Mercado', 'paolo@dinkdrive.ph', '+63 918 555 0198', 'owner', array[]::text[], 'active', 5),
  ('tn_kitchen', 'Marivic Dela Cruz', 'marivic@kitchenline.club', '+63 927 555 0110', 'owner', array[]::text[], 'active', 12),
  ('tn_baseline', 'Jun Abellana', 'jun@baselinehub.ph', '+63 939 555 0177', 'owner', array[]::text[], 'active', 20),
  ('tn_paddle', 'Andrea Lim', 'andrea@paddlerepublic.ph', '+63 917 555 0303', 'owner', array[]::text[], 'active', 6),
  ('tn_thirdshot', 'Rico Santos', 'rico@thirdshot.ph', '+63 920 555 0155', 'owner', array[]::text[], 'active', 72),
  ('tn_coast', 'Lianne Ocampo', 'lianne@coastlinepickle.ph', '+63 905 555 0121', 'owner', array[]::text[], 'active', 900)
) as s (t, name, email, phone, role, locs, status, hours_ago);

-- ---------------------------------------------------------------------------
-- Customers, bookings and payments (generated)
-- ---------------------------------------------------------------------------
do $$
declare
  v_first text[] := array['Andrea', 'Miguel', 'Carla', 'Joshua', 'Patricia', 'Gabriel', 'Nicole', 'Rafael',
    'Kristine', 'Mark', 'Bianca', 'Paolo', 'Janine', 'Carlo', 'Camille', 'Enzo', 'Trisha', 'Luis', 'Angela',
    'Vincent', 'Sofia', 'Daniel', 'Isabel', 'Ramon', 'Hannah', 'Jerome', 'Mika', 'Adrian', 'Lea', 'Francis',
    'Denise', 'Kevin', 'Ella', 'Marco', 'Reina', 'Tomas', 'Yvonne', 'Jasper'];
  v_last text[] := array['Reyes', 'Santos', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Flores',
    'Ramos', 'Aquino', 'Castillo', 'Navarro', 'Lim', 'Tan', 'Uy', 'Go', 'Sy', 'Villanueva', 'Gonzales',
    'Domingo', 'Pascual', 'Salazar', 'Fernandez', 'Ocampo', 'Valdez', 'Chua', 'Mercado', 'Rivera'];
  v_tags text[] := array['Regular', 'League', 'Clinic', 'Member', 'Corporate', 'New'];
  v_notes text[] := array['Bringing own paddles', 'Birthday group, may need extra chairs',
    'Beginner group — asked about coaching', 'Corporate team, invoice to company',
    'Requested court near the entrance', 'Paddle rental for 4'];
  v_tenant record;
  v_court record;
  v_customers uuid[];
  v_customer uuid;
  v_first_name text;
  v_last_name text;
  v_today date := public.local_today();
  v_now_hour integer := extract(hour from now() at time zone 'Asia/Manila')::integer;
  v_first_day integer;
  v_last_day integer;
  v_date date;
  v_hour integer;
  v_duration integer;
  v_p numeric;
  v_is_past boolean;
  v_source text;
  v_status text;
  v_pay text;
  v_r numeric;
  v_booking uuid;
  v_amount integer;
  v_method text;
  v_online text[];
  v_pay_status text;
  v_created date;
  v_i integer;
  v_phone_base bigint := 9170000000;
begin
  perform setseed(0.42);

  for v_tenant in
    select t.id, t.slug, t.status, t.brand_monogram, r.require_prepayment, r.payment_methods,
           case t.slug when 'rally-point' then 64 when 'dink-and-drive' then 48 when 'kitchen-line' then 32
                       when 'baseline-hub' then 18 when 'paddle-republic' then 84 when 'third-shot' then 16
                       else 12 end as customer_count,
           case t.slug when 'rally-point' then 0.42 when 'dink-and-drive' then 0.48 when 'kitchen-line' then 0.36
                       when 'baseline-hub' then 0.22 when 'paddle-republic' then 0.5 when 'third-shot' then 0.25
                       else 0.3 end as demand
    from public.tenants t join public.booking_rules r on r.tenant_id = t.id
    where t.id in (select pg_temp.sid(k) from unnest(array['tn_rally', 'tn_dink', 'tn_kitchen',
                     'tn_baseline', 'tn_paddle', 'tn_thirdshot', 'tn_coast']) as k)
    order by t.slug
  loop
    -- Customers (unique phone per business)
    v_customers := '{}';
    for v_i in 1 .. v_tenant.customer_count loop
      v_first_name := v_first[1 + floor(random() * array_length(v_first, 1))::int];
      v_last_name := v_last[1 + floor(random() * array_length(v_last, 1))::int];
      v_phone_base := v_phone_base + 1 + floor(random() * 50)::int;
      insert into public.customers (tenant_id, name, email, phone, tags, created_at)
      values (v_tenant.id, v_first_name || ' ' || v_last_name,
              lower(v_first_name || '.' || v_last_name || (1 + floor(random() * 98))::int || '@mail.ph'),
              '+63 ' || substr(v_phone_base::text, 1, 3) || ' ' || substr(v_phone_base::text, 4, 3) || ' ' || substr(v_phone_base::text, 7, 4),
              case when random() < 0.35 then array[v_tags[1 + floor(random() * 6)::int]] else '{}' end,
              now() - make_interval(days => 3 + floor(random() * 357)::int))
      returning id into v_customer;
      v_customers := v_customers || v_customer;
    end loop;

    v_online := array(select m from unnest(v_tenant.payment_methods) m where m <> 'cash');
    v_first_day := case when v_tenant.status = 'trialing' then -9 else -75 end;
    v_last_day := case when v_tenant.status = 'suspended' then -40 else 21 end;

    for v_court in
      select c.id, c.location_id, c.status, l.open_hour, l.close_hour
      from public.courts c join public.locations l on l.id = c.location_id
      where c.tenant_id = v_tenant.id and c.status <> 'inactive'
      order by c.name, l.name
    loop
      for v_i in v_first_day .. v_last_day loop
        v_date := v_today + v_i;
        continue when v_court.status = 'maintenance' and v_i > -7;
        v_hour := v_court.open_hour;
        while v_hour < v_court.close_hour loop
          v_p := v_tenant.demand * case
            when v_hour between 17 and 21 then 1.7
            when v_hour between 6 and 8 then 1.15
            else 0.6 end;
          if extract(isodow from v_date) in (6, 7) then v_p := v_p * 1.3; end if;
          if v_i > 0 then v_p := v_p * greatest(0.15, 1 - v_i / 25.0); end if;

          if random() >= least(v_p, 0.95) then
            v_hour := v_hour + 1;
            continue;
          end if;

          v_duration := least(
            case when random() < 0.6 then 1 when random() < 0.75 then 2 else 3 end,
            v_court.close_hour - v_hour);
          v_is_past := v_i < 0 or (v_i = 0 and v_hour + v_duration <= v_now_hour);
          v_source := case when random() < 0.7 then 'online' when random() < 0.5 then 'walk_in' else 'phone' end;

          if v_is_past then
            v_r := random();
            v_status := case when v_r < 0.88 then 'completed' when v_r < 0.95 then 'cancelled' else 'no_show' end;
          else
            v_status := case when v_i <= 3 and v_source = 'online' and random() < 0.22 then 'pending' else 'confirmed' end;
            if random() < 0.04 then v_status := 'cancelled'; end if;
          end if;

          v_pay := 'paid';
          if v_status = 'pending' then v_pay := 'unpaid'; end if;
          if v_status = 'cancelled' then v_pay := case when random() < 0.5 then 'refunded' else 'unpaid' end; end if;
          if v_status = 'confirmed' and not v_tenant.require_prepayment and random() < 0.45 then v_pay := 'unpaid'; end if;

          v_customer := v_customers[1 + floor(random() * array_length(v_customers, 1))::int];
          v_amount := public.booking_price(v_court.id, v_date, v_hour, v_duration);
          v_created := least(v_date - floor(random() * 7)::int, v_today);

          insert into public.bookings (tenant_id, location_id, court_id, customer_id, reference, business_date,
                                       start_hour, duration_hours, status, payment_status, amount_centavos,
                                       source, notes, created_at)
          values (v_tenant.id, v_court.location_id, v_court.id, v_customer,
                  v_tenant.brand_monogram || '-' || upper(substr(md5(random()::text), 1, 6)),
                  v_date, v_hour, v_duration, v_status, v_pay, v_amount,
                  v_source,
                  case when random() < 0.08 then v_notes[1 + floor(random() * 6)::int] else '' end,
                  v_created + make_interval(hours => 7 + floor(random() * 15)::int, mins => floor(random() * 60)::int))
          returning id into v_booking;

          -- Payment record: paid / refunded, or a proof waiting for review.
          v_pay_status := case
            when v_pay = 'paid' then 'paid'
            when v_pay = 'refunded' then 'refunded'
            when v_status = 'pending' and random() < 0.55 then 'pending'
          end;
          if v_pay_status is not null then
            v_method := case
              when v_source = 'walk_in' and 'cash' = any (v_tenant.payment_methods) then 'cash'
              when cardinality(v_online) > 0 then v_online[1 + floor(random() * cardinality(v_online))::int]
              else v_tenant.payment_methods[1]
            end;
            if v_pay_status = 'paid' and v_method <> 'cash' and random() < 0.02 then
              insert into public.payments (tenant_id, booking_id, customer_id, amount_centavos, method, status, reference, created_at)
              values (v_tenant.id, v_booking, v_customer, v_amount, v_method, 'failed', public.provider_reference(v_method),
                      v_created + interval '8 hours');
            end if;
            insert into public.payments (tenant_id, booking_id, customer_id, amount_centavos, method, status, reference, created_at)
            values (v_tenant.id, v_booking, v_customer, v_amount, v_method, v_pay_status, public.provider_reference(v_method),
                    v_created + interval '9 hours');
          end if;

          v_hour := v_hour + v_duration;
        end loop;
      end loop;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment details customers see at checkout (QR images are uploaded in the app)
-- ---------------------------------------------------------------------------
insert into public.payment_accounts (tenant_id, method, account_name, account_number, bank_name, instructions)
select pg_temp.sid(a.t), a.method, a.name, a.number, a.bank, a.note
from (values
  ('tn_rally', 'gcash', 'Rally Point Sports Inc.', '0917 555 0142', '', 'Use your full name as the message.'),
  ('tn_rally', 'maya', 'Rally Point Sports Inc.', '0917 555 0142', '', ''),
  ('tn_rally', 'bank_transfer', 'Rally Point Sports Inc.', '0012 3456 7890', 'BDO', ''),
  ('tn_dink', 'gcash', 'Dink and Drive Recreation', '0918 555 0198', '', ''),
  ('tn_dink', 'maya', 'Dink and Drive Recreation', '0918 555 0198', '', ''),
  ('tn_kitchen', 'gcash', 'Marivic Dela Cruz', '0927 555 0110', '', 'Send a screenshot to our Facebook page too.'),
  ('tn_baseline', 'gcash', 'Baseline Sports Hub', '0939 555 0177', '', ''),
  ('tn_paddle', 'gcash', 'Paddle Republic Holdings', '0917 555 0303', '', ''),
  ('tn_paddle', 'bank_transfer', 'Paddle Republic Holdings Inc.', '1234 5678 90', 'BPI', ''),
  ('tn_thirdshot', 'gcash', 'Rico Santos', '0920 555 0155', '', ''),
  ('tn_coast', 'gcash', 'Coastline Pickle Co.', '0905 555 0121', '', '')
) as a (t, method, name, number, bank, note);

-- ---------------------------------------------------------------------------
-- A plan change request waiting for Sideline (Kitchen Line is at its court limit)
-- ---------------------------------------------------------------------------
insert into public.plan_requests (tenant_id, from_plan_id, from_billing_cycle, plan_id, billing_cycle,
                                  note, created_at)
values (pg_temp.sid('tn_kitchen'), 'starter', 'monthly', 'growth', 'monthly',
        'We are adding a 5th court next month. Can pay via GCash.', now() - interval '20 hours');

-- ---------------------------------------------------------------------------
-- Traffic (last 12 months) and platform activity
-- ---------------------------------------------------------------------------
insert into public.page_view_stats (tenant_id, month, page_views, booking_starts, bookings_completed)
select t.id, m.month, v.views, round(v.views * (0.16 + random() * 0.05)),
       round(round(v.views * (0.16 + random() * 0.05)) * (0.58 + random() * 0.12))
from public.tenants t
cross join lateral (
  select (date_trunc('month', public.local_today()) - make_interval(months => i))::date as month, i
  from generate_series(0, 11) as i
) m
cross join lateral (
  select round((1800 + random() * 800)
         * case t.slug when 'paddle-republic' then 3.2 when 'dink-and-drive' then 2.1
                       when 'rally-point' then 2.4 when 'kitchen-line' then 1.2 else 0.8 end
         * (1 + (11 - m.i) * 0.06))::integer as views
) v
where t.id in (select pg_temp.sid(k) from unnest(array['tn_rally', 'tn_dink', 'tn_kitchen',
                 'tn_baseline', 'tn_paddle', 'tn_thirdshot', 'tn_coast']) as k)
  and m.month >= date_trunc('month', t.created_at)::date;

insert into public.platform_activity (tenant_id, kind, message, created_at)
values
  (pg_temp.sid('tn_rally'), 'payment', 'Paid invoice for Growth (monthly)', now() - interval '2 hours'),
  (pg_temp.sid('tn_baseline'), 'signup', 'Started a 14-day Pro trial', now() - interval '9 days'),
  (pg_temp.sid('tn_thirdshot'), 'payment_failed', 'Card payment failed — invoice overdue', now() - interval '30 hours'),
  (pg_temp.sid('tn_dink'), 'support', 'Asked about custom domain setup', now() - interval '52 hours'),
  (pg_temp.sid('tn_rally'), 'upgrade', 'Upgraded from Starter to Growth', now() - interval '40 days'),
  (pg_temp.sid('tn_coast'), 'suspended', 'Suspended after 2 unpaid invoices', now() - interval '38 days'),
  (pg_temp.sid('tn_paddle'), 'support', 'Pro annual renewal coming up — sent reminder', now() - interval '3 days'),
  (pg_temp.sid('tn_kitchen'), 'support', 'Requested a 5th court (Starter limit reached)', now() - interval '20 hours');

commit;

-- Summary of what was created.
select t.name,
       (select count(*) from public.locations where tenant_id = t.id) as locations,
       (select count(*) from public.courts where tenant_id = t.id) as courts,
       (select count(*) from public.customers where tenant_id = t.id) as customers,
       (select count(*) from public.bookings where tenant_id = t.id) as bookings
from public.tenants t
order by t.name;
