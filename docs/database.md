# Database (Supabase)

Sideline uses its **own Supabase project**, completely separate from
match-pickleball's. Never point this app at match-pickleball's project.

The schema lives in `supabase/migrations/` (the source of truth).
`npm run db:bundle` combines them into `supabase/apply/schema.sql`, the
file you paste into the SQL Editor. `supabase/seed/demo_seed.sql` loads
the 7 demo businesses (dev/staging only).

## Setting up a new project

1. **Create the project** at supabase.com → New project. Region: Southeast
   Asia (Singapore) is closest to PH users. Keep the database password
   yourself; the app never needs it.
2. **Apply the schema.** SQL Editor → New query → paste all of
   `supabase/apply/schema.sql` → **Run**. Expected: "Success. No rows
   returned". Run it only once, on an empty project.
3. **(Dev/staging) Load demo data.** New query → paste
   `supabase/seed/demo_seed.sql` → **Run**. It ends with a table listing
   the 7 businesses and their counts. Re-running replaces the demo data.
4. **Make yourself a platform admin.**
   - Authentication → Users → **Add user** → your email + a password,
     tick "Auto confirm user".
   - SQL Editor:
     ```sql
     insert into public.platform_admins (user_id)
     select id from auth.users where email = 'you@example.com';
     ```
5. **(Dev/staging) Demo business logins.** Add a user (auto confirm) with a
   demo account email; it's linked to that business account automatically.
   For example `bea@rallypoint.ph` or `karl@rallypoint.ph` (Rally Point),
   `marivic@kitchenline.club` (Kitchen Line, Starter plan).
6. **Turn off public sign-ups** (Authentication → Sign In / Providers →
   Email → "Allow new users to sign up" off). Business accounts are
   added by a platform admin (see _Auth model_ below), so open sign-up isn't needed.
7. **Give the app its keys.** Project Settings → API: copy the **Project
   URL** and the **publishable (anon) key** into `.env.local`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=...
   ```
   These are browser-safe. The service-role key and database password are
   never used by the app and must not be committed or shared.

To change the schema later: add a new migration file, run
`npm run db:bundle` and `npm test`, then run **only the new migration**
in the SQL Editor of an existing project.

## Conventions

- **Money:** integer centavos (`*_centavos`), never float. Same as match-pickleball.
- **Court rates:** day / night per court. From `night_start_hour` until closing (incl. after midnight) the night rate applies, every day (`booking_price()`, mirrored by `src/utils/pricing.ts`).
- **Booking time:** `business_date` + `start_hour` + `duration_hours`, the
  way the app models it. A trigger derives `starts_at`/`ends_at` in the
  tenant's timezone (hours ≥ 24 run past midnight).
- **Keys:** `uuid` everywhere except `plans.id` (`starter`, `growth`, …).
- **Multi-tenancy:** every business-owned row has `tenant_id`. Composite
  foreign keys (`(court_id, tenant_id)` → `courts (id, tenant_id)`) make
  cross-tenant references impossible.

## Tables

| Table                       | What                                         | Who can read                    | Who can write                                                               |
| --------------------------- | -------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `platform_admins`           | Sideline staff                               | self / admins                   | SQL Editor only                                                             |
| `plans`                     | Starter / Growth / Pro          | everyone (hidden plans: admins) | admins                                                                      |
| `tenants`                   | businesses + branding                        | everyone (public profile)       | `settings` permission (profile/branding columns only); status via functions |
| `booking_rules`             | per-business rules (1:1)                     | everyone                        | `settings`                                                                  |
| `staff_members`             | business accounts (logins of a business)     | tenant members                  | platform admins only                                                        |
| `subscriptions`, `invoices` | billing                                      | members / `billing`             | functions only                                                              |
| `locations`, `courts`       | venues                                       | everyone                        | `venues` (plan limits enforced)                                             |
| `customers`                 | players per business (unique phone)          | `customers`                     | `customers`                                                                 |
| `bookings`                  | court bookings (+ `group_id` for multi-date) | tenant members                  | functions only                                                              |
| `payments`                  | one row per booking                          | `payments`                      | functions only                                                              |
| `page_view_stats`           | monthly booking-site traffic                 | `reports`                       | (collector later)                                                           |
| `platform_activity`         | Super Admin activity feed                    | admins                          | functions                                                                   |

**Payment details:** `payment_accounts` (one row per business per method: GCash, Maya, bank transfer; account name and number, bank, a note, and `qr_path`) is public to read and writable by `settings` staff. QR images live in the public `payment-qr` Storage bucket, one folder per business (`<tenant_id>/…`); storage policies only let that business's `settings` staff upload or delete there. Card payments have no stored details: they need a payment provider.

**Payment proofs:** right after booking, customers upload a screenshot (image or PDF, max 5 MB) into the private `payment-proofs` bucket under `<tenant_id>/<reference>/<random>` (allowed only for a booking of that business made in the last 2 hours that isn't paid yet, max 3 files), then `attach_payment_proof(tenant, reference, phone, path, ref_no)` links it to the booking's pending payment(s) (all dates of a multi-date booking). Anyone can upload into an existing business's folder but nobody can list or read back except that business's `payments` staff, who view it through 10-minute signed links. `payments.proof_path` and `payments.transaction_reference` hold the link and the customer's receipt number.

**Homepage banner:** `tenants.hero_style` is `color` (brand-color banner, the default) or `carousel`, and `tenants.hero_images` holds up to 3 photo paths in slideshow order (both checked by constraints; paths must sit in the business's own folder). Photos (JPG, PNG or WebP, max 5 MB) live in the public `branding` bucket under `<tenant_id>/hero-<uuid>.<ext>`; only that business's `settings` staff can upload or delete. The booking site shows the carousel only when the style is `carousel` and at least one photo exists.

**Rules & policies:** `tenants.policies` is an ordered JSON list of up to 10 sections, `[{"title", "body"}]` (title 1–80 characters, body up to 4000, no other keys; checked by `valid_policies()`). Bodies are plain text: a blank line starts a paragraph and `- ` starts a bullet; the booking site renders them as text, never HTML. Public to read, editable by `settings` staff. The booking site shows them on `/book/<slug>/policies` and at checkout (customers tick “I agree”), under auto-generated booking basics from `booking_rules`.

**Plan change requests:** with no automatic payment yet, businesses can't change their own plan. `request_plan_change(tenant, plan, cycle, note)` adds a `plan_requests` row (`pending`; one at a time per business; plans below current usage and non-public plans are refused). The business can withdraw it with `cancel_plan_request(id)`. A platform admin collects payment, then calls `decide_plan_request(id, approve, note)`: approving runs `change_plan` (now platform-admin only; the new billing period starts that day), declining keeps the plan and stores the reason, which the business sees on its Subscription page. Rows are readable by the business's accounts; all changes go through these functions.

**Abuse protection (public booking site):** enforced in the database, because the publishable key is public. `create_booking_group`, `lookup_booking` and `attach_payment_proof` are thin wrappers around `*_core` functions (not callable through the API) that apply limits first: one phone can hold at most 3 unpaid upcoming online bookings per business; one network (IP, from the API gateway's request headers) at most 15 online bookings per business per hour; Find my booking at most 30 lookups per network per 10 minutes and 10 per reference per hour; proof attaching 20 per network and 5 per reference per hour. Counters live in `rate_limit_hits` (sha256 of the key, kept a day; no API access). Staff and platform admins are never limited.

Views for the dashboard lists (`security_invoker`, so RLS applies):
`booking_rows`, `customer_summaries`, `payment_rows`.

## Business accounts and permissions

There are no staff roles. Every business account (an active
`staff_members` row, `role` is always `owner`) has full access to its
business: dashboard, calendar, bookings, customers, payments, venues,
reports, settings and billing. `role_permissions()` mirrors
`src/utils/permissions.ts`.

Businesses can't add people themselves. Only a platform admin adds,
turns off or removes accounts (Super Admin → business → Business
accounts; RLS on `staff_members` allows writes for platform admins only).
The app keeps at least one active account per business.

`has_permission(tenant, permission)` is true for platform admins or an
active account of that business. Every RLS policy and business function
uses it.

## Functions (the API)

Public (booking site, callable signed out):

- `get_availability(location, date)`: taken hours per court, no customer data.
- `create_booking_group(tenant, slots, name, phone, email, players, notes, source, method, pending)`:
  one or more dates/times under one reference. Validates everything, then
  inserts in one transaction. The `bookings_no_overlap` exclusion
  constraint catches simultaneous requests. Online callers can't mark
  payments as paid: proofs are `pending` until the business approves (card/Maya
  will be confirmed by a payment-provider webhook later).
- `lookup_booking(tenant, reference, phone)`: needs the matching phone number.

Business accounts (permission checked inside):
`set_booking_status`, `cancel_booking`, `mark_booking_paid`,
`reschedule_booking` (bookings); `review_payment` (approves/rejects a
whole multi-date group), `refund_payment` (payments); `tenant_usage`,
`tenant_analytics` (dashboard); `request_plan_change`, `cancel_plan_request`, `set_cancel_at_period_end`,
`mark_invoice_paid` (billing); `my_memberships` (who am I).

Platform admin: `platform_overview`, `create_tenant`, `set_tenant_status`, `change_plan`, `decide_plan_request`.

Internal helpers (pricing, hold expiry, usage, activity log, triggers)
are not callable through the API (`function_privileges` migration).

## Auth model

Passwords: "Forgot password?" on the sign-in page emails a link (`resetPasswordForEmail`) that opens `/reset-password`, where the user sets a new one. Signed-in users change theirs from the key icon in the sidebar (current password required). Add `<app address>/reset-password` to Authentication → URL Configuration → Redirect URLs, and set up custom SMTP before real users rely on it (Supabase's built-in email is for testing only).

- Users sign in with Supabase Auth (email + password).
- A user is a **platform admin** if they're in `platform_admins`, and a
  **business account** of each tenant where an active `staff_members` row
  has their `user_id`.
- Adding an account (a platform admin adds a row with their email) links
  automatically, both ways: if the account already exists it's linked on
  insert; otherwise it's linked when a user with that email is created.
  Until an invite email exists (Edge Function, later), create the user in
  Authentication → Users.
- Expired unpaid holds are released by `expire_stale_holds()`, called at
  the start of availability and booking requests (no cron needed, as in
  match-pickleball).

## Testing

`npm test` runs the database tests in `tests/integration/database/`
against an in-process Postgres (PGlite) with stubbed `auth` schema and
roles. They apply every migration and the demo seed, then check tenant
isolation, roles, the booking engine, payments, plan limits and that
`supabase/apply/schema.sql` runs on an empty database.
