# Security

What protects CourtDesk, and the settings that live outside the code (check
them before going live and after any change to the Supabase project).

## Built in

- **Tenant isolation:** row-level security on every table; the app's
  publishable key can only do what the policies allow. Money and status
  changes go through `security definer` functions that check
  `has_permission()` / `is_platform_admin()` first.
- **Duplicate bookings:** impossible at the database level (`bookings_no_overlap`
  exclusion constraint), even for simultaneous requests. Prices are computed
  in the database, never taken from the browser.
- **Public booking site limits:** 3 unpaid upcoming bookings per phone per
  business, 15 online bookings per network per hour, "Find my booking" 30 per
  network / 10 minutes and 10 per reference / hour, proof uploads only for a
  fresh unpaid booking (max 3 files), trial requests limited (see
  `20261101101900_abuse_protection.sql`, `20261101102100_trial_requests.sql`).
- **Logins:** a login is linked to a business account only after its email is
  confirmed (`20261101103200_link_confirmed_logins_only.sql`).
- **Online invoice payments (PayMongo):** confirmed server to server by the
  signed webhook (signature + 5-minute replay window), amount checked against
  the invoice, safe to record twice. If the webhook is missed, the Subscription
  page re-checks every unpaid invoice that had a checkout, and "Pay online"
  reuses or settles the previous checkout instead of opening a second one.
- **Files:** proofs are in private buckets readable only by the business (and
  Sideline for invoices); type and size limits on every bucket.
- **Headers:** `public/_headers` (Cloudflare Pages / Netlify) blocks framing,
  MIME sniffing, and forces HTTPS.

## Check in the Supabase dashboard

- [ ] Authentication → Sign In / Providers → Email: **"Allow new users to sign
      up" OFF** (businesses are added by Sideline).
- [ ] Authentication → Providers → Email: **Confirm email ON**.
- [ ] Authentication → Passwords: minimum length **10+**, and **leaked password
      protection ON** (Pro plan feature).
- [ ] Authentication → Rate Limits: keep the defaults (or lower).
- [ ] Your platform admin login: a long unique password; turn on MFA when the
      app supports it.
- [ ] Never put the **service_role key** or database password in `.env.local`,
      the app, or chat. Only Edge Functions use the service role (Supabase
      provides it to them).
- [ ] Edge Functions: `paymongo-webhook` with Verify JWT **off**,
      `invoice-checkout` with Verify JWT **on**.
- [ ] Database → Advisors → Security Advisor: no errors.

## Known gaps (accepted for now)

- **Slot holding with fake numbers:** someone rotating networks and phone
  numbers can hold free slots until their hold expires. Fix: Cloudflare
  Turnstile on the booking form.
- **Business list is public:** anyone can list all businesses (name, contact
  email, status), the same details each booking site shows.
- **Proof attach guesses:** failed `attach_payment_proof` attempts (wrong
  phone) aren't counted toward its limit, because the error rolls back the
  counter. Low value to an attacker ("Find my booking" is limited properly).
- **No Content-Security-Policy for scripts yet:** add one when hosting is set
  up (allow the Supabase URL, OpenStreetMap tiles, Nominatim, PayMongo).
