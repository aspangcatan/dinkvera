import { describe, expect, it } from 'vitest'

import { db } from '@/services/mock/mockDb'
import { runBillingCycle } from '@/services/subscriptionService'
import { addDays, addMonths, todayISO } from '@/utils/dates'

/** Demo-mode billing follows the same rules as run_billing_cycle(). */
describe('runBillingCycle (demo data)', () => {
  it('renews an ended period once, ends a trial with an invoice, marks overdue', async () => {
    const today = todayISO()
    const kitchen = db.subscriptions.find((s) => s.tenantId === 'tn_kitchen')!
    Object.assign(kitchen, {
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: addDays(today, -31),
      currentPeriodEnd: addDays(today, -1),
    })
    const baseline = db.subscriptions.find((s) => s.tenantId === 'tn_baseline')!
    Object.assign(baseline, { status: 'trialing', trialEndsAt: addDays(today, -1) })

    await runBillingCycle()
    await runBillingCycle()

    const renewal = db.invoices.filter(
      (i) => i.subscriptionId === kitchen.id && i.periodStart === addDays(today, -1),
    )
    expect(renewal).toHaveLength(1)
    expect(renewal[0]!.dueAt).toBe(addDays(today, 6))
    expect(kitchen.currentPeriodEnd).toBe(addMonths(addDays(today, -1), 1))

    expect(baseline.status).toBe('active')
    expect(db.tenants.find((t) => t.id === 'tn_baseline')!.status).toBe('active')
    expect(db.invoices.some((i) => i.subscriptionId === baseline.id && i.status === 'open')).toBe(
      true,
    )

    // Kitchen's renewal is due in 6 days; force it past due and run again.
    renewal[0]!.dueAt = addDays(today, -1)
    const result = await runBillingCycle()
    expect(result.overdue).toBeGreaterThanOrEqual(1)
    expect(kitchen.status).toBe('past_due')
    expect(db.tenants.find((t) => t.id === 'tn_kitchen')!.status).toBe('past_due')
  })
})
