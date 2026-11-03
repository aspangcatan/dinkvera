-- Purpose: bookings no longer record a number of players. Nothing asks for
-- it any more (booking site or staff form), so the column, and the
-- p_players argument of create_booking_group(), go.
--
-- create_booking_group() changes signature, so it and its internal core are
-- dropped and recreated (same behaviour as 20261101103700 and
-- 20261101100800, minus players). booking_rows selects b.*, so it's
-- recreated around the column drop.

drop function public.create_booking_group(uuid, jsonb, text, text, text, integer, text, text, text, boolean);
drop function public.create_booking_group_core(uuid, jsonb, text, text, text, integer, text, text, text, boolean);

drop view public.booking_rows;
alter table public.bookings drop column players;

create view public.booking_rows
with (security_invoker = true) as
select
  b.*,
  c.name as customer_name,
  c.phone as customer_phone,
  ct.name as court_name,
  l.name as location_name
from public.bookings b
join public.customers c on c.id = b.customer_id
join public.courts ct on ct.id = b.court_id
join public.locations l on l.id = b.location_id;

grant select on public.booking_rows to authenticated;

-- ---------------------------------------------------------------------------
-- The booking engine (internal): validates every slot, then inserts them all
-- under one reference. See 20261101100800_booking_functions.sql.
-- ---------------------------------------------------------------------------
create function public.create_booking_group_core(
  p_tenant_id uuid,
  p_slots jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default '',
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
        amount_centavos, source, notes, hold_expires_at, created_by
      )
      select p_tenant_id, c.location_id, c.id, v_customer_id, v_group_id, v_reference,
             v_slot.business_date, v_slot.start_hour, v_slot.duration_hours, v_status,
             case when v_paid_now then 'paid' else 'unpaid' end,
             v_amount, p_source, coalesce(p_notes, ''),
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

revoke execute on function
  public.create_booking_group_core(uuid, jsonb, text, text, text, text, text, text, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The public entry point: walk-in setting, per-player limits and the
-- per-network rate limit, then the core. See 20261101103700.
-- ---------------------------------------------------------------------------
create function public.create_booking_group(
  p_tenant_id uuid,
  p_slots jsonb,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default '',
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
begin
  if p_source = 'walk_in'
     and not coalesce((select allow_walk_ins from public.booking_rules where tenant_id = p_tenant_id), true) then
    raise exception 'This business doesn''t take walk-ins. Turn them on in Settings → Booking rules.'
      using errcode = 'P0001';
  end if;
  if p_source = 'online' and not public.has_permission(p_tenant_id, 'bookings') then
    perform public.expire_stale_holds();
    perform public.assert_player_limits(p_tenant_id, p_slots, p_customer_phone);
    perform public.hit_rate_limit('booking', p_tenant_id::text || '|' || public.client_ip(),
                                  15, interval '1 hour');
  end if;
  return public.create_booking_group_core(p_tenant_id, p_slots, p_customer_name, p_customer_phone,
    p_customer_email, p_notes, p_source, p_payment_method, p_payment_pending);
end;
$$;

revoke execute on function
  public.create_booking_group(uuid, jsonb, text, text, text, text, text, text, boolean)
  from public;
grant execute on function
  public.create_booking_group(uuid, jsonb, text, text, text, text, text, text, boolean)
  to anon, authenticated;
