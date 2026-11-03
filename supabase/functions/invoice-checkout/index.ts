// Supabase Edge Function: invoice-checkout (Deno).
//
// Called by the CourtDesk app (signed in) to pay an invoice online:
//   { action: 'create', invoiceId, returnPath } → { checkoutUrl }
//     Creates a PayMongo checkout session for the invoice's exact amount.
//     If the invoice's last session was already paid (e.g. the business lost
//     its connection before coming back), records it and returns
//     { checkoutUrl: null } instead; if it's still open, returns that one, so
//     an invoice never has two payable sessions at once.
//   { action: 'sync', invoiceId } → { status: 'paid' | 'pending' | 'unpaid' | 'failed', reason? }
//     Asks PayMongo whether the session was paid and, if so, records it
//     (so the invoice turns paid even before the webhook arrives). "failed"
//     means the latest attempt failed or expired; `reason` is PayMongo's message.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   PAYMONGO_SECRET_KEY  sk_test_… (test) or sk_live_… (live). Required.
//   PAYMONGO_METHODS     optional, comma separated; default "qrph,gcash,paymaya,card".
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const PAYMONGO_API = 'https://api.paymongo.com/v1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

/** The parts of PayMongo's checkout session this function reads. */
interface CheckoutSession {
  id: string
  attributes: {
    checkout_url: string
    /** "active" while it can still be paid, then "expired". */
    status?: string
    payments?: {
      id: string
      attributes: { status: string; amount: number; failed_message?: string | null }
    }[]
    payment_intent?: {
      attributes?: {
        status?: string
        last_payment_error?: { failed_message?: string; failed_code?: string } | null
      }
    } | null
  }
}

/** Why the latest attempt on this checkout failed or expired, if it did. */
function lastFailure(session: CheckoutSession): string | null {
  const error = session.attributes.payment_intent?.attributes?.last_payment_error
  if (error) return error.failed_message || error.failed_code || 'The payment was not completed.'
  const failed = (session.attributes.payments ?? []).filter((p) => p.attributes.status === 'failed')
  if (failed.length) {
    return failed[failed.length - 1]!.attributes.failed_message || 'The payment was not completed.'
  }
  return null
}

/** The session's successful payment, if there is one. */
function paidPayment(session: CheckoutSession) {
  return (session.attributes.payments ?? []).find((p) => p.attributes.status === 'paid')
}

async function paymongo(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<CheckoutSession> {
  const key = Deno.env.get('PAYMONGO_SECRET_KEY')
  if (!key) throw new HttpError(500, 'Online payments are not set up yet (PAYMONGO_SECRET_KEY).')
  const res = await fetch(`${PAYMONGO_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${key}:`)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = payload?.errors?.[0]?.detail ?? `PayMongo error ${res.status}`
    console.error('PayMongo', method, path, res.status, JSON.stringify(payload))
    throw new HttpError(502, `PayMongo: ${detail}`)
  }
  return payload.data
}

function methods(): string[] {
  return (Deno.env.get('PAYMONGO_METHODS') ?? 'qrph,gcash,paymaya,card')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { action, invoiceId, returnPath } = await req.json()
    if (typeof invoiceId !== 'string') throw new HttpError(400, 'Missing invoice.')

    const url = Deno.env.get('SUPABASE_URL')!
    // As the signed-in user: row-level security decides whether they may
    // see (and so pay) this invoice — only that business's billing account.
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    })
    const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })

    const { data: invoice, error } = await asUser
      .from('invoices')
      .select('id, number, amount_centavos, status, paymongo_checkout_id')
      .eq('id', invoiceId)
      .maybeSingle()
    if (error) throw new HttpError(400, error.message)
    if (!invoice) throw new HttpError(404, 'Invoice not found.')

    if (action === 'create') {
      if (invoice.status !== 'open' && invoice.status !== 'overdue') {
        throw new HttpError(400, "This invoice doesn't need paying.")
      }
      const origin = req.headers.get('Origin')
      if (!origin || typeof returnPath !== 'string' || !returnPath.startsWith('/')) {
        throw new HttpError(400, 'Missing return address.')
      }
      if (invoice.paymongo_checkout_id) {
        // A lookup failure (e.g. an old test-mode session) just means: start a new one.
        const previous = await paymongo(
          'GET',
          `/checkout_sessions/${invoice.paymongo_checkout_id}`,
        ).catch(() => null)
        const paid = previous && paidPayment(previous)
        if (previous && paid) {
          const { error: recordError } = await server.rpc('record_invoice_online_payment', {
            p_invoice_id: invoice.id,
            p_checkout_id: previous.id,
            p_payment_id: paid.id,
            p_amount_centavos: paid.attributes.amount,
          })
          if (recordError) throw new HttpError(500, recordError.message)
          return json({ checkoutUrl: null })
        }
        if (previous?.attributes.status === 'active') {
          return json({ checkoutUrl: previous.attributes.checkout_url })
        }
      }
      const back = (param: string) => {
        const u = new URL(returnPath, origin)
        u.searchParams.set(param, invoice.id)
        return u.toString()
      }
      const session = await paymongo('POST', '/checkout_sessions', {
        data: {
          attributes: {
            line_items: [
              {
                name: `CourtDesk subscription · ${invoice.number}`,
                amount: invoice.amount_centavos,
                currency: 'PHP',
                quantity: 1,
              },
            ],
            payment_method_types: methods(),
            description: `CourtDesk invoice ${invoice.number}`,
            reference_number: invoice.number,
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            success_url: back('paid'),
            cancel_url: back('cancelled'),
            metadata: { invoice_id: invoice.id },
          },
        },
      })
      // Through a server-only function: the service role has no direct table access.
      const { error: saveError } = await server.rpc('set_invoice_checkout', {
        p_invoice_id: invoice.id,
        p_checkout_id: session.id,
      })
      if (saveError) throw new HttpError(500, saveError.message)
      return json({ checkoutUrl: session.attributes.checkout_url })
    }

    if (action === 'sync') {
      if (invoice.status === 'paid') return json({ status: 'paid' })
      if (!invoice.paymongo_checkout_id) return json({ status: 'unpaid' })
      const session = await paymongo('GET', `/checkout_sessions/${invoice.paymongo_checkout_id}`)
      const payment = paidPayment(session)
      if (!payment) {
        // Not paid: tell the app if the last attempt failed or expired.
        const reason = lastFailure(session)
        return json(reason ? { status: 'failed', reason } : { status: 'pending' })
      }
      const { error: recordError } = await server.rpc('record_invoice_online_payment', {
        p_invoice_id: invoice.id,
        p_checkout_id: session.id,
        p_payment_id: payment.id,
        p_amount_centavos: payment.attributes.amount,
      })
      if (recordError) throw new HttpError(500, recordError.message)
      return json({ status: 'paid' })
    }

    throw new HttpError(400, 'Unknown action.')
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    const message = e instanceof Error ? e.message : 'Something went wrong.'
    if (status >= 500) console.error(e)
    return json({ error: message }, status)
  }
})
