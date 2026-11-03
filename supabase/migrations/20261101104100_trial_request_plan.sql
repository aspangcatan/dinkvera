-- Purpose: a free-trial request remembers which plan the visitor wants
-- ("Start Free Trial" on Starter or Growth on the pricing page, or the plan
-- picked on the Contact form). Super Admin sees "Wants: Growth" and starts
-- the trial on that plan. NULL = not sure / didn't say.
--
-- submit_trial_request() gets a p_plan_id argument, so it's recreated. A
-- plan that isn't offered (hidden, "coming soon", unknown) is stored as
-- NULL rather than refusing the request.

alter table public.trial_requests
  add column plan_id text references public.plans (id) on delete set null;

comment on column public.trial_requests.plan_id is
  'Plan the visitor asked to try. NULL = not sure.';

drop function public.submit_trial_request(text, text, text, text, text, integer, text);

create function public.submit_trial_request(
  p_business_name text,
  p_contact_name text,
  p_email text,
  p_phone text default '',
  p_city text default '',
  p_courts integer default null,
  p_message text default '',
  p_plan_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_plan text;
  v_id uuid;
begin
  if btrim(coalesce(p_business_name, '')) = '' or btrim(coalesce(p_contact_name, '')) = '' then
    raise exception 'Enter your business name and your name.' using errcode = 'P0001';
  end if;
  if v_email !~ '^\S+@\S+\.\S+$' then
    raise exception 'Enter a valid email address.' using errcode = 'P0001';
  end if;
  if p_courts is not null and (p_courts < 1 or p_courts > 500) then
    raise exception 'Enter how many courts you have (1–500).' using errcode = 'P0001';
  end if;
  perform public.hit_rate_limit('trial:ip', public.client_ip(), 5, interval '1 hour');
  perform public.hit_rate_limit('trial:email', v_email, 3, interval '1 day');

  select id into v_plan from public.plans
  where id = p_plan_id and is_public and not coming_soon;

  insert into public.trial_requests (business_name, contact_name, email, phone, city, courts,
                                     message, plan_id)
  values (
    left(btrim(p_business_name), 100),
    left(btrim(p_contact_name), 100),
    left(v_email, 254),
    left(btrim(coalesce(p_phone, '')), 30),
    left(btrim(coalesce(p_city, '')), 60),
    p_courts,
    left(btrim(coalesce(p_message, '')), 1000),
    v_plan
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function
  public.submit_trial_request(text, text, text, text, text, integer, text, text)
  from public;
grant execute on function
  public.submit_trial_request(text, text, text, text, text, integer, text, text)
  to anon, authenticated;
