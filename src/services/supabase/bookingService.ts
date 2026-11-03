import { check, fetchAll, publicSupabase, supabase, unwrap } from '@/lib/supabase/client'
import type { BookingStatus } from '@/types/booking'
import type { PaymentMethod } from '@/types/tenant'

import type {
  BookingDetail,
  BookingFilters,
  BookingRow,
  BookingSlot,
  CreatedBookingGroup,
  DaySchedule,
  NewBookingGroupInput,
  NewBookingInput,
  RescheduleInput,
} from '../mock/bookingService'
import { toBookingRow, toCourt, toCustomer, toLocation, toPayment } from './mappers'

export { MAX_GROUP_SLOTS } from '../mock/bookingService'

async function getRow(id: string): Promise<BookingRow> {
  return toBookingRow(
    unwrap(await supabase().from('booking_rows').select('*').eq('id', id).single()),
  )
}

/** Strips characters that would break a PostgREST `or=(…)` filter. */
const safe = (value: string) => value.replace(/[,()*%\\]/g, ' ').trim()

export async function listBookings(
  tenantId: string,
  f: BookingFilters = {},
): Promise<BookingRow[]> {
  const rows = await fetchAll((from, to) => {
    let query = supabase().from('booking_rows').select('*').eq('tenant_id', tenantId)
    if (f.from) query = query.gte('business_date', f.from)
    if (f.to) query = query.lte('business_date', f.to)
    if (f.locationId) query = query.eq('location_id', f.locationId)
    if (f.courtId) query = query.eq('court_id', f.courtId)
    if (f.customerId) query = query.eq('customer_id', f.customerId)
    if (f.status) query = query.eq('status', f.status)
    if (f.paymentStatus) query = query.eq('payment_status', f.paymentStatus)
    const search = safe(f.search ?? '')
    if (search) {
      query = query.or(
        `reference.ilike.*${search}*,customer_name.ilike.*${search}*,customer_phone.ilike.*${search}*`,
      )
    }
    return query
      .order('business_date', { ascending: false })
      .order('start_hour', { ascending: false })
      .range(from, to)
  }, 5000)
  return rows.map(toBookingRow)
}

export async function getBookingDetail(id: string): Promise<BookingDetail> {
  const booking = await getRow(id)
  const [customer, siblings] = await Promise.all([
    supabase().from('customers').select('*').eq('id', booking.customerId).maybeSingle(),
    booking.groupId
      ? supabase()
          .from('booking_rows')
          .select('*')
          .eq('group_id', booking.groupId)
          .neq('id', id)
          .order('business_date')
          .order('start_hour')
      : Promise.resolve({ data: [], error: null }),
  ])
  const siblingRows = (unwrap(siblings) ?? []).map(toBookingRow)
  // Payments for every slot of the booking: one transfer covers them all.
  const payments = await supabase()
    .from('payments')
    .select('*')
    .in('booking_id', [id, ...siblingRows.map((s) => s.id)])
    .order('created_at')
  return {
    booking,
    // Front desk can't read customers on some roles; the row already has name + phone.
    customer: customer.data ? toCustomer(customer.data) : null,
    payments: payments.data ? payments.data.map(toPayment) : [],
    siblings: siblingRows,
  }
}

export async function getDaySchedule(locationId: string, date: string): Promise<DaySchedule> {
  const [location, courts, bookings] = await Promise.all([
    supabase().from('locations').select('*').eq('id', locationId).single(),
    supabase().from('courts').select('*').eq('location_id', locationId).order('name'),
    supabase()
      .from('booking_rows')
      .select('*')
      .eq('location_id', locationId)
      .eq('business_date', date)
      .neq('status', 'cancelled'),
  ])
  return {
    location: toLocation(unwrap(location)),
    courts: unwrap(courts).map(toCourt),
    bookings: unwrap(bookings).map(toBookingRow),
  }
}

export async function getAvailability(
  locationId: string,
  date: string,
): Promise<Record<string, number[]>> {
  const rows = unwrap(
    await supabase().rpc('get_availability', { p_location_id: locationId, p_date: date }),
  ) as { court_id: string; hour: number }[]
  const taken: Record<string, number[]> = {}
  for (const r of rows) (taken[r.court_id] ??= []).push(r.hour)
  return taken
}

interface LookupRow {
  id: string
  reference: string
  groupId: string | null
  date: string
  startHour: number
  durationHours: number
  status: BookingStatus
  paymentStatus: BookingRow['paymentStatus']
  amount: number
  courtName: string
  locationName: string
  customerName: string
}

function fromLookup(tenantId: string, phone: string, r: LookupRow): BookingRow {
  return {
    id: r.id,
    reference: r.reference,
    groupId: r.groupId,
    tenantId,
    locationId: '',
    courtId: '',
    customerId: '',
    date: r.date,
    startHour: r.startHour,
    durationHours: r.durationHours,
    status: r.status,
    paymentStatus: r.paymentStatus,
    amount: r.amount,
    source: 'online',
    notes: '',
    createdAt: '',
    customerName: r.customerName,
    customerPhone: phone,
    courtName: r.courtName,
    locationName: r.locationName,
  }
}

export async function lookupBooking(
  tenantId: string,
  reference: string,
  phone: string,
): Promise<BookingRow[]> {
  const rows = unwrap(
    await supabase().rpc('lookup_booking', {
      p_tenant_id: tenantId,
      p_reference: reference,
      p_phone: phone,
    }),
  ) as LookupRow[]
  return rows.map((r) => fromLookup(tenantId, phone, r))
}

/** Booking site pre-check (Continue on "Your details"); throws the booking's own message. */
export async function checkBookingLimits(
  tenantId: string,
  slots: BookingSlot[],
  phone: string,
): Promise<void> {
  check(
    // As a player even if staff are signed in (staff aren't limited).
    await publicSupabase().rpc('check_player_limits', {
      p_tenant_id: tenantId,
      p_slots: slots,
      p_customer_phone: phone,
    }),
  )
}

export async function createBookingGroup(
  input: NewBookingGroupInput,
): Promise<CreatedBookingGroup> {
  const client = input.fromBookingSite ? publicSupabase() : supabase()
  const result = unwrap(
    await client.rpc('create_booking_group', {
      p_tenant_id: input.tenantId,
      p_slots: input.slots,
      p_customer_name: input.customer.name,
      p_customer_phone: input.customer.phone,
      p_customer_email: input.customer.email,
      p_notes: input.notes,
      p_source: input.source,
      p_payment_method: input.paymentMethod ?? null,
      p_payment_pending: input.paymentPending ?? false,
    }),
  ) as { reference: string; total: number; bookingIds: string[] }

  // Signed-out players can't read bookings directly; the public lookup
  // (reference + their phone) returns what the confirmation screen shows.
  const bookings = await lookupBooking(input.tenantId, result.reference, input.customer.phone)
  return { reference: result.reference, total: result.total, bookings }
}

export async function createBooking(input: NewBookingInput): Promise<BookingRow> {
  const { courtId, date, startHour, durationHours, ...rest } = input
  const group = await createBookingGroup({
    ...rest,
    slots: [{ courtId, date, startHour, durationHours }],
  })
  return group.bookings[0]!
}

export async function setBookingStatus(id: string, status: BookingStatus): Promise<BookingRow> {
  check(await supabase().rpc('set_booking_status', { p_booking_id: id, p_status: status }))
  return getRow(id)
}

export async function cancelBooking(id: string, refund: boolean): Promise<BookingRow> {
  check(await supabase().rpc('cancel_booking', { p_booking_id: id, p_refund: refund }))
  return getRow(id)
}

export async function markBookingPaid(id: string, method: PaymentMethod): Promise<BookingRow> {
  check(await supabase().rpc('mark_booking_paid', { p_booking_id: id, p_method: method }))
  return getRow(id)
}

export async function rescheduleBooking(id: string, input: RescheduleInput): Promise<BookingRow> {
  check(
    await supabase().rpc('reschedule_booking', {
      p_booking_id: id,
      p_court_id: input.courtId,
      p_date: input.date,
      p_start_hour: input.startHour,
      p_duration_hours: input.durationHours,
    }),
  )
  return getRow(id)
}
