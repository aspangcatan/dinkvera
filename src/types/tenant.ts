/**
 * A tenant is one independent pickleball business on the platform. Every
 * other record (locations, courts, bookings, staff…) carries a `tenantId`,
 * which becomes the RLS boundary once Supabase is wired in.
 */
export type TenantStatus = 'active' | 'trialing' | 'past_due' | 'suspended' | 'cancelled'

export interface TenantBranding {
  /** Main brand color (hex). Drives buttons, accents and the public site. */
  primary: string
  /** Secondary highlight (hex), used sparingly. */
  accent: string
  /** Two-letter monogram shown where there is no uploaded logo. */
  monogram: string
  tagline: string
  /** Booking-site homepage banner: plain brand color, or a photo carousel. */
  heroStyle: 'color' | 'carousel'
  /** Up to 3 banner photos, in display order (storage path + public URL). */
  heroImages: HeroImage[]
}

export interface HeroImage {
  /** Storage path (a data URL in mock mode). */
  path: string
  url: string
}

export interface BookingRules {
  /** Smallest booking length, in minutes. */
  minDurationMinutes: number
  maxDurationMinutes: number
  /** How far ahead customers may book. */
  advanceBookingDays: number
  /** Free cancellation up to this many hours before start. */
  cancellationWindowHours: number
  /** Unpaid online bookings are released after this many minutes. */
  holdMinutes: number
  requirePrepayment: boolean
  allowWalkIns: boolean
  paymentMethods: PaymentMethod[]
  /** Most hours one player can book on one court per day (online); null = no limit. */
  maxCourtHoursPerDay: number | null
  /** Unpaid upcoming online bookings one player can hold at once. */
  maxUnpaidBookings: number
}

/** One section of a business's rules & policies, e.g. "House rules". */
export interface TenantPolicy {
  title: string
  /** Plain text: blank line = new paragraph, "- " at line start = bullet. */
  body: string
}

export interface Tenant {
  id: string
  slug: string
  name: string
  legalName: string
  status: TenantStatus
  ownerName: string
  ownerEmail: string
  phone: string
  city: string
  timezone: string
  currency: 'PHP'
  createdAt: string
  branding: TenantBranding
  bookingRules: BookingRules
  /** Rules & policies shown on the booking site and at checkout, in order. */
  policies: TenantPolicy[]
  /** Public site contact copy. */
  about: string
}

export type PaymentMethod = 'gcash' | 'maya' | 'card' | 'bank_transfer' | 'cash'

/** Methods whose details the business enters (card needs a payment provider instead). */
export type AccountMethod = 'gcash' | 'maya' | 'bank_transfer'

/** Sideline's own accounts (businesses paying invoices) also allow one QR Ph code. */
export type PlatformAccountMethod = 'qrph' | AccountMethod

/** Where customers send money for one method, shown at checkout. */
export interface PaymentAccount<M extends string = AccountMethod> {
  tenantId: string
  method: M
  accountName: string
  accountNumber: string
  /** Bank transfers only, e.g. "BDO". */
  bankName: string
  instructions: string
  /** Public image URL of the QR code, or null. */
  qrUrl: string | null
}

export type PlatformPaymentAccount = PaymentAccount<PlatformAccountMethod>

/** Super Admin → Settings (one row for the whole platform). */
export interface PlatformSettings {
  companyName: string
  supportEmail: string
  billingCurrency: 'PHP'
  /** Length of new businesses' free trials. */
  trialDays: number
  /** Invoices fall due this many days after their billing period starts. */
  graceDays: number
  suspendAfterInvoices: number
  requireCardForTrial: boolean
  allowSignups: boolean
  maintenanceMode: boolean
  emailBookingConfirmations: boolean
  emailInvoiceReminders: boolean
}
