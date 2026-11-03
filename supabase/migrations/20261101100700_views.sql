-- Purpose: read views the dashboard lists use (BookingRow, CustomerSummary
-- and PaymentRow in the app). security_invoker = true makes each view run
-- with the caller's privileges, so the underlying tables' RLS still
-- decides which rows anyone sees.

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

create view public.customer_summaries
with (security_invoker = true) as
select
  c.*,
  count(b.id) filter (where b.status <> 'cancelled')::integer as booking_count,
  coalesce(sum(b.amount_centavos) filter (where b.payment_status = 'paid'), 0)::integer as total_spent_centavos,
  max(b.business_date) filter (
    where b.status = 'completed' and b.business_date <= public.local_today()
  ) as last_visit,
  count(b.id) filter (where b.status = 'no_show')::integer as no_show_count
from public.customers c
left join public.bookings b on b.customer_id = c.id
group by c.id;

create view public.payment_rows
with (security_invoker = true) as
select
  p.*,
  b.reference as booking_reference,
  b.business_date as booking_date,
  b.location_id,
  c.name as customer_name
from public.payments p
join public.bookings b on b.id = p.booking_id
join public.customers c on c.id = p.customer_id;

grant select on public.booking_rows, public.customer_summaries, public.payment_rows to authenticated;
