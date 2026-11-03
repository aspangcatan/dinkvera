-- Purpose: "Accept walk-ins at the front desk" (booking_rules.allow_walk_ins)
-- now does something: when it's off, no booking can be created with the
-- walk-in source. Online and phone bookings are unaffected.

-- Same as before (20261101101900_abuse_protection.sql), plus the walk-in check.
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
  v_open integer;
begin
  if p_source = 'walk_in'
     and not coalesce((select allow_walk_ins from public.booking_rules where tenant_id = p_tenant_id), true) then
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
    if v_open >= 3 then
      raise exception 'This number already has 3 unpaid bookings here. Pay for or cancel one first, or contact the venue.'
        using errcode = 'P0001', hint = 'rate_limited';
    end if;
    perform public.hit_rate_limit('booking', p_tenant_id::text || '|' || public.client_ip(),
                                  15, interval '1 hour');
  end if;
  return public.create_booking_group_core(p_tenant_id, p_slots, p_customer_name, p_customer_phone,
    p_customer_email, p_players, p_notes, p_source, p_payment_method, p_payment_pending);
end;
$$;
