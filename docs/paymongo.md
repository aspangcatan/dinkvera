# PayMongo online payments (invoices)

Businesses can pay a CourtDesk invoice online through PayMongo Checkout
(GCash, Maya, card, QR Ph). The invoice is marked paid automatically. The
manual "upload proof" flow still works next to it.

```
Owner clicks "Pay online"
  → invoice-checkout (Edge Function) creates a PayMongo checkout session
  → owner pays on PayMongo's page, comes back to /manage/<slug>/subscription?paid=<invoice>
  → the page asks invoice-checkout to "sync": it checks the session with PayMongo
    and records the payment                       ┐ either one marks the invoice paid;
  → PayMongo also calls paymongo-webhook          ┘ recording twice is harmless
```

Both functions record payments through `record_invoice_online_payment()`, which
only the service role can call, and which checks the paid amount equals the
invoice amount.

## One-time setup (test mode first)

1. **Database:** run `supabase/migrations/20261101102200_paymongo_checkout.sql`
   in the Supabase SQL Editor.
2. **Secret key:** PayMongo dashboard → Developers → API keys → copy the
   **test secret key** (`sk_test_…`). In Supabase → Edge Functions → Secrets,
   add `PAYMONGO_SECRET_KEY` with that value. Never put it in the app's `.env`
   or share it.
3. **Deploy `invoice-checkout`:** Supabase → Edge Functions → Deploy a new
   function → Via Editor. Name it `invoice-checkout`, paste
   `supabase/functions/invoice-checkout/index.ts`, deploy. Leave "Verify JWT"
   **on**.
4. **Deploy `paymongo-webhook`:** same, named `paymongo-webhook`, pasting
   `supabase/functions/paymongo-webhook/index.ts`. Then turn **off** "Verify
   JWT" for this function (PayMongo can't send a Supabase token; the function
   checks PayMongo's signature instead).
5. **Webhook:** create a PayMongo webhook for event
   `checkout_session.payment.paid` pointing at
   `https://<project-ref>.supabase.co/functions/v1/paymongo-webhook`
   (PayMongo dashboard → Developers → Webhooks, or the API call below, run in
   your own terminal). Copy its secret (`whsk_…`) into the Supabase secret
   `PAYMONGO_WEBHOOK_SECRET`.

   ```sh
   curl https://api.paymongo.com/v1/webhooks -u sk_test_YOUR_KEY: \
     -H "Content-Type: application/json" \
     -d '{"data":{"attributes":{"url":"https://<project-ref>.supabase.co/functions/v1/paymongo-webhook","events":["checkout_session.payment.paid"]}}}'
   ```

6. **Optional:** `PAYMONGO_METHODS` secret, e.g. `gcash,paymaya,card`, if PayMongo
   rejects a method that isn't enabled on your account (default
   `qrph,gcash,paymaya,card`).

## Testing

Sign in as a business with an unpaid invoice → Subscription → Pay now → Pay
online. In test mode PayMongo's page lets you simulate a successful (or failed)
e-wallet payment, or use a test card from PayMongo's docs. You land back on the
Subscription page, which confirms the payment; the invoice shows "Paid online
(PayMongo)" and Super Admin → Invoices shows "via PayMongo".

If something fails, check Supabase → Edge Functions → (function) → Logs.

## Going live

When PayMongo has activated online payments on your account: replace
`PAYMONGO_SECRET_KEY` with the live key (`sk_live_…`), create a **live**
webhook the same way and update `PAYMONGO_WEBHOOK_SECRET`. No code changes.

Only list methods activated on the live account in `PAYMONGO_METHODS`. As of
Nov 2026 only QR Ph is live (`PAYMONGO_METHODS=qrph`); QR Ph still lets owners
pay from GCash, Maya or any bank app by scanning. Ask PayMongo to activate
cards / GCash / Maya checkout, then add them to the list.

In mock mode (no Supabase) "Pay online" simulates an instant successful payment.
