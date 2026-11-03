-- Purpose: let the booking site check the per-player limits once, when the
-- player clicks Continue on "Your details" (the first moment their phone
-- number is known), instead of only at the final submit.
--
-- The checks move into assert_player_limits() so booking and pre-check
-- share one copy:
--   * create_booking_group() calls it, as before (the real guard);
--   * check_player_limits() is the public pre-check: one call per booking
--     attempt, rate limited per network so it can't be used to probe phone
--     numbers in bulk.

-- Raises the player-facing message if this phone may not book these slots
-- online. Internal: not callable through the API.
create or replace function public.assert_player_limits(
  p_tenant_id uuid,
  p_slots jsonb,
  p_customer_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rules public.booking_rules;
  v_open integer;
  v_over record;
begin
  select * into v_rules from public.booking_rules where tenant_id = p_tenant_id;
  if char_length(public.phone_key(p_customer_phone)) <> 10 then
    return; -- the booking itself rejects a bad number
  end if;

  -- Unpaid upcoming online bookings (counted per reference) for this phone.
  select count(distinct b.reference) into v_open
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.tenant_id = p_tenant_id
    and b.source = 'online'
    and b.status in ('pending', 'confirmed')
    and b.payment_status = 'unpaid'
    and b.business_date >= public.local_today()
    and public.phone_key(c.phone) = public.phone_key(p_customer_phone);
  if v_open >= coalesce(v_rules.max_unpaid_bookings, 3) then
    raise exception 'This number already has % unpaid % here. Pay for or cancel one first, or contact the venue.',
      v_open, case when v_open = 1 then 'booking' else 'bookings' end
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  -- Hours per court per day: these slots plus what the phone already holds.
  if v_rules.max_court_hours_per_day is not null and jsonb_typeof(p_slots) = 'array' then
    select r.court_id, r.business_date, ct.name as court_name into v_over
    from (
      select (s->>'courtId')::uuid as court_id,
             (s->>'date')::date as business_date,
             sum((s->>'durationHours')::integer) as hours
      from jsonb_array_elements(p_slots) as s
      group by 1, 2
    ) r
    join public.courts ct on ct.id = r.court_id and ct.tenant_id = p_tenant_id
    where r.hours + coalesce((
        select sum(b.duration_hours)
        from public.bookings b
        join public.customers c on c.id = b.customer_id
        where b.tenant_id = p_tenant_id
          and b.court_id = r.court_id
          and b.business_date = r.business_date
          and b.status in ('pending', 'confirmed')
          and public.phone_key(c.phone) = public.phone_key(p_customer_phone)
      ), 0) > v_rules.max_court_hours_per_day
    limit 1;
    if found then
      raise exception 'You can book up to % % on % per day (%). Pick another court or day.',
        v_rules.max_court_hours_per_day,
        case when v_rules.max_court_hours_per_day = 1 then 'hour' else 'hours' end,
        v_over.court_name, to_char(v_over.business_date, 'Mon FMDD')
        using errcode = 'P0001', hint = 'rate_limited';
    end if;
  end if;
end;
$$;

revoke execute on function public.assert_player_limits(uuid, jsonb, text)
  from public, anon, authenticated;

-- Same as before (20261101103600_per_player_booking_limits.sql), with the
-- limits read from assert_player_limits().
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
    p_customer_email, p_players, p_notes, p_source, p_payment_method, p_payment_pending);
end;
$$;

-- The booking site's pre-check. Returns nothing when the player may go on,
-- raises the same message the booking would otherwise. Staff aren't limited.
create or replace function public.check_player_limits(
  p_tenant_id uuid,
  p_slots jsonb,
  p_customer_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.has_permission(p_tenant_id, 'bookings') then
    return;
  end if;
  perform public.hit_rate_limit('booking_check', p_tenant_id::text || '|' || public.client_ip(),
                                30, interval '10 minutes');
  perform public.expire_stale_holds();
  perform public.assert_player_limits(p_tenant_id, p_slots, p_customer_phone);
end;
$$;

grant execute on function public.check_player_limits(uuid, jsonb, text) to anon, authenticated;
