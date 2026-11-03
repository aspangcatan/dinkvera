import { supabase, unwrap } from '@/lib/supabase/client'
import type { BookingSource } from '@/types/booking'
import type { PaymentMethod } from '@/types/tenant'
import { sourceLabels } from '@/utils/labels'
import type { UsageKey } from '@/utils/usage'

import type { PlatformActivity } from '@/mocks/analytics'
import type {
  AnalyticsRange,
  CollectedTotals,
  PlatformOverview,
  TenantAnalytics,
  TenantOverviewRow,
} from '../mock/analyticsService'
import { methodLabels } from '../mock/analyticsService'
import { TENANT_SELECT, toPlan, toSubscription, toTenant } from './mappers'
import { toUsage } from './subscriptionService'

export { methodLabels, monthlyValue } from '../mock/analyticsService'

type RawAnalytics = Omit<TenantAnalytics, 'bySource' | 'byMethod'> & {
  bySource: { key: BookingSource; value: number }[]
  byMethod: { key: PaymentMethod; value: number }[]
}

export async function getTenantAnalytics(
  tenantId: string,
  range: AnalyticsRange,
): Promise<TenantAnalytics> {
  const raw = unwrap(
    await supabase().rpc('tenant_analytics', {
      p_tenant_id: tenantId,
      p_from: range.from,
      p_to: range.to,
      p_location_id: range.locationId ?? null,
    }),
  ) as RawAnalytics
  return {
    ...raw,
    bySource: raw.bySource.map((s) => ({ ...s, label: sourceLabels[s.key] })),
    byMethod: raw.byMethod.map((m) => ({ ...m, label: methodLabels[m.key] })),
  }
}

type RawOverview = Omit<PlatformOverview, 'rows' | 'arr'> & {
  rows: (Omit<TenantOverviewRow, 'tenant' | 'subscription' | 'plan' | 'usage'> & {
    tenantId: string
    usage: { key: UsageKey; used: number; limit: number | null }[]
  })[]
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const [overview, tenants, subscriptions, plans] = await Promise.all([
    supabase().rpc('platform_overview'),
    supabase().from('tenants').select(TENANT_SELECT),
    supabase().from('subscriptions').select('*'),
    supabase().from('plans').select('*'),
  ])
  const raw = unwrap(overview) as RawOverview
  const tenantList = unwrap(tenants).map(toTenant)
  const subList = unwrap(subscriptions).map(toSubscription)
  const planList = unwrap(plans).map(toPlan)

  // jsonb_agg over zero tenants returns null, not [].
  const rows: TenantOverviewRow[] = (raw.rows ?? [])
    .map((r) => {
      const tenant = tenantList.find((t) => t.id === r.tenantId)
      if (!tenant) return null
      const subscription = subList.find((s) => s.tenantId === r.tenantId) ?? null
      return {
        tenant,
        subscription,
        plan: planList.find((p) => p.id === subscription?.planId) ?? null,
        mrr: r.mrr,
        locations: r.locations,
        courts: r.courts,
        bookings30d: r.bookings30d,
        gmv30d: r.gmv30d,
        usage: toUsage(r.usage),
      }
    })
    .filter((r): r is TenantOverviewRow => r !== null)

  return { ...raw, arr: raw.mrr * 12, rows }
}

export async function listPlatformActivity(tenantId?: string): Promise<PlatformActivity[]> {
  let query = supabase()
    .from('platform_activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  return unwrap(await query).map((r) => ({
    id: r.id,
    kind: r.kind,
    tenantId: r.tenant_id,
    message: r.message,
    at: r.created_at,
  }))
}

/** Money received (paid payments by the day they were paid), in centavos. */
export async function getCollected(tenantId: string): Promise<CollectedTotals> {
  return unwrap(
    await supabase().rpc('tenant_collected', { p_tenant_id: tenantId }),
  ) as CollectedTotals
}
