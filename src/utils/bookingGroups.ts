import type { BookingRow } from '@/services/bookingService'
import type { PaymentRow } from '@/services/paymentService'
import type { BookingStatus, PaymentStatus } from '@/types/booking'

/**
 * One customer booking as staff think of it: everything booked together
 * ("Add date") under one reference, with one payment and one total.
 * The database keeps one row per court/time slot; this groups them back.
 */
export interface BookingGroup {
  /** groupId, or the booking id for single bookings. */
  key: string
  reference: string
  /** Slots, earliest first. */
  bookings: BookingRow[]
  first: BookingRow
  /** Sum of the slots (cancelled ones excluded unless all are cancelled). */
  total: number
  /** Shared status, or 'mixed' when the slots differ (e.g. one cancelled). */
  status: BookingStatus | 'mixed'
  paymentStatus: PaymentStatus | 'mixed'
  dates: string[]
  courtNames: string[]
  locationNames: string[]
}

const byStart = (a: BookingRow, b: BookingRow) =>
  a.date.localeCompare(b.date) ||
  a.startHour - b.startHour ||
  a.courtName.localeCompare(b.courtName)

function shared<T>(values: T[]): T | 'mixed' {
  return values.every((v) => v === values[0]) ? values[0]! : 'mixed'
}

const unique = (values: string[]) => [...new Set(values)]

export function groupBookings(rows: BookingRow[]): BookingGroup[] {
  const map = new Map<string, BookingRow[]>()
  for (const row of rows) {
    const key = row.groupId ?? row.id
    map.set(key, [...(map.get(key) ?? []), row])
  }
  return [...map.entries()].map(([key, list]) => {
    const bookings = [...list].sort(byStart)
    const live = bookings.filter((b) => b.status !== 'cancelled')
    return {
      key,
      reference: bookings[0]!.reference,
      bookings,
      first: bookings[0]!,
      total: (live.length ? live : bookings).reduce((sum, b) => sum + b.amount, 0),
      status: shared(bookings.map((b) => b.status)),
      paymentStatus: shared(bookings.map((b) => b.paymentStatus)),
      dates: unique(bookings.map((b) => b.date)),
      courtNames: unique(bookings.map((b) => b.courtName)),
      locationNames: unique(bookings.map((b) => b.locationName)),
    }
  })
}

/** A payment as staff see it: one transfer, even when it covers several times. */
export type PaymentGroup = PaymentRow & {
  /** Every payment row in this transfer (one per booked time). */
  ids: string[]
  /** How many booked times the transfer covers. */
  count: number
}

/**
 * Collapses the per-slot payment rows of one transfer (same booking
 * reference, provider reference, method and status) into one line with
 * the combined amount.
 */
export function groupPayments(rows: PaymentRow[]): PaymentGroup[] {
  const map = new Map<string, PaymentGroup>()
  for (const p of rows) {
    const key = `${p.bookingReference}|${p.reference}|${p.method}|${p.status}`
    const group = map.get(key)
    if (group) {
      group.amount += p.amount
      group.ids.push(p.id)
      group.count++
    } else {
      map.set(key, { ...p, ids: [p.id], count: 1 })
    }
  }
  return [...map.values()]
}
