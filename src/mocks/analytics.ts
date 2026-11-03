import { addMonths, monthKey, todayISO } from '@/utils/dates'
import { createRandom, hashString } from '@/utils/random'

import { tenantSeed } from './tenants'

/**
 * Analytics that can't be derived from bookings/subscriptions: traffic
 * and conversion (would come from page-view events), plus the platform
 * activity feed (would come from an audit log table). Revenue, occupancy
 * and MRR are computed from the other mock tables in the services.
 */
export interface MonthlyTraffic {
  /** YYYY-MM */
  month: string
  tenantId: string
  pageViews: number
  bookingStarts: number
  bookingsCompleted: number
}

function buildTraffic(): MonthlyTraffic[] {
  const rows: MonthlyTraffic[] = []
  const thisMonth = monthKey(todayISO())
  for (const tenant of tenantSeed) {
    const rand = createRandom(hashString(`traffic-${tenant.id}`))
    const scale = { tn_paddle: 3.2, tn_dink: 2.1, tn_rally: 2.4, tn_kitchen: 1.2 }[tenant.id] ?? 0.8
    for (let i = 11; i >= 0; i--) {
      const month = monthKey(addMonths(`${thisMonth}-01`, -i))
      if (month < tenant.createdAt.slice(0, 7)) continue
      const growth = 1 + (11 - i) * 0.06
      const pageViews = Math.round(rand.int(1800, 2600) * scale * growth)
      const bookingStarts = Math.round(pageViews * (0.16 + rand.next() * 0.05))
      rows.push({
        month,
        tenantId: tenant.id,
        pageViews,
        bookingStarts,
        bookingsCompleted: Math.round(bookingStarts * (0.58 + rand.next() * 0.12)),
      })
    }
  }
  return rows
}

export const trafficSeed: MonthlyTraffic[] = buildTraffic()

export type ActivityKind =
  'signup' | 'upgrade' | 'downgrade' | 'payment_failed' | 'payment' | 'suspended' | 'support'

export interface PlatformActivity {
  id: string
  kind: ActivityKind
  tenantId: string
  message: string
  at: string
}

const now = Date.now()
const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString()

export const platformActivitySeed: PlatformActivity[] = [
  {
    id: 'act_1',
    kind: 'payment',
    tenantId: 'tn_rally',
    message: 'Paid invoice for Growth (monthly)',
    at: ago(2),
  },
  {
    id: 'act_2',
    kind: 'signup',
    tenantId: 'tn_baseline',
    message: 'Started a 14-day Pro trial',
    at: ago(9 * 24),
  },
  {
    id: 'act_3',
    kind: 'payment_failed',
    tenantId: 'tn_thirdshot',
    message: 'Card payment failed — invoice overdue',
    at: ago(30),
  },
  {
    id: 'act_4',
    kind: 'support',
    tenantId: 'tn_dink',
    message: 'Asked about custom domain setup',
    at: ago(52),
  },
  {
    id: 'act_5',
    kind: 'upgrade',
    tenantId: 'tn_rally',
    message: 'Upgraded from Starter to Growth',
    at: ago(24 * 40),
  },
  {
    id: 'act_6',
    kind: 'suspended',
    tenantId: 'tn_coast',
    message: 'Suspended after 2 unpaid invoices',
    at: ago(24 * 38),
  },
  {
    id: 'act_7',
    kind: 'support',
    tenantId: 'tn_paddle',
    message: 'Pro annual renewal coming up — sent reminder',
    at: ago(24 * 3),
  },
  {
    id: 'act_8',
    kind: 'support',
    tenantId: 'tn_kitchen',
    message: 'Requested a 5th court (Starter limit reached)',
    at: ago(20),
  },
]
