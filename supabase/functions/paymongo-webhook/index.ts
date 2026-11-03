// Supabase Edge Function: paymongo-webhook (Deno).
//
// PayMongo calls this when a checkout session is paid
// (event "checkout_session.payment.paid"). It checks PayMongo's signature,
// then marks the invoice in the session's metadata as paid.
//
// Deploy with "Verify JWT" turned OFF (PayMongo doesn't send a Supabase token;
// the signature check below is what keeps it safe).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   PAYMONGO_WEBHOOK_SECRET  whsk_… shown when you create the webhook in PayMongo.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2'

/** Max age of a signed event, against replays. */
const TOLERANCE_SECONDS = 5 * 60

/** The parts of a PayMongo webhook event this function reads. */
interface PayMongoEvent {
  data?: {
    attributes?: {
      type?: string
      livemode?: boolean
      data?: {
        id: string
        attributes?: {
          metadata?: { invoice_id?: string }
          payments?: { id: string; attributes?: { status?: string; amount?: number } }[]
        }
      }
    }
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * PayMongo-Signature: "t=<unix time>,te=<test signature>,li=<live signature>".
 * Signature = HMAC-SHA256(webhook secret, "<t>.<raw body>") in hex.
 */
async function verify(header: string, raw: string, livemode: boolean): Promise<boolean> {
  const secret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET')
  if (!secret) {
    console.error('PAYMONGO_WEBHOOK_SECRET is not set')
    return false
  }
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=')
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
    }),
  )
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false
  const given = livemode ? parts.li : parts.te
  if (!given) return false
  return safeEqual(await hmacHex(secret, `${parts.t}.${raw}`), given)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const raw = await req.text()

  let event: PayMongoEvent
  try {
    event = JSON.parse(raw)
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  const attributes = event?.data?.attributes ?? {}
  console.log('PayMongo event received:', attributes.type, attributes.livemode ? 'live' : 'test')
  const ok = await verify(req.headers.get('Paymongo-Signature') ?? '', raw, !!attributes.livemode)
  if (!ok) {
    console.error('Rejected: signature check failed (check PAYMONGO_WEBHOOK_SECRET)')
    return new Response('Invalid signature', { status: 401 })
  }

  // Acknowledge other event types so PayMongo doesn't retry them.
  if (attributes.type !== 'checkout_session.payment.paid') return new Response('ignored')

  const session = attributes.data
  const invoiceId = session?.attributes?.metadata?.invoice_id
  const payment = (session?.attributes?.payments ?? []).find((p) => p.attributes?.status === 'paid')
  if (!invoiceId || !payment) {
    console.error('Paid checkout without invoice_id or payment', session?.id)
    return new Response('ignored')
  }

  const server = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const { error } = await server.rpc('record_invoice_online_payment', {
    p_invoice_id: invoiceId,
    p_checkout_id: session?.id,
    p_payment_id: payment.id,
    p_amount_centavos: payment.attributes?.amount,
  })
  if (error) {
    // A non-2xx makes PayMongo retry later; the error shows in the function logs.
    console.error('record_invoice_online_payment failed', invoiceId, error.message)
    return new Response('Could not record payment', { status: 500 })
  }
  console.log('Recorded payment', payment.id, 'for invoice', invoiceId)
  return new Response('ok')
})
