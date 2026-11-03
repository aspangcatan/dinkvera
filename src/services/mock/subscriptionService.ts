import type { Tenant } from '@/types/tenant'
import type {
  BillingCycle,
  Invoice,
  Plan,
  PlanId,
  PlanRequest,
  PlanRequestStatus,
  Subscription,
} from '@/types/billing'
import { addDays, addMonths, monthKey, todayISO } from '@/utils/dates'
import { newId } from '@/utils/ids'
import type { UsageItem } from '@/utils/usage'
import { usageLabels } from '@/utils/usage'

import { db, findOrThrow, respond, ServiceError } from './mockDb'

export async function listPlans(): Promise<Plan[]> {
  return respond(db.plans)
}

export async function updatePlan(id: PlanId, patch: Partial<Omit<Plan, 'id'>>): Promise<Plan> {
  const plan = findOrThrow(db.plans, id, 'Plan')
  Object.assign(plan, patch)
  return respond(plan)
}

export async function listSubscriptions(): Promise<Subscription[]> {
  return respond(db.subscriptions)
}

export async function getSubscription(tenantId: string): Promise<Subscription> {
  const sub = db.subscriptions.find((s) => s.tenantId === tenantId)
  if (!sub) throw new ServiceError('No subscription for this business', 'not_found')
  return respond(sub)
}

export async function changePlan(
  tenantId: string,
  planId: PlanId,
  billingCycle: BillingCycle,
): Promise<Subscription> {
  const sub = db.subscriptions.find((s) => s.tenantId === tenantId)
  if (!sub) throw new ServiceError('No subscription for this business', 'not_found')
  const previous = db.plans.find((p) => p.id === sub.planId)!
  const next = findOrThrow(db.plans, planId, 'Plan')
  const today = todayISO()
  sub.planId = planId
  sub.billingCycle = billingCycle
  sub.cancelAtPeriodEnd = false
  if (sub.status !== 'trialing') {
    sub.status = 'active'
    sub.currentPeriodStart = today
    sub.currentPeriodEnd = addMonths(today, billingCycle === 'annual' ? 12 : 1)
  }
  db.activity.unshift({
    id: newId('act'),
    kind: next.monthlyPrice >= previous.monthlyPrice ? 'upgrade' : 'downgrade',
    tenantId,
    message: `Changed plan from ${previous.name} to ${next.name} (${billingCycle})`,
    at: new Date().toISOString(),
  })
  return respond(sub)
}

export interface PlanRequestFilters {
  tenantId?: string
  status?: PlanRequestStatus
}

/** Newest first. */
export async function listPlanRequests(filters: PlanRequestFilters = {}): Promise<PlanRequest[]> {
  return respond(
    db.planRequests
      .filter(
        (r) =>
          (!filters.tenantId || r.tenantId === filters.tenantId) &&
          (!filters.status || r.status === filters.status),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  )
}

/**
 * A business asks to switch plan. Nothing changes until a platform admin
 * approves (same checks as the database's request_plan_change).
 */
export async function requestPlanChange(
  tenantId: string,
  planId: PlanId,
  billingCycle: BillingCycle,
  note = '',
): Promise<PlanRequest> {
  const sub = db.subscriptions.find((s) => s.tenantId === tenantId)
  if (!sub) throw new ServiceError('No subscription for this business', 'not_found')
  const plan = findOrThrow(db.plans, planId, 'Plan')
  if (!plan.isPublic) {
    throw new ServiceError(`Contact Sideline to switch to the ${plan.name} plan.`, 'invalid')
  }
  if (plan.comingSoon && sub.planId !== planId) {
    throw new ServiceError(`The ${plan.name} plan is coming soon.`, 'invalid')
  }
  if (sub.planId === planId && sub.billingCycle === billingCycle && sub.status !== 'trialing') {
    throw new ServiceError("You're already on this plan.", 'invalid')
  }
  const blocked = computeUsage(tenantId, plan).find(
    (u) => u.key !== 'bookingsPerMonth' && u.limit !== null && u.used > u.limit,
  )
  if (blocked) {
    throw new ServiceError(
      `Can't switch: you're using ${blocked.used} ${blocked.label.toLowerCase()} and the ${plan.name} plan allows ${blocked.limit}.`,
      'invalid',
    )
  }
  if (db.planRequests.some((r) => r.tenantId === tenantId && r.status === 'pending')) {
    throw new ServiceError(
      'You already have a plan change request waiting. Cancel it first to send a new one.',
      'conflict',
    )
  }
  const request: PlanRequest = {
    id: newId('prq'),
    tenantId,
    tenantName: db.tenants.find((t) => t.id === tenantId)?.name ?? '',
    fromPlanId: sub.planId,
    fromBillingCycle: sub.billingCycle,
    planId,
    billingCycle,
    note: note.trim().slice(0, 500),
    status: 'pending',
    decisionNote: '',
    createdAt: new Date().toISOString(),
    decidedAt: null,
  }
  db.planRequests.push(request)
  db.activity.unshift({
    id: newId('act'),
    kind: 'support',
    tenantId,
    message: `Requested a plan change to ${plan.name} (${billingCycle})`,
    at: request.createdAt,
  })
  return respond(request)
}

function pendingRequest(id: string): PlanRequest {
  const request = findOrThrow(db.planRequests, id, 'Request')
  if (request.status !== 'pending') {
    throw new ServiceError('This request was already handled.', 'invalid')
  }
  return request
}

export async function cancelPlanRequest(id: string): Promise<void> {
  const request = pendingRequest(id)
  request.status = 'cancelled'
  request.decidedAt = new Date().toISOString()
  await respond(null)
}

/** Platform admin: approve (switches the plan now) or decline with a reason. */
export async function decidePlanRequest(id: string, approve: boolean, note = ''): Promise<void> {
  const request = pendingRequest(id)
  if (approve) {
    const sub = await changePlan(request.tenantId, request.planId, request.billingCycle)
    // Bill the new plan now, unless still in trial (billed when the trial ends).
    if (sub.status !== 'trialing') {
      const row = db.subscriptions.find((x) => x.id === sub.id)!
      for (const inv of db.invoices) {
        if (
          inv.subscriptionId === row.id &&
          inv.periodStart === row.currentPeriodStart &&
          inv.status === 'open' &&
          !inv.proofSubmittedAt &&
          !inv.paidOnline
        ) {
          inv.status = 'void'
        }
      }
      issueInvoice(row, row.currentPeriodStart)
    }
  }
  request.status = approve ? 'approved' : 'declined'
  request.decisionNote = note.trim().slice(0, 500)
  request.decidedAt = new Date().toISOString()
  await respond(null)
}

export async function setCancelAtPeriodEnd(
  tenantId: string,
  cancel: boolean,
): Promise<Subscription> {
  const sub = db.subscriptions.find((s) => s.tenantId === tenantId)
  if (!sub) throw new ServiceError('No subscription for this business', 'not_found')
  sub.cancelAtPeriodEnd = cancel
  return respond(sub)
}

export interface InvoiceFilters {
  tenantId?: string
  status?: Invoice['status'] | ''
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<Invoice[]> {
  return respond(
    db.invoices.filter(
      (i) =>
        (!filters.tenantId || i.tenantId === filters.tenantId) &&
        (!filters.status || i.status === filters.status),
    ),
  )
}

/** Platform admin: the invoice was paid (e.g. after checking a proof, or cash). */
export async function markInvoicePaid(id: string): Promise<Invoice> {
  const invoice = findOrThrow(db.invoices, id, 'Invoice')
  if (invoice.status === 'void') throw new ServiceError('This invoice was voided.', 'invalid')
  invoice.status = 'paid'
  invoice.paidAt = todayISO()
  invoice.proofSubmittedAt = null
  invoice.reviewNote = ''
  const sub = db.subscriptions.find((s) => s.id === invoice.subscriptionId)
  if (
    sub?.status === 'past_due' &&
    !db.invoices.some((i) => i.subscriptionId === sub.id && i.status === 'overdue')
  ) {
    sub.status = 'active'
    const tenant = db.tenants.find((t) => t.id === sub.tenantId)
    if (tenant?.status === 'past_due') tenant.status = 'active'
  }
  return respond(invoice)
}

/** Current usage against the plan's limits. */
export async function getUsage(tenantId: string): Promise<UsageItem[]> {
  const sub = db.subscriptions.find((s) => s.tenantId === tenantId)
  const plan = db.plans.find((p) => p.id === sub?.planId) ?? db.plans[0]!
  return respond(computeUsage(tenantId, plan), 60)
}

export function computeUsage(tenantId: string, plan: Plan): UsageItem[] {
  const thisMonth = monthKey(todayISO())
  const used = {
    locations: db.locations.filter((l) => l.tenantId === tenantId).length,
    courts: db.courts.filter((c) => c.tenantId === tenantId).length,
    bookingsPerMonth: db.bookings.filter(
      (b) => b.tenantId === tenantId && b.date.startsWith(thisMonth) && b.status !== 'cancelled',
    ).length,
  }
  return (Object.keys(used) as (keyof typeof used)[]).map((key) => ({
    key,
    label: usageLabels[key],
    used: used[key],
    limit: plan.limits[key],
  }))
}

/** Throws `limit_reached` when adding one more of `key` would exceed the plan. */
export function assertWithinLimit(tenantId: string, key: UsageItem['key']): void {
  const sub = db.subscriptions.find((s) => s.tenantId === tenantId)
  const plan = db.plans.find((p) => p.id === sub?.planId)
  if (!plan) return
  const item = computeUsage(tenantId, plan).find((u) => u.key === key)!
  if (item.limit !== null && item.used >= item.limit) {
    throw new ServiceError(
      `Your ${plan.name} plan includes ${item.limit} ${item.label.toLowerCase()}. Upgrade to add more.`,
      'limit_reached',
    )
  }
}

/** Proof of payment files: images or PDF up to 5 MB (same as the Storage bucket). */
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const PROOF_MAX_BYTES = 5 * 1024 * 1024

export function assertProofFile(file: File): void {
  if (!PROOF_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG, WebP or PDF file.')
  if (file.size > PROOF_MAX_BYTES) throw new Error('The file is over 5 MB. Try a smaller one.')
}

/** Mock upload: keeps the file in memory as a data URL, used as its path. */
export async function uploadInvoiceProof(invoice: Invoice, file: File): Promise<string> {
  assertProofFile(file)
  if (invoice.status !== 'open' && invoice.status !== 'overdue') {
    throw new ServiceError("This invoice doesn't need paying.", 'invalid')
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new ServiceError('Could not read the file.', 'invalid'))
    reader.readAsDataURL(file)
  })
}

/** The business sends proof; Sideline reviews it (same checks as submit_invoice_payment). */
export async function submitInvoicePayment(
  id: string,
  method: NonNullable<Invoice['paymentMethod']>,
  proofPath: string,
  transactionReference = '',
): Promise<Invoice> {
  const invoice = findOrThrow(db.invoices, id, 'Invoice')
  if (invoice.status !== 'open' && invoice.status !== 'overdue') {
    throw new ServiceError("This invoice doesn't need paying.", 'invalid')
  }
  if (!proofPath) throw new ServiceError('Upload your proof of payment first.', 'invalid')
  Object.assign(invoice, {
    paymentMethod: method,
    proofPath,
    transactionReference: transactionReference.trim().slice(0, 100),
    proofSubmittedAt: new Date().toISOString(),
    reviewNote: '',
  })
  db.activity.unshift({
    id: newId('act'),
    kind: 'payment',
    tenantId: invoice.tenantId,
    message: `Sent proof of payment for invoice ${invoice.number}`,
    at: invoice.proofSubmittedAt!,
  })
  return respond(invoice)
}

/** Platform admin: approve (invoice paid) or decline with a reason. */
export async function reviewInvoicePayment(id: string, approve: boolean, note = ''): Promise<void> {
  const invoice = findOrThrow(db.invoices, id, 'Invoice')
  if (!invoice.proofSubmittedAt || (invoice.status !== 'open' && invoice.status !== 'overdue')) {
    throw new ServiceError("There's no payment proof waiting on this invoice.", 'invalid')
  }
  if (approve) {
    await markInvoicePaid(id)
    return
  }
  if (!note.trim())
    throw new ServiceError('Tell the business why the proof was declined.', 'invalid')
  invoice.proofSubmittedAt = null
  invoice.reviewNote = note.trim().slice(0, 500)
  await respond(null)
}

/** A URL to view a proof (in mock mode the path is already a data URL). */
export async function getInvoiceProofUrl(proofPath: string): Promise<string> {
  return respond(proofPath, 40)
}

// --- Online payment (PayMongo checkout) ---------------------------------------

/** Where the checkout sends the business back to, and whether it's already settled. */
export interface CheckoutStart {
  /** PayMongo's hosted checkout page; null when already settled (mock mode). */
  checkoutUrl: string | null
}

/**
 * Mock mode can't reach PayMongo: the payment "succeeds" straight away,
 * so the online flow can still be clicked through with demo data.
 */
export async function startInvoiceCheckout(
  invoice: Invoice,
  _returnPath: string,
): Promise<CheckoutStart> {
  const row = findOrThrow(db.invoices, invoice.id, 'Invoice')
  if (row.status !== 'open' && row.status !== 'overdue') {
    throw new ServiceError("This invoice doesn't need paying.", 'invalid')
  }
  await markInvoicePaid(row.id)
  row.paidOnline = true
  return respond({ checkoutUrl: null }, 600)
}

/**
 * Result of checking a checkout with PayMongo. "failed": the latest attempt
 * failed or expired (`reason` is PayMongo's message); "pending": no result yet.
 */
export interface CheckoutSync {
  status: 'paid' | 'pending' | 'unpaid' | 'failed'
  reason?: string
}

/** After returning from checkout: has PayMongo confirmed the payment? */
export async function syncInvoiceCheckout(id: string): Promise<CheckoutSync> {
  const invoice = findOrThrow(db.invoices, id, 'Invoice')
  return respond({ status: invoice.status === 'paid' ? 'paid' : 'unpaid' })
}

// --- Automatic billing (same rules as run_billing_cycle) ---------------------

export interface BillingRunResult {
  invoicesIssued: number
  trialsEnded: number
  renewed: number
  cancelled: number
  overdue: number
}

/** The invoice for one billing period at the plan's price; false if it already exists. */
function issueInvoice(sub: Subscription, periodStart: string): boolean {
  const exists = db.invoices.some(
    (i) => i.subscriptionId === sub.id && i.periodStart === periodStart && i.status !== 'void',
  )
  const plan = db.plans.find((p) => p.id === sub.planId)
  const amount = plan ? (sub.billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice) : 0
  if (exists || amount <= 0) return false
  const next =
    Math.max(1039, ...db.invoices.map((i) => Number(i.number.replace(/D/g, '')) || 0)) + 1
  db.invoices.unshift({
    id: newId('inv'),
    number: `SL-${next}`,
    tenantId: sub.tenantId,
    subscriptionId: sub.id,
    planId: sub.planId,
    amount,
    status: 'open',
    issuedAt: todayISO(),
    dueAt: addDays(periodStart, db.platformSettings.graceDays),
    paidAt: null,
    paymentMethod: null,
    proofPath: null,
    transactionReference: '',
    proofSubmittedAt: null,
    reviewNote: '',
    paidOnline: false,
    periodStart,
  })
  return true
}

/**
 * Platform admin / daily job: ends trials, renews ended periods, marks
 * unpaid invoices overdue (and businesses past due). Safe to run twice.
 */
export async function runBillingCycle(): Promise<BillingRunResult> {
  const today = todayISO()
  const result: BillingRunResult = {
    invoicesIssued: 0,
    trialsEnded: 0,
    renewed: 0,
    cancelled: 0,
    overdue: 0,
  }
  const setTenant = (tenantId: string, from: string | null, to: Tenant['status']) => {
    const tenant = db.tenants.find((t) => t.id === tenantId)
    if (tenant && (from === null || tenant.status === from)) tenant.status = to
  }
  for (const sub of db.subscriptions) {
    const tenant = db.tenants.find((t) => t.id === sub.tenantId)
    if (!tenant || tenant.status === 'suspended') continue
    const months = sub.billingCycle === 'annual' ? 12 : 1

    if (sub.status === 'trialing' && sub.trialEndsAt && sub.trialEndsAt <= today) {
      result.trialsEnded++
      if (sub.cancelAtPeriodEnd) {
        sub.status = 'cancelled'
        setTenant(sub.tenantId, null, 'cancelled')
        result.cancelled++
        continue
      }
      sub.status = 'active'
      sub.currentPeriodStart = sub.trialEndsAt
      sub.currentPeriodEnd = addMonths(sub.trialEndsAt, months)
      setTenant(sub.tenantId, 'trialing', 'active')
      if (issueInvoice(sub, sub.currentPeriodStart)) result.invoicesIssued++
      continue
    }

    if ((sub.status === 'active' || sub.status === 'past_due') && sub.currentPeriodEnd <= today) {
      if (sub.cancelAtPeriodEnd) {
        sub.status = 'cancelled'
        setTenant(sub.tenantId, null, 'cancelled')
        result.cancelled++
        continue
      }
      while (sub.currentPeriodEnd <= today) {
        sub.currentPeriodStart = sub.currentPeriodEnd
        sub.currentPeriodEnd = addMonths(sub.currentPeriodEnd, months)
        if (issueInvoice(sub, sub.currentPeriodStart)) result.invoicesIssued++
      }
      result.renewed++
    }
  }

  for (const inv of db.invoices) {
    if (inv.status === 'open' && inv.dueAt < today) {
      inv.status = 'overdue'
      result.overdue++
    }
  }
  for (const sub of db.subscriptions) {
    if (
      sub.status === 'active' &&
      db.invoices.some((i) => i.subscriptionId === sub.id && i.status === 'overdue')
    ) {
      sub.status = 'past_due'
      setTenant(sub.tenantId, 'active', 'past_due')
    }
  }
  return respond(result, 400)
}
