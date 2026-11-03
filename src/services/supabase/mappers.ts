/**
 * Database rows (snake_case) → the app's domain types (camelCase), so the
 * Supabase services return exactly what the mock services return.
 */
import { supabase } from '@/lib/supabase/client'
import type {
  Invoice,
  Plan,
  PlanId,
  PlanRequest,
  Subscription,
  TrialRequest,
} from '@/types/billing'
import type { Booking, Customer, Payment } from '@/types/booking'
import type { StaffMember } from '@/types/staff'
import type { BookingRules, PaymentMethod, Tenant } from '@/types/tenant'
import type { Court, Location } from '@/types/venue'

import type { BookingRow } from '../mock/bookingService'
import type { CustomerSummary } from '../mock/customerService'
import type { PaymentRow } from '../mock/paymentService'

/** Public URL of a banner photo in the branding bucket. */
export function brandingUrl(path: string): string {
  return supabase().storage.from('branding').getPublicUrl(path).data.publicUrl
}

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come untyped from PostgREST */
type Row = Record<string, any>

export const TENANT_SELECT = '*, booking_rules(*)'

export function toBookingRules(r: Row | null | undefined): BookingRules {
  return {
    minDurationMinutes: r?.min_duration_minutes ?? 60,
    maxDurationMinutes: r?.max_duration_minutes ?? 180,
    advanceBookingDays: r?.advance_booking_days ?? 30,
    cancellationWindowHours: r?.cancellation_window_hours ?? 24,
    holdMinutes: r?.hold_minutes ?? 15,
    requirePrepayment: r?.require_prepayment ?? true,
    allowWalkIns: r?.allow_walk_ins ?? true,
    paymentMethods: (r?.payment_methods ?? ['gcash', 'cash']) as PaymentMethod[],
    maxCourtHoursPerDay: r?.max_court_hours_per_day ?? null,
    maxUnpaidBookings: r?.max_unpaid_bookings ?? 3,
  }
}

export function fromBookingRules(rules: Partial<BookingRules>): Row {
  const map: Record<keyof BookingRules, string> = {
    minDurationMinutes: 'min_duration_minutes',
    maxDurationMinutes: 'max_duration_minutes',
    advanceBookingDays: 'advance_booking_days',
    cancellationWindowHours: 'cancellation_window_hours',
    holdMinutes: 'hold_minutes',
    requirePrepayment: 'require_prepayment',
    allowWalkIns: 'allow_walk_ins',
    paymentMethods: 'payment_methods',
    maxCourtHoursPerDay: 'max_court_hours_per_day',
    maxUnpaidBookings: 'max_unpaid_bookings',
  }
  const row: Row = {}
  for (const [key, value] of Object.entries(rules)) {
    if (value !== undefined) row[map[key as keyof BookingRules]] = value
  }
  return row
}

export function toTenant(r: Row): Tenant {
  const rules = Array.isArray(r.booking_rules) ? r.booking_rules[0] : r.booking_rules
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    legalName: r.legal_name,
    status: r.status,
    ownerName: r.owner_name,
    ownerEmail: r.owner_email,
    phone: r.phone,
    city: r.city,
    timezone: r.timezone,
    currency: 'PHP',
    createdAt: String(r.created_at).slice(0, 10),
    branding: {
      primary: r.brand_primary,
      accent: r.brand_accent,
      monogram: r.brand_monogram,
      tagline: r.brand_tagline,
      heroStyle: r.hero_style ?? 'color',
      heroImages: ((r.hero_images ?? []) as string[]).map((path) => ({
        path,
        url: brandingUrl(path),
      })),
    },
    bookingRules: toBookingRules(rules),
    policies: r.policies ?? [],
    about: r.about,
  }
}

export function toPlan(r: Row): Plan {
  return {
    id: r.id as PlanId,
    name: r.name,
    description: r.description,
    monthlyPrice: r.monthly_price_centavos,
    annualPrice: r.annual_price_centavos,
    limits: {
      locations: r.limit_locations,
      courts: r.limit_courts,
      bookingsPerMonth: r.limit_bookings_per_month,
    },
    features: r.features ?? [],
    highlighted: r.highlighted,
    isPublic: r.is_public,
    comingSoon: r.coming_soon ?? false,
  }
}

export function toSubscription(r: Row): Subscription {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    planId: r.plan_id,
    status: r.status,
    billingCycle: r.billing_cycle,
    startedAt: r.started_at,
    currentPeriodStart: r.current_period_start,
    currentPeriodEnd: r.current_period_end,
    trialEndsAt: r.trial_ends_at,
    cancelAtPeriodEnd: r.cancel_at_period_end,
  }
}

export function toPlanRequest(r: Row): PlanRequest {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.tenants?.name ?? '',
    fromPlanId: r.from_plan_id,
    fromBillingCycle: r.from_billing_cycle,
    planId: r.plan_id,
    billingCycle: r.billing_cycle,
    note: r.note,
    status: r.status,
    decisionNote: r.decision_note,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  }
}

export function toInvoice(r: Row): Invoice {
  return {
    id: r.id,
    number: r.number,
    tenantId: r.tenant_id,
    subscriptionId: r.subscription_id,
    planId: r.plan_id,
    amount: r.amount_centavos,
    status: r.status,
    issuedAt: r.issued_at,
    dueAt: r.due_at,
    paidAt: r.paid_at,
    paymentMethod: r.payment_method,
    proofPath: r.proof_path,
    transactionReference: r.transaction_reference ?? '',
    proofSubmittedAt: r.proof_submitted_at,
    reviewNote: r.review_note ?? '',
    paidOnline: !!r.paymongo_payment_id,
    checkoutStarted: !!r.paymongo_checkout_id,
    periodStart: r.period_start ?? null,
  }
}

export function toTrialRequest(r: Row): TrialRequest {
  return {
    id: r.id,
    businessName: r.business_name,
    contactName: r.contact_name,
    email: r.email,
    phone: r.phone,
    city: r.city,
    courts: r.courts,
    message: r.message,
    planId: r.plan_id ?? null,
    status: r.status,
    createdAt: r.created_at,
    handledAt: r.handled_at,
  }
}

export function toLocation(r: Row): Location {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    slug: r.slug,
    address: r.address,
    city: r.city,
    phone: r.phone,
    openHour: r.open_hour,
    closeHour: r.close_hour,
    status: r.status,
    amenities: r.amenities ?? [],
    // numeric columns arrive as strings from PostgREST.
    latitude: r.latitude === null || r.latitude === undefined ? null : Number(r.latitude),
    longitude: r.longitude === null || r.longitude === undefined ? null : Number(r.longitude),
  }
}

export function toCourt(r: Row): Court {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    locationId: r.location_id,
    name: r.name,
    type: r.type,
    surface: r.surface,
    dayRate: r.day_rate_centavos,
    nightRate: r.night_rate_centavos,
    nightStartHour: r.night_start_hour,
    status: r.status,
    features: r.features ?? [],
  }
}

export function toCustomer(r: Row): Customer {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    createdAt: String(r.created_at).slice(0, 10),
    tags: r.tags ?? [],
  }
}

export function toCustomerSummary(r: Row): CustomerSummary {
  return {
    ...toCustomer(r),
    bookings: r.booking_count ?? 0,
    totalSpent: r.total_spent_centavos ?? 0,
    lastVisit: r.last_visit ?? null,
    noShows: r.no_show_count ?? 0,
  }
}

export function toBooking(r: Row): Booking {
  return {
    id: r.id,
    reference: r.reference,
    groupId: r.group_id,
    tenantId: r.tenant_id,
    locationId: r.location_id,
    courtId: r.court_id,
    customerId: r.customer_id,
    date: r.business_date,
    startHour: r.start_hour,
    durationHours: r.duration_hours,
    status: r.status,
    paymentStatus: r.payment_status,
    amount: r.amount_centavos,
    source: r.source,
    notes: r.notes,
    createdAt: r.created_at,
  }
}

export function toBookingRow(r: Row): BookingRow {
  return {
    ...toBooking(r),
    customerName: r.customer_name ?? 'Unknown',
    customerPhone: r.customer_phone ?? '',
    courtName: r.court_name ?? '—',
    locationName: r.location_name ?? '—',
  }
}

export function toPayment(r: Row): Payment {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    bookingId: r.booking_id,
    customerId: r.customer_id,
    amount: r.amount_centavos,
    method: r.method,
    status: r.status,
    reference: r.reference,
    proofPath: r.proof_path ?? null,
    transactionReference: r.transaction_reference ?? '',
    createdAt: r.created_at,
    paidAt: r.paid_at ?? null,
  }
}

export function toPaymentRow(r: Row): PaymentRow {
  return {
    ...toPayment(r),
    bookingReference: r.booking_reference ?? '—',
    bookingDate: r.booking_date ?? '',
    customerName: r.customer_name ?? 'Unknown',
    locationId: r.location_id ?? '',
  }
}

export function toStaff(r: Row): StaffMember {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    status: r.status,
    lastActiveAt: r.last_active_at,
  }
}
