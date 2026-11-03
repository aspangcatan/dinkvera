import { platformActivitySeed, trafficSeed } from '@/mocks/analytics'
import { bookingSeed } from '@/mocks/bookings'
import { courtSeed } from '@/mocks/courts'
import { customerSeed } from '@/mocks/customers'
import { locationSeed } from '@/mocks/locations'
import { paymentAccountSeed, platformPaymentAccountSeed } from '@/mocks/paymentAccounts'
import { paymentSeed } from '@/mocks/payments'
import { planSeed } from '@/mocks/plans'
import { platformSettingsSeed } from '@/mocks/platformSettings'
import { planRequestSeed } from '@/mocks/planRequests'
import { staffSeed } from '@/mocks/staff'
import { invoiceSeed, subscriptionSeed } from '@/mocks/subscriptions'
import { tenantSeed } from '@/mocks/tenants'
import { trialRequestSeed } from '@/mocks/trialRequests'

/**
 * In-memory stand-in for the Supabase database. Each array maps to a
 * future Postgres table of the same name; every tenant-owned row carries
 * `tenantId` (→ `tenant_id`, the RLS boundary).
 *
 * Only files in `src/services/` touch this. Views and components go
 * through the async service functions, so swapping this module for
 * `supabase.from('…')` queries later doesn't change any UI code. Changes
 * last until the page is reloaded.
 */
export const db = {
  tenants: structuredClone(tenantSeed),
  plans: structuredClone(planSeed),
  subscriptions: structuredClone(subscriptionSeed),
  invoices: structuredClone(invoiceSeed),
  planRequests: structuredClone(planRequestSeed),
  locations: structuredClone(locationSeed),
  courts: structuredClone(courtSeed),
  customers: structuredClone(customerSeed),
  bookings: structuredClone(bookingSeed),
  payments: structuredClone(paymentSeed),
  paymentAccounts: structuredClone(paymentAccountSeed),
  platformPaymentAccounts: structuredClone(platformPaymentAccountSeed),
  platformSettings: structuredClone(platformSettingsSeed),
  trialRequests: structuredClone(trialRequestSeed),
  staff: structuredClone(staffSeed),
  traffic: structuredClone(trafficSeed),
  activity: structuredClone(platformActivitySeed),
  /** Per tenant; a missing entry means DEFAULT_CUSTOMER_TAGS. */
  customerTagLists: {} as Record<string, string[]>,
}

/** Simulated network latency, so loading states are exercised. */
export function latency(ms = 160): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Returns a deep copy — like a network response, callers can't mutate the
 * "database" by editing what they got back.
 */
export async function respond<T>(value: T, ms?: number): Promise<T> {
  await latency(ms)
  return structuredClone(value)
}

export type ServiceErrorCode = 'not_found' | 'conflict' | 'limit_reached' | 'invalid'

export class ServiceError extends Error {
  readonly code: ServiceErrorCode

  constructor(message: string, code: ServiceErrorCode) {
    super(message)
    this.code = code
  }
}

export function findOrThrow<T extends { id: string }>(rows: T[], id: string, label: string): T {
  const row = rows.find((r) => r.id === id)
  if (!row) throw new ServiceError(`${label} not found`, 'not_found')
  return row
}
