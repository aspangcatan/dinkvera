-- Purpose: a login is linked to a business account (owner or extra
-- account) only once its email address is confirmed. Before, the link was
-- made as soon as an auth user with that email existed, so if public
-- sign-ups were ever switched on, anyone could sign up with an invited
-- owner's email and be linked to that business.
--
-- Users added in Authentication -> Users with "Auto Confirm User" are
-- confirmed at once, so the usual flow is unchanged.

create or replace function public.link_staff_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;
  update public.staff_members
  set user_id = new.id,
      status = case when status = 'invited' then 'active' else status end
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end;
$$;

-- Also fire when a user confirms their email.
drop trigger if exists on_auth_user_link_staff on auth.users;
create trigger on_auth_user_link_staff
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.link_staff_on_signup();

create or replace function public.link_staff_to_existing_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users
  where lower(email) = lower(new.email) and email_confirmed_at is not null
  limit 1;
  if v_user is not null then
    new.user_id := v_user;
    if new.status = 'invited' then
      new.status := 'active';
    end if;
  end if;
  return new;
end;
$$;
