-- Purpose: two per-player limits for online bookings, set by each business
-- under Settings → Booking rules:
--
--   * max_court_hours_per_day: the most hours one phone number can hold on
--     one court on one day, across all its bookings ("Add date" can't stack
--     the same court past it). NULL = no limit (the old behaviour).
--   * max_unpaid_bookings: how many unpaid upcoming bookings one phone
--     number can hold before it must pay or cancel one. Was a fixed 3.
--
-- Staff bookings (walk-in, phone, or online made by staff) are not limited,
-- same as the other abuse limits.

alter table public.booking_rules
  add column max_court_hours_per_day smallint
    check (max_court_hours_per_day between 1 and 12),
  add column max_unpaid_bookings smallint not null default 3
    check (max_unpaid_bookings between 1 and 10),
  -- A single booking may already be as long as the longest booking.
  add constraint booking_rules_court_day_cap
    check (max_court_hours_per_day is null or max_court_hours_per_day * 60 >= max_duration_minutes);

comment on column public.booking_rules.max_court_hours_per_day is
  'Most hours one player (phone) can book on one court per day, online. NULL = no limit.';
comment on column public.booking_rules.max_unpaid_bookings is
  'Unpaid upcoming online bookings one player (phone) can hold at once.';

-- Same as before (20261101103300_walk_ins_setting.sql), with the unpaid limit
-- read from the rules and the per-court daily limit added.
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
  v_rules public.booking_rules;
  v_open integer;
  v_over record;
begin
  select * into v_rules from public.booking_rules where tenant_id = p_tenant_id;
  if p_source = 'walk_in' and not coalesce(v_rules.allow_walk_ins, true) then
    raise exception 'This business doesn''t take walk-ins. Turn them on in Settings → Booking rules.'
      using errcode = 'P0001';
  end if;
  if p_source = 'online' and not public.has_permission(p_tenant_id, 'bookings') then
    perform public.expire_stale_holds();
    -- Unpaid upcoming online bookings (counted per reference) for this phone.
    select count(distinct b.reference) into v_open
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.tenant_id = p_tenant_id
      and b.source = 'online'
      and b.status in ('pending', 'confirmed')
      and b.payment_status = 'unpaid'
      and b.business_date >= public.local_today()
      and char_length(public.phone_key(p_customer_phone)) = 10
      and public.phone_key(c.phone) = public.phone_key(p_customer_phone);
    if v_open >= coalesce(v_rules.max_unpaid_bookings, 3) then
      raise exception 'This number already has % unpaid % here. Pay for or cancel one first, or contact the venue.',
        v_open, case when v_open = 1 then 'booking' else 'bookings' end
        using errcode = 'P0001', hint = 'rate_limited';
    end if;

    -- Hours per court per day: this request plus what the phone already holds.
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
            and char_length(public.phone_key(p_customer_phone)) = 10
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

    perform public.hit_rate_limit('booking', p_tenant_id::text || '|' || public.client_ip(),
                                  15, interval '1 hour');
  end if;
  return public.create_booking_group_core(p_tenant_id, p_slots, p_customer_name, p_customer_phone,
    p_customer_email, p_players, p_notes, p_source, p_payment_method, p_payment_pending);
end;
$$;
