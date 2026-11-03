import { check, storageError, supabase, unwrap, unwrapMaybe } from '@/lib/supabase/client'
import type {
  BillingCycle,
  Invoice,
  Plan,
  PlanId,
  PlanRequest,
  Subscription,
} from '@/types/billing'
import { usageLabels, type UsageItem, type UsageKey } from '@/utils/usage'

import {
  assertProofFile,
  type BillingRunResult,
  type CheckoutStart,
  type CheckoutSync,
  type InvoiceFilters,
  type PlanRequestFilters,
} from '../mock/subscriptionService'
import { toInvoice, toPlan, toPlanRequest, toSubscription } from './mappers'

export async function listPlans(): Promise<Plan[]> {
  return unwrap(await supabase().from('plans').select('*').order('sort_order')).map(toPlan)
}

export async function updatePlan(id: PlanId, patch: Partial<Omit<Plan, 'id'>>): Promise<Plan> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.description !== undefined) row.description = patch.description
  if (patch.monthlyPrice !== undefined) row.monthly_price_centavos = patch.monthlyPrice
  if (patch.annualPrice !== undefined) row.annual_price_centavos = patch.annualPrice
  if (patch.features !== undefined) row.features = patch.features
  if (patch.highlighted !== undefined) row.highlighted = patch.highlighted
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic
  if (patch.comingSoon !== undefined) row.coming_soon = patch.comingSoon
  if (patch.limits) {
    row.limit_locations = patch.limits.locations
    row.limit_courts = patch.limits.courts
    row.limit_bookings_per_month = patch.limits.bookingsPerMonth
  }
  return toPlan(
    unwrap(await supabase().from('plans').update(row).eq('id', id).select('*').single()),
  )
}

export async function listSubscriptions(): Promise<Subscription[]> {
  return unwrap(await supabase().from('subscriptions').select('*')).map(toSubscription)
}

export async function getSubscription(tenantId: string): Promise<Subscription> {
  const row = unwrapMaybe(
    await supabase().from('subscriptions').select('*').eq('tenant_id', tenantId).maybeSingle(),
  )
  if (!row) throw new Error('No subscription for this business')
  return toSubscription(row)
}

export async function changePlan(
  tenantId: string,
  planId: PlanId,
  billingCycle: BillingCycle,
): Promise<Subscription> {
  check(
    await supabase().rpc('change_plan', {
      p_tenant_id: tenantId,
      p_plan_id: planId,
      p_billing_cycle: billingCycle,
    }),
  )
  return getSubscription(tenantId)
}

export async function listPlanRequests(filters: PlanRequestFilters = {}): Promise<PlanRequest[]> {
  let query = supabase()
    .from('plan_requests')
    .select('*, tenants(name)')
    .order('created_at', { ascending: false })
  if (filters.tenantId) query = query.eq('tenant_id', filters.tenantId)
  if (filters.status) query = query.eq('status', filters.status)
  return unwrap(await query).map(toPlanRequest)
}

export async function requestPlanChange(
  tenantId: string,
  planId: PlanId,
  billingCycle: BillingCycle,
  note = '',
): Promise<PlanRequest> {
  const id = unwrap(
    await supabase().rpc('request_plan_change', {
      p_tenant_id: tenantId,
      p_plan_id: planId,
      p_billing_cycle: billingCycle,
      p_note: note,
    }),
  ) as string
  return toPlanRequest(
    unwrap(await supabase().from('plan_requests').select('*, tenants(name)').eq('id', id).single()),
  )
}

export async function cancelPlanRequest(id: string): Promise<void> {
  check(await supabase().rpc('cancel_plan_request', { p_request_id: id }))
}

export async function decidePlanRequest(id: string, approve: boolean, note = ''): Promise<void> {
  check(
    await supabase().rpc('decide_plan_request', {
      p_request_id: id,
      p_approve: approve,
      p_note: note,
    }),
  )
}

export async function setCancelAtPeriodEnd(
  tenantId: string,
  cancel: boolean,
): Promise<Subscription> {
  check(
    await supabase().rpc('set_cancel_at_period_end', { p_tenant_id: tenantId, p_cancel: cancel }),
  )
  return getSubscription(tenantId)
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<Invoice[]> {
  let query = supabase().from('invoices').select('*').order('issued_at', { ascending: false })
  if (filters.tenantId) query = query.eq('tenant_id', filters.tenantId)
  if (filters.status) query = query.eq('status', filters.status)
  return unwrap(await query).map(toInvoice)
}

export async function markInvoicePaid(id: string): Promise<Invoice> {
  check(await supabase().rpc('mark_invoice_paid', { p_invoice_id: id }))
  return toInvoice(unwrap(await supabase().from('invoices').select('*').eq('id', id).single()))
}

// --- Manual invoice payments ---------------------------------------------------

const INVOICE_PROOF_BUCKET = 'invoice-proofs'

/**
 * Uploads proof into the private invoice-proofs bucket under
 * "<tenant>/<invoice>/<random>" and returns its path. The database only
 * accepts it for that business's unpaid invoice (max 5 files).
 */
export async function uploadInvoiceProof(invoice: Invoice, file: File): Promise<string> {
  assertProofFile(file)
  const ext =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : 'jpg'
  const path = `${invoice.tenantId}/${invoice.id}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase()
    .storage.from(INVOICE_PROOF_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw storageError(error.message, 'Invoice payment uploads')
  return path
}

export async function submitInvoicePayment(
  id: string,
  method: NonNullable<Invoice['paymentMethod']>,
  proofPath: string,
  transactionReference = '',
): Promise<Invoice> {
  check(
    await supabase().rpc('submit_invoice_payment', {
      p_invoice_id: id,
      p_method: method,
      p_proof_path: proofPath,
      p_transaction_reference: transactionReference,
    }),
  )
  return toInvoice(unwrap(await supabase().from('invoices').select('*').eq('id', id).single()))
}

export async function reviewInvoicePayment(id: string, approve: boolean, note = ''): Promise<void> {
  check(
    await supabase().rpc('review_invoice_payment', {
      p_invoice_id: id,
      p_approve: approve,
      p_note: note,
    }),
  )
}

/** A short-lived link (10 minutes) to view a proof. */
export async function getInvoiceProofUrl(proofPath: string): Promise<string> {
  const { data, error } = await supabase()
    .storage.from(INVOICE_PROOF_BUCKET)
    .createSignedUrl(proofPath, 600)
  if (error || !data) throw new Error('Could not open the proof. Try again.')
  return data.signedUrl
}

export function toUsage(
  items: { key: UsageKey; used: number; limit: number | null }[],
): UsageItem[] {
  return items.map((u) => ({ key: u.key, label: usageLabels[u.key], used: u.used, limit: u.limit }))
}

export async function getUsage(tenantId: string): Promise<UsageItem[]> {
  return toUsage(unwrap(await supabase().rpc('tenant_usage', { p_tenant_id: tenantId })))
}

// --- Online payment (PayMongo checkout, via the invoice-checkout Edge Function) ---

/** Calls invoice-checkout and surfaces its { error } message when it fails. */
async function invoiceCheckout<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke('invoice-checkout', { body })
  if (error) {
    let message = 'Online payment is not available right now. Try again, or upload proof instead.'
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      const payload = await context.json().catch(() => null)
      if (payload?.error) message = payload.error
      else if (context.status === 404) {
        message =
          'Online payment is not set up yet (the invoice-checkout function is not deployed).'
      }
    } else if (error.name === 'FunctionsFetchError') {
      // No response at all: usually the function isn't deployed yet (or the network is down).
      message =
        'Could not reach online payments. If this keeps happening, the invoice-checkout function may not be deployed yet.'
    }
    throw new Error(message)
  }
  return data as T
}

/** Creates a PayMongo checkout for the invoice; the caller redirects to it. */
export async function startInvoiceCheckout(
  invoice: Invoice,
  returnPath: string,
): Promise<CheckoutStart> {
  return invoiceCheckout<CheckoutStart>({ action: 'create', invoiceId: invoice.id, returnPath })
}

/** After returning from checkout: asks PayMongo and records the payment if it went through. */
export async function syncInvoiceCheckout(id: string): Promise<CheckoutSync> {
  return invoiceCheckout<CheckoutSync>({ action: 'sync', invoiceId: id })
}

/** Platform admin: run the daily billing job now (same as the scheduled run). */
export async function runBillingCycle(): Promise<BillingRunResult> {
  return unwrap(await supabase().rpc('run_billing_cycle')) as BillingRunResult
}
