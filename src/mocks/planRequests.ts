import type { PlanRequest } from '@/types/billing'

/** Kitchen Line is at its 4-court Starter limit and has asked for Growth. */
export const planRequestSeed: PlanRequest[] = [
  {
    id: 'prq_kitchen_1',
    tenantId: 'tn_kitchen',
    tenantName: 'Kitchen Line Club',
    fromPlanId: 'starter',
    fromBillingCycle: 'monthly',
    planId: 'growth',
    billingCycle: 'monthly',
    note: 'We are adding a 5th court next month. Can pay via GCash.',
    status: 'pending',
    decisionNote: '',
    createdAt: new Date(Date.now() - 20 * 3_600_000).toISOString(),
    decidedAt: null,
  },
]
