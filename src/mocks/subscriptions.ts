import type {
  BillingCycle,
  Invoice,
  PlanId,
  Subscription,
  SubscriptionStatus,
} from '@/types/billing'
import { addDays, addMonths, todayISO } from '@/utils/dates'

import { planSeed } from './plans'

const today = todayISO()

interface SubscriptionSpec {
  tenantId: string
  planId: PlanId
  status: SubscriptionStatus
  billingCycle: BillingCycle
  startedAt: string
  /** Days into the current period. */
  periodOffset: number
}

const specs: SubscriptionSpec[] = [
  {
    tenantId: 'tn_rally',
    planId: 'growth',
    status: 'active',
    billingCycle: 'monthly',
    startedAt: '2025-03-14',
    periodOffset: 12,
  },
  {
    tenantId: 'tn_dink',
    planId: 'growth',
    status: 'active',
    billingCycle: 'annual',
    startedAt: '2025-06-02',
    periodOffset: 150,
  },
  {
    tenantId: 'tn_kitchen',
    planId: 'starter',
    status: 'active',
    billingCycle: 'monthly',
    startedAt: '2025-09-21',
    periodOffset: 20,
  },
  {
    tenantId: 'tn_baseline',
    planId: 'pro',
    status: 'trialing',
    billingCycle: 'monthly',
    startedAt: addDays(today, -9),
    periodOffset: 9,
  },
  {
    tenantId: 'tn_paddle',
    planId: 'pro',
    status: 'active',
    billingCycle: 'annual',
    startedAt: '2024-11-05',
    periodOffset: 362,
  },
  {
    tenantId: 'tn_thirdshot',
    planId: 'starter',
    status: 'past_due',
    billingCycle: 'monthly',
    startedAt: '2025-04-18',
    periodOffset: 34,
  },
  {
    tenantId: 'tn_coast',
    planId: 'starter',
    status: 'cancelled',
    billingCycle: 'monthly',
    startedAt: '2025-01-30',
    periodOffset: 61,
  },
]

export const subscriptionSeed: Subscription[] = specs.map((spec, index) => {
  const currentPeriodStart = addDays(today, -spec.periodOffset)
  const currentPeriodEnd =
    spec.billingCycle === 'annual'
      ? addMonths(currentPeriodStart, 12)
      : spec.status === 'trialing'
        ? addDays(currentPeriodStart, 14)
        : addMonths(currentPeriodStart, 1)
  return {
    id: `sub_${String(index + 1).padStart(3, '0')}`,
    tenantId: spec.tenantId,
    planId: spec.planId,
    status: spec.status,
    billingCycle: spec.billingCycle,
    startedAt: spec.startedAt,
    currentPeriodStart,
    currentPeriodEnd,
    trialEndsAt: spec.status === 'trialing' ? addDays(spec.startedAt, 14) : null,
    cancelAtPeriodEnd: spec.status === 'cancelled',
  }
})

/** Up to 12 past invoices per subscription, newest first. */
function buildInvoices(): Invoice[] {
  const invoices: Invoice[] = []
  let counter = 1040
  for (const sub of subscriptionSeed) {
    if (sub.status === 'trialing') continue
    const plan = planSeed.find((p) => p.id === sub.planId)!
    const step = sub.billingCycle === 'annual' ? 12 : 1
    const count = sub.billingCycle === 'annual' ? 2 : 12
    for (let i = 0; i < count; i++) {
      const issuedAt = addMonths(sub.currentPeriodStart, -i * step)
      if (issuedAt < sub.startedAt) break
      const isLatest = i === 0
      let status: Invoice['status'] = 'paid'
      if (isLatest && sub.status === 'past_due') status = 'overdue'
      if (sub.status === 'cancelled' && i < 2) status = i === 0 ? 'void' : 'overdue'
      invoices.push({
        id: `inv_${counter}`,
        number: `SL-${counter++}`,
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        planId: sub.planId,
        amount: sub.billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice,
        status,
        issuedAt,
        dueAt: addDays(issuedAt, 7),
        paidAt: status === 'paid' ? addDays(issuedAt, 1 + (counter % 4)) : null,
        paymentMethod: null,
        proofPath: null,
        transactionReference: '',
        proofSubmittedAt: null,
        reviewNote: '',
        paidOnline: false,
        periodStart: null,
      })
    }
  }
  return invoices.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
}

export const invoiceSeed: Invoice[] = buildInvoices()
