import type { BookingSource, Booking } from '@/types/booking'
import type { Plan, PlanId, Subscription } from '@/types/billing'
import type { PaymentMethod, Tenant } from '@/types/tenant'
import { addDays, addMonths, daysBetween, monthKey, startOfWeek, todayISO } from '@/utils/dates'

import { db, respond } from './mockDb'
import { computeUsage } from './subscriptionService'
import type { UsageItem } from '@/utils/usage'

/*
 * Aggregations over the mock tables. With Supabase these become SQL views
 * or RPC functions (`tenant_analytics(tenant_id, from, to)` etc.) — the
 * returned shapes stay the same.
 */

export interface DailyPoint {
  date: string
  revenue: number
  bookings: number
}

export interface Breakdown<K extends string = string> {
  key: K
  label: string
  value: number
}

export interface TenantKpis {
  revenue: number
  bookings: number
  bookedHours: number
  occupancy: number
  averageBookingValue: number
  cancellationRate: number
  noShowRate: number
  uniqueCustomers: number
}

export interface TenantAnalytics {
  current: TenantKpis
  previous: TenantKpis
  daily: DailyPoint[]
  byLocation: {
    locationId: string
    name: string
    revenue: number
    bookings: number
    occupancy: number
  }[]
  byCourt: {
    courtId: string
    name: string
    locationName: string
    occupancy: number
    revenue: number
  }[]
  byHour: { hour: number; bookings: number }[]
  bySource: Breakdown<BookingSource>[]
  byMethod: Breakdown<PaymentMethod>[]
  funnel: { pageViews: number; bookingStarts: number; bookingsCompleted: number }
}

export interface AnalyticsRange {
  from: string
  to: string
  locationId?: string
}

const sourceLabels: Record<BookingSource, string> = {
  online: 'Online',
  walk_in: 'Walk-in',
  phone: 'Phone',
}

export const methodLabels: Record<PaymentMethod, string> = {
  gcash: 'GCash',
  maya: 'Maya',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
}

/** Bookable court-hours in a range (active courts × opening hours × days). */
function availableHours(tenantId: string, from: string, to: string, locationId?: string): number {
  const days = daysBetween(from, to) + 1
  let hours = 0
  for (const court of db.courts) {
    if (court.tenantId !== tenantId || court.status !== 'active') continue
    if (locationId && court.locationId !== locationId) continue
    const loc = db.locations.find((l) => l.id === court.locationId)
    if (loc) hours += (loc.closeHour - loc.openHour) * days
  }
  return hours
}

function kpis(rows: Booking[], tenantId: string, range: AnalyticsRange): TenantKpis {
  const live = rows.filter((b) => b.status !== 'cancelled')
  const revenue = rows.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.amount, 0)
  const bookedHours = live.reduce((s, b) => s + b.durationHours, 0)
  const capacity = availableHours(tenantId, range.from, range.to, range.locationId)
  return {
    revenue,
    bookings: live.length,
    bookedHours,
    occupancy: capacity ? bookedHours / capacity : 0,
    averageBookingValue: live.length ? revenue / live.length : 0,
    cancellationRate: rows.length
      ? rows.filter((b) => b.status === 'cancelled').length / rows.length
      : 0,
    noShowRate: live.length ? live.filter((b) => b.status === 'no_show').length / live.length : 0,
    uniqueCustomers: new Set(live.map((b) => b.customerId)).size,
  }
}

function inRange(tenantId: string, range: AnalyticsRange): Booking[] {
  return db.bookings.filter(
    (b) =>
      b.tenantId === tenantId &&
      b.date >= range.from &&
      b.date <= range.to &&
      (!range.locationId || b.locationId === range.locationId),
  )
}

export async function getTenantAnalytics(
  tenantId: string,
  range: AnalyticsRange,
): Promise<TenantAnalytics> {
  const rows = inRange(tenantId, range)
  const span = daysBetween(range.from, range.to) + 1
  const prevRange = { ...range, from: addDays(range.from, -span), to: addDays(range.from, -1) }

  const daily: DailyPoint[] = []
  for (let i = 0; i < span; i++) {
    const date = addDays(range.from, i)
    const day = rows.filter((b) => b.date === date)
    daily.push({
      date,
      revenue: day.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.amount, 0),
      bookings: day.filter((b) => b.status !== 'cancelled').length,
    })
  }

  const locations = db.locations.filter(
    (l) => l.tenantId === tenantId && (!range.locationId || l.id === range.locationId),
  )
  const byLocation = locations.map((l) => {
    const r = rows.filter((b) => b.locationId === l.id)
    const k = kpis(r, tenantId, { ...range, locationId: l.id })
    return {
      locationId: l.id,
      name: l.name,
      revenue: k.revenue,
      bookings: k.bookings,
      occupancy: k.occupancy,
    }
  })

  const byCourt = db.courts
    .filter((c) => c.tenantId === tenantId && locations.some((l) => l.id === c.locationId))
    .map((c) => {
      const loc = locations.find((l) => l.id === c.locationId)!
      const r = rows.filter((b) => b.courtId === c.id && b.status !== 'cancelled')
      const capacity = c.status === 'active' ? (loc.closeHour - loc.openHour) * span : 0
      const hours = r.reduce((s, b) => s + b.durationHours, 0)
      return {
        courtId: c.id,
        name: c.name,
        locationName: loc.name,
        occupancy: capacity ? hours / capacity : 0,
        revenue: r.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.amount, 0),
      }
    })

  const hourCounts = new Map<number, number>()
  for (const b of rows) {
    if (b.status === 'cancelled') continue
    for (let h = b.startHour; h < b.startHour + b.durationHours; h++) {
      hourCounts.set(h % 24, (hourCounts.get(h % 24) ?? 0) + 1)
    }
  }
  const hours = [...hourCounts.keys()]
  const byHour = []
  if (hours.length) {
    for (let h = Math.min(...hours); h <= Math.max(...hours); h++) {
      byHour.push({ hour: h, bookings: hourCounts.get(h) ?? 0 })
    }
  }

  const bySource = (Object.keys(sourceLabels) as BookingSource[]).map((key) => ({
    key,
    label: sourceLabels[key],
    value: rows.filter((b) => b.source === key && b.status !== 'cancelled').length,
  }))

  const bookingIds = new Set(rows.map((b) => b.id))
  const paid = db.payments.filter((p) => p.status === 'paid' && bookingIds.has(p.bookingId))
  const byMethod = (Object.keys(methodLabels) as PaymentMethod[])
    .map((key) => ({
      key,
      label: methodLabels[key],
      value: paid.filter((p) => p.method === key).reduce((s, p) => s + p.amount, 0),
    }))
    .filter((m) => m.value > 0)

  const months = new Set([monthKey(range.from), monthKey(range.to)])
  const traffic = db.traffic.filter((t) => t.tenantId === tenantId && months.has(t.month))
  const funnel = {
    pageViews: traffic.reduce((s, t) => s + t.pageViews, 0),
    bookingStarts: traffic.reduce((s, t) => s + t.bookingStarts, 0),
    bookingsCompleted: traffic.reduce((s, t) => s + t.bookingsCompleted, 0),
  }

  return respond(
    {
      current: kpis(rows, tenantId, range),
      previous: kpis(inRange(tenantId, prevRange), tenantId, prevRange),
      daily,
      byLocation,
      byCourt,
      byHour,
      bySource,
      byMethod,
      funnel,
    },
    220,
  )
}

// --- Platform ---------------------------------------------------------------

export function monthlyValue(plan: Plan, sub: Pick<Subscription, 'billingCycle'>): number {
  return sub.billingCycle === 'annual' ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice
}

/** Subscriptions that bring in revenue (trials and cancellations don't). */
function isPaying(sub: Subscription): boolean {
  return sub.status === 'active' || sub.status === 'past_due'
}

export interface TenantOverviewRow {
  tenant: Tenant
  subscription: Subscription | null
  plan: Plan | null
  mrr: number
  locations: number
  courts: number
  bookings30d: number
  gmv30d: number
  usage: UsageItem[]
}

export interface PlatformOverview {
  mrr: number
  arr: number
  previousMrr: number
  tenants: { total: number; active: number; trialing: number; pastDue: number; suspended: number }
  gmv30d: number
  previousGmv30d: number
  bookings30d: number
  mrrSeries: { month: string; mrr: number }[]
  gmvSeries: { weekStart: string; gmv: number; bookings: number }[]
  planMix: { planId: PlanId; name: string; tenants: number; mrr: number }[]
  rows: TenantOverviewRow[]
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const today = todayISO()
  const from30 = addDays(today, -29)
  const from60 = addDays(today, -59)

  const rows: TenantOverviewRow[] = db.tenants.map((tenant) => {
    const subscription = db.subscriptions.find((s) => s.tenantId === tenant.id) ?? null
    const plan = db.plans.find((p) => p.id === subscription?.planId) ?? null
    const recent = db.bookings.filter(
      (b) => b.tenantId === tenant.id && b.date >= from30 && b.date <= today,
    )
    return {
      tenant,
      subscription,
      plan,
      mrr: subscription && plan && isPaying(subscription) ? monthlyValue(plan, subscription) : 0,
      locations: db.locations.filter((l) => l.tenantId === tenant.id).length,
      courts: db.courts.filter((c) => c.tenantId === tenant.id).length,
      bookings30d: recent.filter((b) => b.status !== 'cancelled').length,
      gmv30d: recent.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.amount, 0),
      usage: plan ? computeUsage(tenant.id, plan) : [],
    }
  })

  // MRR at the end of each of the last 12 months, from subscription start
  // dates (a cancelled subscription stops counting once its period lapsed).
  const thisMonth = monthKey(today)
  const mrrSeries: PlatformOverview['mrrSeries'] = []
  for (let i = 11; i >= 0; i--) {
    const month = monthKey(addMonths(`${thisMonth}-01`, -i))
    let mrr = 0
    for (const sub of db.subscriptions) {
      const plan = db.plans.find((p) => p.id === sub.planId)
      if (!plan || monthKey(sub.startedAt) > month) continue
      if (sub.status === 'trialing') continue
      if (sub.status === 'cancelled' && month >= monthKey(sub.currentPeriodStart)) continue
      mrr += monthlyValue(plan, sub)
    }
    mrrSeries.push({ month, mrr })
  }

  // Weekly booking volume for the last 10 weeks (Mon–Sun), current week last.
  const thisWeek = startOfWeek(today)
  const gmvSeries: PlatformOverview['gmvSeries'] = Array.from({ length: 10 }, (_, i) => ({
    weekStart: addDays(thisWeek, (i - 9) * 7),
    gmv: 0,
    bookings: 0,
  }))
  const firstWeek = gmvSeries[0]!.weekStart
  for (const b of db.bookings) {
    if (b.date > today || b.date < firstWeek) continue
    const week = gmvSeries[Math.floor(daysBetween(firstWeek, b.date) / 7)]!
    if (b.paymentStatus === 'paid') week.gmv += b.amount
    if (b.status !== 'cancelled') week.bookings++
  }

  const sumGmv = (from: string, to: string) =>
    db.bookings
      .filter((b) => b.date >= from && b.date <= to && b.paymentStatus === 'paid')
      .reduce((s, b) => s + b.amount, 0)

  const planMix = db.plans.map((plan) => {
    const subs = rows.filter((r) => r.plan?.id === plan.id)
    return {
      planId: plan.id,
      name: plan.name,
      tenants: subs.length,
      mrr: subs.reduce((s, r) => s + r.mrr, 0),
    }
  })

  const mrr = rows.reduce((s, r) => s + r.mrr, 0)
  return respond(
    {
      mrr,
      arr: mrr * 12,
      previousMrr: mrrSeries.at(-2)?.mrr ?? mrr,
      tenants: {
        total: db.tenants.length,
        active: db.tenants.filter((t) => t.status === 'active').length,
        trialing: db.tenants.filter((t) => t.status === 'trialing').length,
        pastDue: db.tenants.filter((t) => t.status === 'past_due').length,
        suspended: db.tenants.filter((t) => t.status === 'suspended' || t.status === 'cancelled')
          .length,
      },
      gmv30d: sumGmv(from30, today),
      previousGmv30d: sumGmv(from60, addDays(from30, -1)),
      bookings30d: rows.reduce((s, r) => s + r.bookings30d, 0),
      mrrSeries,
      gmvSeries,
      planMix,
      rows,
    },
    240,
  )
}

export async function listPlatformActivity(tenantId?: string) {
  return respond(db.activity.filter((a) => !tenantId || a.tenantId === tenantId))
}

/** Money received (paid payments by the day they were paid), in centavos. */
export interface CollectedTotals {
  today: number
  yesterday: number
  month: number
  /** Last month up to the same day of the month, for a fair comparison. */
  lastMonthToDate: number
}

export async function getCollected(tenantId: string): Promise<CollectedTotals> {
  const today = todayISO()
  const month = `${today.slice(0, 8)}01`
  const lastMonth = addMonths(month, -1)
  const lastMonthEnd = addDays(month, -1)
  const sameDayLastMonth = addDays(lastMonth, daysBetween(month, today))
  const totals: CollectedTotals = { today: 0, yesterday: 0, month: 0, lastMonthToDate: 0 }
  for (const p of db.payments) {
    if (p.tenantId !== tenantId || p.status !== 'paid' || !p.paidAt) continue
    // Manila calendar day the money came in.
    const day = new Date(p.paidAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    if (day === today) totals.today += p.amount
    if (day === addDays(today, -1)) totals.yesterday += p.amount
    if (day >= month && day <= today) totals.month += p.amount
    const cap = sameDayLastMonth < lastMonthEnd ? sameDayLastMonth : lastMonthEnd
    if (day >= lastMonth && day <= cap) totals.lastMonthToDate += p.amount
  }
  return respond(totals)
}
