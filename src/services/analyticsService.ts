import { usingSupabase } from '@/config/env'

import * as mock from './mock/analyticsService'
import * as remote from './supabase/analyticsService'

export type {
  AnalyticsRange,
  Breakdown,
  CollectedTotals,
  DailyPoint,
  PlatformOverview,
  TenantAnalytics,
  TenantKpis,
  TenantOverviewRow,
} from './mock/analyticsService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<
  typeof mock,
  'getTenantAnalytics' | 'getPlatformOverview' | 'listPlatformActivity' | 'getCollected'
>
const api: Api = usingSupabase ? remote : mock

export const getTenantAnalytics = api.getTenantAnalytics
/** Money received today / this month (by the day it was paid, not played). */
export const getCollected = api.getCollected
export const getPlatformOverview = api.getPlatformOverview
export const listPlatformActivity = api.listPlatformActivity

export { methodLabels, monthlyValue } from './mock/analyticsService'
