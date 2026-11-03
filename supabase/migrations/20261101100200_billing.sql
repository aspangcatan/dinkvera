-- Purpose: what each business pays Sideline. One subscription per
-- tenant; invoices are its billing history. Changes go through
-- change_plan() / set_cancel_at_period_end() / mark_invoice_paid()
-- (see the account functions migration), never direct writes from the app.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'trialing'
    check (status in ('active', 'trialing', 'past_due', 'cancelled')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
  started_at date not null default current_date,
  current_period_start date not null default current_date,
  current_period_end date not null,
  trial_ends_at date,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period_order check (current_period_end > current_period_start),
  constraint subscriptions_trial_has_end check (status <> 'trialing' or trial_ends_at is not null)
);

create index subscriptions_plan_id_idx on public.subscriptions (plan_id);

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create sequence public.invoice_number_seq start 1040;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('SL-' || nextval('public.invoice_number_seq')),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  plan_id text not null references public.plans (id),
  amount_centavos integer not null check (amount_centavos >= 0),
  status text not null default 'open' check (status in ('paid', 'open', 'overdue', 'void')),
  issued_at date not null default current_date,
  due_at date not null,
  paid_at date,
  created_at timestamptz not null default now(),
  constraint invoices_paid_has_date check (status <> 'paid' or paid_at is not null)
);

create index invoices_tenant_id_idx on public.invoices (tenant_id, issued_at desc);
create index invoices_status_idx on public.invoices (status);
