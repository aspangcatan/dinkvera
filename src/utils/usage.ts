import type { PlanLimits } from '@/types/billing'

export type UsageKey = keyof PlanLimits

export interface UsageItem {
  key: UsageKey
  label: string
  used: number
  limit: number | null
}

export const usageLabels: Record<UsageKey, string> = {
  locations: 'Locations',
  courts: 'Courts',
  bookingsPerMonth: 'Bookings this month',
}

/** 0–1 share of the limit used; 0 for unlimited plans. */
export function usageRatio(item: Pick<UsageItem, 'used' | 'limit'>): number {
  if (item.limit === null || item.limit === 0) return 0
  return Math.min(1, item.used / item.limit)
}

export function isAtLimit(item: Pick<UsageItem, 'used' | 'limit'>): boolean {
  return item.limit !== null && item.used >= item.limit
}

export type UsageLevel = 'ok' | 'warning' | 'full'

export function usageLevel(item: Pick<UsageItem, 'used' | 'limit'>): UsageLevel {
  if (isAtLimit(item)) return 'full'
  return usageRatio(item) >= 0.8 ? 'warning' : 'ok'
}
