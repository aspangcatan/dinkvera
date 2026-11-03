# Architecture

## Folders

```
src/
  assets/styles/     Tailwind entry + design tokens
  components/
    ui/              generic primitives (buttons, inputs, table, modal…)
    charts/          SVG charts
    layout/          dashboard shell, logos, persona card
    booking/         booking detail/form modals, calendar day grid
    tenant/          tenant-dashboard forms (court, location, customer)
    platform/        super-admin pieces (plan card, change plan, add business)
    storefront/      public-site pieces (month calendar, slot board)
  composables/       useQuery, useBrandTheme, useNewBooking, useElementWidth
  layouts/           Marketing, Platform, Tenant, Storefront
  mocks/             seed data, one file per domain
  router/            routes + guards
  services/          async data API (mock implementation today)
  stores/            Pinia: session, current tenant, toasts
  types/             domain types (future table shapes)
  utils/             dates, money, pricing, permissions, usage, labels…
  views/             marketing/ platform/ tenant/ storefront/
```

## Data flow

```
                                      ┌─► services/supabase/*  ──► Sideline's Supabase project (RLS + functions)
views ──► services/*Service.ts ──────┤
   ▲      (one API, picked once)      └─► services/mock/*      ──► mockDb ──► mocks/*.ts (in memory)
   └── useQuery(fetcher, [reactive deps]) re-runs on filter changes
```

- **Data source** ([src/config/env.ts](../src/config/env.ts)): Supabase when `.env.local` has `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`; mock data otherwise, when `VITE_DATA_SOURCE=mock`, and always in tests. Each `services/*Service.ts` re-exports one implementation, typed as `Pick<typeof mock, …>` so both must keep the same signatures.
- **Supabase services** map snake_case rows to the app types ([mappers.ts](../src/services/supabase/mappers.ts)), read lists through the `booking_rows` / `customer_summaries` / `payment_rows` views (paging past the 1,000-row API limit), and do every booking/payment/billing change through the database functions in [docs/database.md](database.md). Auth is Supabase Auth; the persona comes from `my_memberships()`.

- **Mock data** (`src/mocks/`): tenants, plans, subscriptions + invoices, locations, courts, customers, bookings, payments, staff and analytics (traffic plus the platform activity feed). Bookings and payments are generated with a seeded PRNG relative to today. No component hardcodes sample data.
- **Services** are the only code that touches `mockDb`. Every function is `async` and returns a deep copy, like a network response. Business rules live here: overlap checks, opening hours, plan limits, booking windows, and refund and approval side effects.
- **Stores**: `session` (signed-in persona), `tenant` (the business being viewed, with its locations, subscription, plan and usage), `toast`.
- **Analytics** are computed from the tables in `analyticsService` (later these become SQL views or RPCs), except traffic, which comes from its own mock table.

## Multi-tenancy in the UI

- Every tenant-owned row has `tenantId`. Every list query takes a `tenantId`.
- Tenant context comes from the URL (`/manage/:slug`, `/book/:slug`), not from global state. That maps directly to subdomains or custom domains later.
- **Business accounts**: every login attached to a business has full access (one role, `owner`), listed in [utils/permissions.ts](../src/utils/permissions.ts). Only platform admins add or remove accounts (Super Admin → business → Business accounts). The router guard and the sidebar both use them. A platform admin can open any tenant dashboard, with a banner showing it's a support view.
- **Plan limits** (locations, courts, bookings per month) are checked in services (`assertWithinLimit`) and shown in the UI as `UsageMeter` and `LimitNotice`, with disabled "Add" buttons and an upgrade path. You can't change to a plan whose limits are below current usage.
- **Per-business rules** (`tenant.bookingRules`): booking length, advance window, cancellation window, hold time, prepayment, peak hours and days, and accepted payment methods. Both the public checkout and pricing respect them.
- **Multi-date bookings** (like match-pickleball's "Add date"): on the public Reserve page a player taps a start tile, taps a later tile to book longer, then **Add date** to keep it and pick another date, time or court (up to 7). `createBookingGroup` checks every pick first and then creates them together under **one reference** with a shared `groupId`. One payment covers them all: approving or rejecting the GCash/transfer proof applies to the whole group. Lookup and the staff booking detail list every linked date. Tile rules live in [utils/timeTiles.ts](../src/utils/timeTiles.ts).
- **Tenant status** drives behavior: `trialing` shows a banner, `past_due` shows a pay-now prompt, and `suspended` takes the booking site offline and makes `createBooking` refuse.

## Moving to Supabase (next phase, not started)

| Today                                      | With Supabase                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mockDb.<table>` arrays                    | Postgres tables (`tenants`, `plans`, `subscriptions`, `invoices`, `locations`, `courts`, `customers`, `bookings`, `payments`, `staff_members`) with `tenant_id` |
| Service function bodies                    | `supabase.from(…)` queries / RPCs. Signatures and return types stay, so views don't change                                                                      |
| `BookingRow`, `CustomerSummary`, analytics | Views or `SECURITY DEFINER` functions                                                                                                                           |
| `createBookingGroup` checks                | Exclusion constraint on (court, time range) plus an RPC, as in match-pickleball                                                                                 |
| `getAvailability` (no customer data)       | Public RPC callable by `anon`                                                                                                                                   |
| `authService` personas                     | Supabase Auth, with `platform_admins` and `memberships (user_id, tenant_id, role, location_ids)`                                                                |
| Router guards                              | Kept for UX. **RLS** on `tenant_id` + role becomes the real boundary                                                                                            |
| `assertWithinLimit`                        | Enforced again in RPCs / triggers                                                                                                                               |
| Mock checkout (GCash proof, Maya, card)    | Payment provider + Storage for transfer proofs                                                                                                                  |
| Brand colors in `tenant.branding`          | Same columns. A logo upload can join the monogram                                                                                                               |

Convert money (integer centavos) and dates (`YYYY-MM-DD`, start hour)
as-is. They already match match-pickleball's database conventions.
