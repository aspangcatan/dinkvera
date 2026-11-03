-- Purpose: the booking engine. Every write to bookings/payments happens
-- here, in SECURITY DEFINER functions that check the caller's permission
-- themselves (the tables have no write grants for API roles).
--
-- Mirrors src/services/bookingService.ts + paymentService.ts so the app
-- behaves the same on mock data and on Supabase.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Price of a booking in centavos: each hour is peak or off-peak on its own
-- (peak can start mid-booking). Mirrors src/utils/pricing.ts.
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
    case
      when h >= r.peak_start_hour
       and (r.peak_days = 'all'
            or (r.peak_days = 'weekends') = (extract(isodow from p_date) in (6, 7)))
      then c.peak_rate_centavos
      else c.hourly_rate_centavos
    end
  ), 0)::integer
  from public.courts c
  join public.booking_rules r on r.tenant_id = c.tenant_id
  cross join generate_series(p_start_hour, p_start_hour + p_duration_hours - 1) as h
  where c.id = p_court_id;
$$;

-- Releases unpaid online holds whose time ran out and that have no
-- payment waiting for review. Called at the start of availability and
-- booking requests, so no scheduled job is needed (same approach as
-- match-pickleball, whose free hosting tier has no reliable cron).
create or replace function public.expire_stale_holds()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.bookings b
  set status = 'cancelled', hold_expires_at = null
  where b.status = 'pending'
    and b.hold_expires_at is not null
    and b.hold_expires_at < now()
    and not exists (
      select 1 from public.payments p
      where p.booking_id = b.id and p.status in ('pending', 'paid')
    );
$$;

-- "RP-7K2Q9C": tenant monogram + random hex, unique within the tenant.
create or replace function public.generate_booking_reference(p_tenant_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_reference text;
begin
  select coalesce(nullif(upper(left(regexp_replace(brand_monogram, '[^A-Za-z]', '', 'g'), 2)), ''), 'SL')
    into v_prefix
  from public.tenants where id = p_tenant_id;

  loop
    v_reference := coalesce(v_prefix, 'SL') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (
      select 1 from public.bookings where tenant_id = p_tenant_id and reference = v_reference
    );
  end loop;
  return v_reference;
end;
$$;

create or replace function public.provider_reference(p_method text)
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(left(p_method, 2)) || (floor(random() * 90000000) + 10000000)::bigint::text;
$$;

-- Loads a booking's tenant and checks the caller may act on it.
create or replace function public.require_booking_permission(p_booking_id uuid, p_permission text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.bookings where id = p_booking_id;
  if v_tenant is null then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_tenant, p_permission) then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  return v_tenant;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public: availability and booking
-- ---------------------------------------------------------------------------

-- Which hours are taken on each court of a location on a business date.
-- Returns no customer data, so the public booking site can call it.
create or replace function public.get_availability(p_location_id uuid, p_date date)
returns table (court_id uuid, hour integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.expire_stale_holds();
  return query
    select b.court_id, gs.h::integer
    from public.bookings b
    cross join generate_series(b.start_hour, b.start_hour + b.duration_hours - 1) as gs (h)
    where b.location_id = p_location_id
      and b.business_date = p_date
      and b.status in ('pending', 'confirmed', 'completed');
end;
$$;

-- Books one or more dates/times together (match-pickleball's "Add date"):
-- every slot is validated first, then all are inserted in this one
-- transaction under one reference. Any failure — including the overlap
-- constraint catching a simultaneous booking — creates nothing.
--
-- p_slots: [{"courtId": uuid, "date": "YYYY-MM-DD", "startHour": int, "durationHours": int}]
--
-- Public (online) callers can't mark a booking as paid: a payment they
-- report is recorded as 'pending' for staff to verify (GCash/transfer
-- proofs). Instant card/Maya confirmation will come from the payment
-- provider's webhook once one is integrated. Staff (source walk_in /
-- phone) may record a payment as received.
create or replace function public.create_booking_group(
  p_tenant_id uuid,
  p_slots jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default '',
  p_players integer default 4,
  p_notes text default '',
  p_source text default 'online',
  p_payment_method text default null,
  p_payment_pending boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
  v_rules public.booking_rules;
  v_is_staff boolean := public.has_permission(p_tenant_id, 'bookings');
  v_today date;
  v_now_hour integer;
  v_count integer;
  v_slot record;
  v_court record;
  v_limit integer;
  v_month record;
  v_customer_id uuid;
  v_method text := nullif(p_payment_method, '');
  v_paid_now boolean;
  v_status text;
  v_reference text;
  v_group_id uuid;
  v_payment_reference text;
  v_booking_id uuid;
  v_amount integer;
  v_total integer := 0;
  v_ids uuid[] := '{}';
begin
  perform public.expire_stale_holds();

  select * into v_tenant from public.tenants where id = p_tenant_id;
  if not found then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
  if v_tenant.status in ('suspended', 'cancelled') then
    raise exception '% is not taking bookings at the moment.', v_tenant.name using errcode = 'P0001';
  end if;
  if p_source not in ('online', 'walk_in', 'phone') then
    raise exception 'Unknown booking source' using errcode = '22023';
  end if;
  if p_source <> 'online' and not v_is_staff then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;

  select * into v_rules from public.booking_rules where tenant_id = p_tenant_id;
  v_today := public.local_today(v_tenant.timezone);
  v_now_hour := extract(hour from now() at time zone v_tenant.timezone)::integer;

  -- Payment: online cash means "pay at the venue" (only when allowed).
  if p_source = 'online' and not v_is_staff then
    if v_method is not null and not (v_method = any (v_rules.payment_methods)) then
      raise exception 'That payment method isn''t accepted here.' using errcode = 'P0001';
    end if;
    if v_method = 'cash' then
      if v_rules.require_prepayment then
        raise exception 'This business needs payment before the booking is confirmed.' using errcode = 'P0001';
      end if;
      v_method := null;
    end if;
    v_paid_now := false;
  else
    v_paid_now := v_method is not null and not coalesce(p_payment_pending, false);
  end if;

  -- Customer details
  if char_length(btrim(coalesce(p_customer_name, ''))) < 2 or p_customer_name ~ '[<>]' then
    raise exception 'Please enter your name.' using errcode = 'P0001';
  end if;
  if char_length(public.phone_key(p_customer_phone)) <> 10 then
    raise exception 'Please enter a valid mobile number.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_notes, '')) > 500 then
    raise exception 'Notes are too long (500 characters max).' using errcode = 'P0001';
  end if;

  -- Slots
  if jsonb_typeof(p_slots) <> 'array' then
    raise exception 'Pick at least one time.' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_slots);
  if v_count = 0 then
    raise exception 'Pick at least one time.' using errcode = 'P0001';
  end if;
  if v_count > 7 then
    raise exception 'One booking can cover up to 7 dates.' using errcode = 'P0001';
  end if;

  for v_slot in
    select (s->>'courtId')::uuid as court_id,
           (s->>'date')::date as business_date,
           (s->>'startHour')::integer as start_hour,
           (s->>'durationHours')::integer as duration_hours
    from jsonb_array_elements(p_slots) as s
  loop
    select c.status, c.name, l.status as location_status, l.open_hour, l.close_hour
      into v_court
    from public.courts c
    join public.locations l on l.id = c.location_id
    where c.id = v_slot.court_id and c.tenant_id = p_tenant_id;
    if not found then
      raise exception 'Court not found' using errcode = 'P0002';
    end if;
    if v_court.status <> 'active' or v_court.location_status <> 'active' then
      raise exception '% is not open for bookings right now.', v_court.name using errcode = 'P0001';
    end if;
    if v_slot.duration_hours < 1
       or v_slot.start_hour < v_court.open_hour
       or v_slot.start_hour + v_slot.duration_hours > v_court.close_hour then
      raise exception 'That time is outside opening hours.' using errcode = 'P0001';
    end if;
    if p_source = 'online' and not v_is_staff then
      if v_slot.duration_hours * 60 < v_rules.min_duration_minutes
         or v_slot.duration_hours * 60 > v_rules.max_duration_minutes then
        raise exception 'That booking length is not allowed.' using errcode = 'P0001';
      end if;
      if v_slot.business_date > v_today + v_rules.advance_booking_days then
        raise exception 'Bookings open % days ahead.', v_rules.advance_booking_days using errcode = 'P0001';
      end if;
      if v_slot.business_date < v_today
         or (v_slot.business_date = v_today and v_slot.start_hour <= v_now_hour) then
        raise exception 'That time has already passed.' using errcode = 'P0001';
      end if;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_slots) with ordinality as a (s, i)
    join jsonb_array_elements(p_slots) with ordinality as b (s, j) on a.i < b.j
    where a.s->>'courtId' = b.s->>'courtId'
      and a.s->>'date' = b.s->>'date'
      and (a.s->>'startHour')::integer < (b.s->>'startHour')::integer + (b.s->>'durationHours')::integer
      and (b.s->>'startHour')::integer < (a.s->>'startHour')::integer + (a.s->>'durationHours')::integer
  ) then
    raise exception 'Two of the picked times overlap on the same court.' using errcode = 'P0001';
  end if;

  -- Monthly booking limit of the plan
  select p.limit_bookings_per_month into v_limit
  from public.subscriptions s join public.plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant_id;
  if v_limit is not null then
    for v_month in
      select date_trunc('month', (s->>'date')::date)::date as month, count(*) as adding
      from jsonb_array_elements(p_slots) as s
      group by 1
    loop
      if (
        select count(*) from public.bookings
        where tenant_id = p_tenant_id and status <> 'cancelled'
          and business_date >= v_month.month
          and business_date < (v_month.month + interval '1 month')::date
      ) + v_month.adding > v_limit then
        raise exception 'This business has reached its monthly booking limit.'
          using errcode = 'P0001', hint = 'limit_reached';
      end if;
    end loop;
  end if;

  -- Customer: one record per phone number per business
  select id into v_customer_id
  from public.customers
  where tenant_id = p_tenant_id and public.phone_key(phone) = public.phone_key(p_customer_phone);
  if v_customer_id is null then
    insert into public.customers (tenant_id, name, email, phone, tags)
    values (p_tenant_id, btrim(p_customer_name), coalesce(btrim(p_customer_email), ''),
            btrim(p_customer_phone), array['New'])
    returning id into v_customer_id;
  end if;

  v_status := case
    when p_source = 'online' and v_rules.require_prepayment and not v_paid_now then 'pending'
    else 'confirmed'
  end;
  v_reference := public.generate_booking_reference(p_tenant_id);
  v_group_id := case when v_count > 1 then gen_random_uuid() end;
  v_payment_reference := case when v_method is not null then public.provider_reference(v_method) end;

  begin
    for v_slot in
      select (s->>'courtId')::uuid as court_id,
             (s->>'date')::date as business_date,
             (s->>'startHour')::integer as start_hour,
             (s->>'durationHours')::integer as duration_hours
      from jsonb_array_elements(p_slots) as s
      order by 2, 3
    loop
      v_amount := public.booking_price(v_slot.court_id, v_slot.business_date,
                                       v_slot.start_hour, v_slot.duration_hours);
      insert into public.bookings (
        tenant_id, location_id, court_id, customer_id, group_id, reference,
        business_date, start_hour, duration_hours, status, payment_status,
        amount_centavos, players, source, notes, hold_expires_at, created_by
      )
      select p_tenant_id, c.location_id, c.id, v_customer_id, v_group_id, v_reference,
             v_slot.business_date, v_slot.start_hour, v_slot.duration_hours, v_status,
             case when v_paid_now then 'paid' else 'unpaid' end,
             v_amount, coalesce(p_players, 4), p_source, coalesce(p_notes, ''),
             case when v_status = 'pending' and v_method is null
                  then now() + make_interval(mins => v_rules.hold_minutes) end,
             (select auth.uid())
      from public.courts c where c.id = v_slot.court_id
      returning id into v_booking_id;

      if v_method is not null then
        insert into public.payments (tenant_id, booking_id, customer_id, amount_centavos,
                                     method, status, reference, recorded_by)
        values (p_tenant_id, v_booking_id, v_customer_id, v_amount, v_method,
                case when v_paid_now then 'paid' else 'pending' end,
                v_payment_reference, (select auth.uid()));
      end if;

      v_total := v_total + v_amount;
      v_ids := v_ids || v_booking_id;
    end loop;
  exception
    when exclusion_violation then
      raise exception 'That time overlaps another booking on this court.' using errcode = 'P0001';
  end;

  return jsonb_build_object('reference', v_reference, 'total', v_total, 'bookingIds', to_jsonb(v_ids));
end;
$$;

-- Public "find my booking": reference plus the phone number used. Returns
-- every date/time under that reference (empty when nothing matches).
create or replace function public.lookup_booking(p_tenant_id uuid, p_reference text, p_phone text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'reference', b.reference,
    'groupId', b.group_id,
    'date', b.business_date,
    'startHour', b.start_hour,
    'durationHours', b.duration_hours,
    'status', b.status,
    'paymentStatus', b.payment_status,
    'amount', b.amount_centavos,
    'courtName', ct.name,
    'locationName', l.name,
    'customerName', c.name
  ) order by b.business_date, b.start_hour), '[]'::jsonb)
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  join public.courts ct on ct.id = b.court_id
  join public.locations l on l.id = b.location_id
  where b.tenant_id = p_tenant_id
    and b.reference = upper(btrim(p_reference))
    and char_length(public.phone_key(p_phone)) = 10
    and public.phone_key(c.phone) = public.phone_key(p_phone);
$$;

-- ---------------------------------------------------------------------------
-- Staff: booking changes (permission 'bookings')
-- ---------------------------------------------------------------------------
create or replace function public.set_booking_status(p_booking_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_booking_permission(p_booking_id, 'bookings');
  if p_status not in ('confirmed', 'completed', 'no_show') then
    raise exception 'Use cancel_booking() to cancel.' using errcode = '22023';
  end if;
  update public.bookings set status = p_status, hold_expires_at = null where id = p_booking_id;
exception
  when exclusion_violation then
    raise exception 'That time overlaps another booking on this court.' using errcode = 'P0001';
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_refund boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_booking_permission(p_booking_id, 'bookings');
  update public.bookings
  set status = 'cancelled',
      hold_expires_at = null,
      payment_status = case when p_refund and payment_status = 'paid' then 'refunded' else payment_status end
  where id = p_booking_id;
  if p_refund then
    update public.payments set status = 'refunded'
    where booking_id = p_booking_id and status = 'paid';
  end if;
end;
$$;

create or replace function public.mark_booking_paid(p_booking_id uuid, p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.require_booking_permission(p_booking_id, 'bookings');
begin
  if p_method not in ('gcash', 'maya', 'card', 'bank_transfer', 'cash') then
    raise exception 'Unknown payment method' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where booking_id = p_booking_id and status = 'pending') then
    update public.payments set status = 'paid', recorded_by = (select auth.uid())
    where booking_id = p_booking_id and status = 'pending';
  else
    insert into public.payments (tenant_id, booking_id, customer_id, amount_centavos, method,
                                 status, reference, recorded_by)
    select v_tenant, b.id, b.customer_id, b.amount_centavos, p_method, 'paid',
           public.provider_reference(p_method), (select auth.uid())
    from public.bookings b where b.id = p_booking_id;
  end if;
  update public.bookings
  set payment_status = 'paid',
      status = case when status = 'pending' then 'confirmed' else status end,
      hold_expires_at = null
  where id = p_booking_id;
end;
$$;

create or replace function public.reschedule_booking(
  p_booking_id uuid, p_court_id uuid, p_date date, p_start_hour integer, p_duration_hours integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.require_booking_permission(p_booking_id, 'bookings');
  v_court record;
begin
  select c.location_id, c.status, c.name, l.open_hour, l.close_hour into v_court
  from public.courts c join public.locations l on l.id = c.location_id
  where c.id = p_court_id and c.tenant_id = v_tenant;
  if not found then
    raise exception 'Court not found' using errcode = 'P0002';
  end if;
  if v_court.status <> 'active' then
    raise exception '% is not open for bookings right now.', v_court.name using errcode = 'P0001';
  end if;
  if p_duration_hours < 1 or p_start_hour < v_court.open_hour
     or p_start_hour + p_duration_hours > v_court.close_hour then
    raise exception 'That time is outside opening hours.' using errcode = 'P0001';
  end if;
  update public.bookings
  set court_id = p_court_id,
      location_id = v_court.location_id,
      business_date = p_date,
      start_hour = p_start_hour,
      duration_hours = p_duration_hours,
      amount_centavos = public.booking_price(p_court_id, p_date, p_start_hour, p_duration_hours)
  where id = p_booking_id;
exception
  when exclusion_violation then
    raise exception 'That time overlaps another booking on this court.' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: payment review (permission 'payments')
-- ---------------------------------------------------------------------------

-- A multi-date booking was paid with one transfer, so approving or
-- rejecting its proof applies to every pending payment in the group.
create or replace function public.review_payment(p_payment_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_group uuid;
  v_ids uuid[];
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_payment.tenant_id, 'payments') then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;

  select group_id into v_group from public.bookings where id = v_payment.booking_id;
  select array_agg(p.id) into v_ids
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  where p.id = p_payment_id
     or (v_group is not null and b.group_id = v_group and p.status = 'pending');

  update public.payments
  set status = case when p_approve then 'paid' else 'failed' end,
      recorded_by = (select auth.uid())
  where id = any (v_ids);

  if p_approve then
    update public.bookings b
    set payment_status = 'paid',
        status = case when b.status = 'pending' then 'confirmed' else b.status end,
        hold_expires_at = null
    where b.id in (select booking_id from public.payments where id = any (v_ids));
  end if;
end;
$$;

create or replace function public.refund_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;
  if not public.has_permission(v_payment.tenant_id, 'payments') then
    raise exception 'You don''t have permission to do that.' using errcode = '42501';
  end if;
  update public.payments set status = 'refunded', recorded_by = (select auth.uid())
  where id = p_payment_id;
  update public.bookings set payment_status = 'refunded' where id = v_payment.booking_id;
end;
$$;
