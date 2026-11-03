import { check, fetchAll, supabase, unwrap, storageError } from '@/lib/supabase/client'
import type { Payment } from '@/types/booking'

import { assertProofFile, type PaymentFilters, type PaymentRow } from '../mock/paymentService'
import { toPayment, toPaymentRow } from './mappers'

const safe = (value: string) => value.replace(/[,()*%\\]/g, ' ').trim()

export async function listPayments(
  tenantId: string,
  f: PaymentFilters = {},
): Promise<PaymentRow[]> {
  const rows = await fetchAll((from, to) => {
    let query = supabase().from('payment_rows').select('*').eq('tenant_id', tenantId)
    // createdAt filters compare calendar days, like the mock version.
    if (f.from) query = query.gte('created_at', `${f.from}T00:00:00+08:00`)
    if (f.to) query = query.lte('created_at', `${f.to}T23:59:59+08:00`)
    if (f.status) query = query.eq('status', f.status)
    if (f.method) query = query.eq('method', f.method)
    if (f.locationId) query = query.eq('location_id', f.locationId)
    const search = safe(f.search ?? '')
    if (search) {
      query = query.or(
        `reference.ilike.*${search}*,booking_reference.ilike.*${search}*,customer_name.ilike.*${search}*`,
      )
    }
    return query.order('created_at', { ascending: false }).range(from, to)
  })
  return rows.map(toPaymentRow)
}

export async function countPendingPayments(tenantId: string): Promise<number> {
  const { count, error } = await supabase()
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
  // Roles without the payments permission simply see no badge.
  return error ? 0 : (count ?? 0)
}

async function getPayment(id: string): Promise<Payment> {
  return toPayment(unwrap(await supabase().from('payments').select('*').eq('id', id).single()))
}

export async function approvePayment(id: string): Promise<Payment> {
  check(await supabase().rpc('review_payment', { p_payment_id: id, p_approve: true }))
  return getPayment(id)
}

export async function rejectPayment(id: string): Promise<Payment> {
  check(await supabase().rpc('review_payment', { p_payment_id: id, p_approve: false }))
  return getPayment(id)
}

export async function refundPayment(id: string): Promise<Payment> {
  check(await supabase().rpc('refund_payment', { p_payment_id: id }))
  return getPayment(id)
}

// --- Proof of payment ---------------------------------------------------------

const PROOF_BUCKET = 'payment-proofs'

/**
 * Uploads the screenshot into the private payment-proofs bucket under
 * "<tenant>/<booking reference>/<random>", and returns its path. The
 * database only accepts it for a booking made in the last 2 hours that
 * isn't paid yet (max 3 files). Customers can never read anything back.
 */
export async function uploadPaymentProof(
  tenantId: string,
  reference: string,
  file: File,
): Promise<string> {
  assertProofFile(file)
  const ext =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : 'jpg'
  const path = `${tenantId}/${reference}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase()
    .storage.from(PROOF_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw storageError(error.message, 'Payment uploads')
  return path
}

export async function attachPaymentProof(
  tenantId: string,
  reference: string,
  phone: string,
  proofPath: string,
  transactionReference = '',
): Promise<number> {
  return unwrap(
    await supabase().rpc('attach_payment_proof', {
      p_tenant_id: tenantId,
      p_reference: reference,
      p_phone: phone,
      p_proof_path: proofPath,
      p_transaction_reference: transactionReference,
    }),
  ) as number
}

/** A short-lived link (10 minutes) for staff to view a proof. */
export async function getProofUrl(proofPath: string): Promise<string> {
  const { data, error } = await supabase()
    .storage.from(PROOF_BUCKET)
    .createSignedUrl(proofPath, 600)
  if (error || !data) throw new Error('Could not open the proof. Try again.')
  return data.signedUrl
}
