-- Purpose: who may call which function through the API.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, so
-- internal helpers (pricing, hold sweep, usage, activity log, trigger
-- functions) would otherwise be callable by anyone. Revoke everything,
-- then grant back exactly the public and staff entry points. Each staff
-- function still checks the caller's tenant permission itself.

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Used inside RLS policies and views, which run as the caller.
grant execute on function
  public.is_platform_admin(),
  public.staff_role(uuid),
  public.role_permissions(text),
  public.has_permission(uuid, text),
  public.is_tenant_member(uuid),
  public.phone_key(text),
  public.local_today(text)
to anon, authenticated;

-- Public booking site.
grant execute on function
  public.get_availability(uuid, date),
  public.create_booking_group(uuid, jsonb, text, text, text, integer, text, text, text, boolean),
  public.lookup_booking(uuid, text, text)
to anon, authenticated;

-- Signed-in staff and platform admins.
grant execute on function
  public.my_memberships(),
  public.tenant_usage(uuid),
  public.tenant_analytics(uuid, date, date, uuid),
  public.set_booking_status(uuid, text),
  public.cancel_booking(uuid, boolean),
  public.mark_booking_paid(uuid, text),
  public.reschedule_booking(uuid, uuid, date, integer, integer),
  public.review_payment(uuid, boolean),
  public.refund_payment(uuid),
  public.change_plan(uuid, text, text),
  public.set_cancel_at_period_end(uuid, boolean),
  public.mark_invoice_paid(uuid),
  public.create_tenant(text, text, text, text, text, text, text),
  public.set_tenant_status(uuid, text),
  public.platform_overview()
to authenticated;
