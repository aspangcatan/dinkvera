import type { PaymentMethod } from './tenant'

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'
export type BookingSource = 'online' | 'walk_in' | 'phone'

export interface Booking {
  id: string
  /**
   * Customer-facing code, e.g. "RP-7K2Q". Shared by every booking in a
   * multi-date group, so one reference (and one payment) covers them all.
   */
  reference: string
  /** Set when booked together with other dates/times (same reference). */
  groupId: string | null
  tenantId: string
  locationId: string
  courtId: string
  customerId: string
  /** YYYY-MM-DD in the tenant's timezone. */
  date: string
  /** Hour of day the booking starts (24h clock). */
  startHour: number
  durationHours: number
  status: BookingStatus
  paymentStatus: PaymentStatus
  /** Integer centavos. */
  amount: number
  source: BookingSource
  notes: string
  createdAt: string
}

export interface Customer {
  id: string
  tenantId: string
  name: string
  email: string
  phone: string
  createdAt: string
  tags: string[]
}

export type PaymentRecordStatus = 'paid' | 'pending' | 'refunded' | 'failed'

export interface Payment {
  id: string
  tenantId: string
  bookingId: string
  customerId: string
  amount: number
  method: PaymentMethod
  status: PaymentRecordStatus
  /** Provider / transfer reference. */
  reference: string
  /** Customer's payment screenshot (storage path, or a data URL in mock mode). */
  proofPath: string | null
  /** Reference number the customer typed from their GCash / bank receipt. */
  transactionReference: string
  createdAt: string
  /** When it became paid (proof approved or payment recorded); null while not paid. */
  paidAt: string | null
}
