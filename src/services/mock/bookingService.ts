import type {
  Booking,
  BookingSource,
  BookingStatus,
  Customer,
  Payment,
  PaymentStatus,
} from '@/types/booking'
import type { PaymentMethod } from '@/types/tenant'
import type { Court, Location } from '@/types/venue'
import { addDays, monthKey, todayISO } from '@/utils/dates'
import { bookingReference, newId } from '@/utils/ids'
import { bookingPrice } from '@/utils/pricing'

import { findOrCreateCustomer } from './customerService'
import { db, findOrThrow, respond, ServiceError } from './mockDb'

/** A booking joined with the names the UI shows (later: a Postgres view). */
export interface BookingRow extends Booking {
  customerName: string
  customerPhone: string
  courtName: string
  locationName: string
}

export interface BookingFilters {
  from?: string
  to?: string
  locationId?: string
  courtId?: string
  customerId?: string
  status?: BookingStatus | ''
  paymentStatus?: PaymentStatus | ''
  search?: string
}

/** Statuses that occupy the court. */
const BLOCKING: BookingStatus[] = ['pending', 'confirmed', 'completed']

function toRow(b: Booking): BookingRow {
  const customer = db.customers.find((c) => c.id === b.customerId)
  return {
    ...b,
    customerName: customer?.name ?? 'Unknown',
    customerPhone: customer?.phone ?? '',
    courtName: db.courts.find((c) => c.id === b.courtId)?.name ?? '—',
    locationName: db.locations.find((l) => l.id === b.locationId)?.name ?? '—',
  }
}

export async function listBookings(
  tenantId: string,
  f: BookingFilters = {},
): Promise<BookingRow[]> {
  const search = f.search?.trim().toLowerCase()
  const rows = db.bookings
    .filter(
      (b) =>
        b.tenantId === tenantId &&
        (!f.from || b.date >= f.from) &&
        (!f.to || b.date <= f.to) &&
        (!f.locationId || b.locationId === f.locationId) &&
        (!f.courtId || b.courtId === f.courtId) &&
        (!f.customerId || b.customerId === f.customerId) &&
        (!f.status || b.status === f.status) &&
        (!f.paymentStatus || b.paymentStatus === f.paymentStatus),
    )
    .map(toRow)
    .filter(
      (r) =>
        !search ||
        r.reference.toLowerCase().includes(search) ||
        r.customerName.toLowerCase().includes(search) ||
        r.customerPhone.replace(/\s/g, '').includes(search.replace(/\s/g, '')),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.startHour - a.startHour)
  return respond(rows)
}

export interface BookingDetail {
  booking: BookingRow
  customer: Customer | null
  payments: Payment[]
  /** Other dates/times booked together with this one (same reference). */
  siblings: BookingRow[]
}

export async function getBookingDetail(id: string): Promise<BookingDetail> {
  const booking = findOrThrow(db.bookings, id, 'Booking')
  const siblings = booking.groupId
    ? db.bookings.filter((b) => b.groupId === booking.groupId && b.id !== id).sort(byStart)
    : []
  return respond({
    booking: toRow(booking),
    customer: db.customers.find((c) => c.id === booking.customerId) ?? null,
    // Payments for every slot of the booking: one transfer covers them all.
    payments: db.payments.filter(
      (p) => p.bookingId === id || siblings.some((s) => s.id === p.bookingId),
    ),
    siblings: siblings.map(toRow),
  })
}

export interface DaySchedule {
  location: Location
  courts: Court[]
  bookings: BookingRow[]
}

/** Everything the calendar grid needs for one location and day. */
export async function getDaySchedule(locationId: string, date: string): Promise<DaySchedule> {
  const location = findOrThrow(db.locations, locationId, 'Location')
  return respond({
    location,
    courts: db.courts.filter((c) => c.locationId === locationId),
    bookings: db.bookings
      .filter((b) => b.locationId === locationId && b.date === date && b.status !== 'cancelled')
      .map(toRow),
  })
}

/**
 * Public availability: which hours are taken on each court. Exposes no
 * customer data (later: a SECURITY DEFINER function callable by anon).
 */
export async function getAvailability(
  locationId: string,
  date: string,
): Promise<Record<string, number[]>> {
  const taken: Record<string, number[]> = {}
  for (const b of db.bookings) {
    if (b.locationId !== locationId || b.date !== date || !BLOCKING.includes(b.status)) continue
    const hours = (taken[b.courtId] ??= [])
    for (let h = b.startHour; h < b.startHour + b.durationHours; h++) hours.push(h)
  }
  return respond(taken, 120)
}

/** Most dates/times one booking can cover (same cap as match-pickleball). */
export const MAX_GROUP_SLOTS = 7

export interface BookingSlot {
  courtId: string
  date: string
  startHour: number
  durationHours: number
}

export interface NewBookingInput extends BookingSlot {
  tenantId: string
  customer: { name: string; email: string; phone: string }
  notes: string
  source: BookingSource
  /** Staff only: record payment now. */
  paymentMethod?: PaymentMethod | null
  /** Public checkout: payment was sent but needs verification (GCash, transfer). */
  paymentPending?: boolean
  /** Made on the public booking site: always as a player, even if staff are signed in. */
  fromBookingSite?: boolean
}

function assertSlotFree(
  courtId: string,
  date: string,
  start: number,
  duration: number,
  ignoreId?: string,
) {
  const clash = db.bookings.some(
    (b) =>
      b.id !== ignoreId &&
      b.courtId === courtId &&
      b.date === date &&
      BLOCKING.includes(b.status) &&
      b.startHour < start + duration &&
      start < b.startHour + b.durationHours,
  )
  if (clash) throw new ServiceError('That time overlaps another booking on this court.', 'conflict')
}

function assertBookable(court: Court, location: Location, start: number, duration: number) {
  if (court.status !== 'active') {
    throw new ServiceError(`${court.name} is not open for bookings right now.`, 'invalid')
  }
  if (start < location.openHour || start + duration > location.closeHour) {
    throw new ServiceError('That time is outside opening hours.', 'invalid')
  }
}

/** Single court booking (staff walk-ins/phone). See createBookingGroup. */
export async function createBooking(input: NewBookingInput): Promise<BookingRow> {
  const { courtId, date, startHour, durationHours, ...rest } = input
  const group = await createBookingGroup({
    ...rest,
    slots: [{ courtId, date, startHour, durationHours }],
  })
  return group.bookings[0]!
}

export interface NewBookingGroupInput extends Omit<NewBookingInput, keyof BookingSlot> {
  slots: BookingSlot[]
}

export interface CreatedBookingGroup {
  reference: string
  total: number
  bookings: BookingRow[]
}

/**
 * Books one or more dates/times together (match-pickleball's "Add another
 * date"): every slot is checked first — against existing bookings and
 * against each other — and only then are all of them created, under one
 * reference with one payment. Later: one Postgres function so it's atomic.
 */
/** Throws the player-facing message if this phone may not book these slots online. */
function assertPlayerLimits(tenantId: string, slots: BookingSlot[], phone: string): void {
  const rules = findOrThrow(db.tenants, tenantId, 'Business').bookingRules
  const digits = phone.replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return // the booking itself rejects a bad number
  const samePhone = (customerId: string) =>
    db.customers
      .find((c) => c.id === customerId)
      ?.phone.replace(/\D/g, '')
      .slice(-10) === digits
  const today = todayISO()
  const open = new Set(
    db.bookings
      .filter((b) => {
        if (b.tenantId !== tenantId || b.source !== 'online' || b.date < today) return false
        if (!['pending', 'confirmed'].includes(b.status) || b.paymentStatus !== 'unpaid') {
          return false
        }
        return samePhone(b.customerId)
      })
      .map((b) => b.reference),
  )
  if (open.size >= rules.maxUnpaidBookings) {
    throw new ServiceError(
      `This number already has ${open.size} unpaid booking${open.size === 1 ? '' : 's'} here. Pay for or cancel one first, or contact the venue.`,
      'invalid',
    )
  }
  const cap = rules.maxCourtHoursPerDay
  if (cap === null) return
  for (const slot of slots) {
    const requested = slots
      .filter((s) => s.courtId === slot.courtId && s.date === slot.date)
      .reduce((sum, s) => sum + s.durationHours, 0)
    const held = db.bookings
      .filter(
        (b) =>
          b.tenantId === tenantId &&
          b.courtId === slot.courtId &&
          b.date === slot.date &&
          ['pending', 'confirmed'].includes(b.status) &&
          samePhone(b.customerId),
      )
      .reduce((sum, b) => sum + b.durationHours, 0)
    if (requested + held > cap) {
      const court = db.courts.find((c) => c.id === slot.courtId)
      throw new ServiceError(
        `You can book up to ${cap} hour${cap === 1 ? '' : 's'} on ${court?.name ?? 'one court'} per day. Pick another court or day.`,
        'invalid',
      )
    }
  }
}

/**
 * Booking site pre-check, once the player's phone is known (Continue on
 * "Your details"): throws the message the booking itself would fail with.
 */
export async function checkBookingLimits(
  tenantId: string,
  slots: BookingSlot[],
  phone: string,
): Promise<void> {
  assertPlayerLimits(tenantId, slots, phone)
  return respond(undefined)
}

export async function createBookingGroup(
  input: NewBookingGroupInput,
): Promise<CreatedBookingGroup> {
  const tenant = findOrThrow(db.tenants, input.tenantId, 'Business')
  const rules = tenant.bookingRules

  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    throw new ServiceError(`${tenant.name} is not taking bookings at the moment.`, 'invalid')
  }
  if (input.source === 'walk_in' && !tenant.bookingRules.allowWalkIns) {
    throw new ServiceError(
      "This business doesn't take walk-ins. Turn them on in Settings → Booking rules.",
      'invalid',
    )
  }
  if (input.slots.length === 0) throw new ServiceError('Pick at least one time.', 'invalid')
  // Same per-player limits as the database (online bookings only).
  if (input.source === 'online') assertPlayerLimits(tenant.id, input.slots, input.customer.phone)
  if (input.slots.length > MAX_GROUP_SLOTS) {
    throw new ServiceError(`One booking can cover up to ${MAX_GROUP_SLOTS} dates.`, 'invalid')
  }

  // 1. Validate every slot before creating anything.
  const checked = input.slots.map((slot, i) => {
    const court = findOrThrow(db.courts, slot.courtId, 'Court')
    if (court.tenantId !== tenant.id) throw new ServiceError('Court not found', 'not_found')
    const location = findOrThrow(db.locations, court.locationId, 'Location')
    const minutes = slot.durationHours * 60
    if (input.source === 'online') {
      if (minutes < rules.minDurationMinutes || minutes > rules.maxDurationMinutes) {
        throw new ServiceError('That booking length is not allowed.', 'invalid')
      }
      if (slot.date > addDays(todayISO(), rules.advanceBookingDays)) {
        throw new ServiceError(`Bookings open ${rules.advanceBookingDays} days ahead.`, 'invalid')
      }
    }
    assertBookable(court, location, slot.startHour, slot.durationHours)
    assertSlotFree(court.id, slot.date, slot.startHour, slot.durationHours)
    const clashesWithEarlier = input.slots
      .slice(0, i)
      .some(
        (o) =>
          o.courtId === slot.courtId &&
          o.date === slot.date &&
          o.startHour < slot.startHour + slot.durationHours &&
          slot.startHour < o.startHour + o.durationHours,
      )
    if (clashesWithEarlier) {
      throw new ServiceError('Two of the picked times overlap on the same court.', 'conflict')
    }
    return { slot, court, location }
  })

  const sub = db.subscriptions.find((s) => s.tenantId === tenant.id)
  const limit = db.plans.find((p) => p.id === sub?.planId)?.limits.bookingsPerMonth
  if (limit != null) {
    for (const month of new Set(input.slots.map((s) => monthKey(s.date)))) {
      const existing = db.bookings.filter(
        (b) => b.tenantId === tenant.id && b.date.startsWith(month) && b.status !== 'cancelled',
      ).length
      const adding = input.slots.filter((s) => s.date.startsWith(month)).length
      if (existing + adding > limit) {
        throw new ServiceError(
          'This business has reached its monthly booking limit.',
          'limit_reached',
        )
      }
    }
  }

  // 2. Create them together.
  const customer = findOrCreateCustomer(tenant.id, input.customer)
  const paidNow = !!input.paymentMethod && !input.paymentPending
  let status: BookingStatus = 'confirmed'
  if (input.source === 'online' && rules.requirePrepayment && !paidNow) status = 'pending'
  const reference = bookingReference(tenant.branding.monogram)
  const groupId = checked.length > 1 ? newId('grp') : null
  const paymentReference = input.paymentMethod ? providerReference(input.paymentMethod) : ''
  const createdAt = new Date().toISOString()

  const created = checked
    .sort((a, b) => a.slot.date.localeCompare(b.slot.date) || a.slot.startHour - b.slot.startHour)
    .map(({ slot, court, location }) => {
      const booking: Booking = {
        id: newId('bk'),
        reference,
        groupId,
        tenantId: tenant.id,
        locationId: location.id,
        courtId: court.id,
        customerId: customer.id,
        date: slot.date,
        startHour: slot.startHour,
        durationHours: slot.durationHours,
        status,
        paymentStatus: paidNow ? 'paid' : 'unpaid',
        amount: bookingPrice(court, slot.startHour, slot.durationHours),
        source: input.source,
        notes: input.notes,
        createdAt,
      }
      db.bookings.push(booking)
      if (input.paymentMethod) {
        recordPayment(
          booking,
          input.paymentMethod,
          input.paymentPending ? 'pending' : 'paid',
          paymentReference,
        )
      }
      return toRow(booking)
    })

  return respond({
    reference,
    total: created.reduce((sum, b) => sum + b.amount, 0),
    bookings: created,
  })
}

function providerReference(method: PaymentMethod): string {
  return `${method.slice(0, 2).toUpperCase()}${Math.floor(Math.random() * 90_000_000 + 10_000_000)}`
}

/**
 * One payment row per booking. A multi-date booking's rows share the same
 * provider reference: one transfer paid for all of them.
 */
function recordPayment(
  booking: Booking,
  method: PaymentMethod,
  status: Payment['status'],
  reference = providerReference(method),
): Payment {
  const payment: Payment = {
    id: newId('pay'),
    tenantId: booking.tenantId,
    bookingId: booking.id,
    customerId: booking.customerId,
    amount: booking.amount,
    method,
    status,
    reference,
    proofPath: null,
    transactionReference: '',
    createdAt: new Date().toISOString(),
    paidAt: status === 'paid' ? new Date().toISOString() : null,
  }
  db.payments.push(payment)
  return payment
}

export async function setBookingStatus(id: string, status: BookingStatus): Promise<BookingRow> {
  const booking = findOrThrow(db.bookings, id, 'Booking')
  if (status === 'confirmed' && booking.status === 'cancelled') {
    assertSlotFree(booking.courtId, booking.date, booking.startHour, booking.durationHours, id)
  }
  booking.status = status
  return respond(toRow(booking))
}

export async function cancelBooking(id: string, refund: boolean): Promise<BookingRow> {
  const booking = findOrThrow(db.bookings, id, 'Booking')
  booking.status = 'cancelled'
  if (refund && booking.paymentStatus === 'paid') {
    booking.paymentStatus = 'refunded'
    for (const p of db.payments) {
      if (p.bookingId === id && p.status === 'paid') p.status = 'refunded'
    }
  }
  return respond(toRow(booking))
}

export async function markBookingPaid(id: string, method: PaymentMethod): Promise<BookingRow> {
  const booking = findOrThrow(db.bookings, id, 'Booking')
  const pending = db.payments.find((p) => p.bookingId === id && p.status === 'pending')
  if (pending) Object.assign(pending, { status: 'paid', paidAt: new Date().toISOString() })
  else recordPayment(booking, method, 'paid')
  booking.paymentStatus = 'paid'
  if (booking.status === 'pending') booking.status = 'confirmed'
  return respond(toRow(booking))
}

export interface RescheduleInput {
  courtId: string
  date: string
  startHour: number
  durationHours: number
}

export async function rescheduleBooking(id: string, input: RescheduleInput): Promise<BookingRow> {
  const booking = findOrThrow(db.bookings, id, 'Booking')
  const court = findOrThrow(db.courts, input.courtId, 'Court')
  const location = findOrThrow(db.locations, court.locationId, 'Location')
  assertBookable(court, location, input.startHour, input.durationHours)
  assertSlotFree(court.id, input.date, input.startHour, input.durationHours, id)
  Object.assign(booking, input, { locationId: location.id })
  booking.amount = bookingPrice(court, input.startHour, input.durationHours)
  return respond(toRow(booking))
}

/**
 * Public "find my booking": reference plus the phone number used. Returns
 * every date/time under that reference (one for a single booking), or an
 * empty list when nothing matches.
 */
export async function lookupBooking(
  tenantId: string,
  reference: string,
  phone: string,
): Promise<BookingRow[]> {
  const digits = phone.replace(/\D/g, '').slice(-10)
  const code = reference.trim().toUpperCase()
  const rows = db.bookings.filter((b) => {
    if (b.tenantId !== tenantId || b.reference.toUpperCase() !== code) return false
    const customer = db.customers.find((c) => c.id === b.customerId)
    return customer?.phone.replace(/\D/g, '').slice(-10) === digits
  })
  return respond(rows.map(toRow).sort(byStart))
}

const byStart = (a: Booking, b: Booking) =>
  a.date.localeCompare(b.date) || a.startHour - b.startHour
