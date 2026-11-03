import type { Booking, BookingSource, BookingStatus, PaymentStatus } from '@/types/booking'
import { addDays, isWeekend, todayISO } from '@/utils/dates'
import { bookingReference } from '@/utils/ids'
import { bookingPrice } from '@/utils/pricing'
import { createRandom, hashString } from '@/utils/random'

import { courtSeed } from './courts'
import { customerSeed } from './customers'
import { locationSeed } from './locations'
import { tenantSeed } from './tenants'

/** Busy-ness per tenant: rough share of open hours that get booked. */
const demand: Record<string, number> = {
  tn_rally: 0.42,
  tn_dink: 0.48,
  tn_kitchen: 0.36,
  tn_baseline: 0.22,
  tn_paddle: 0.5,
  tn_thirdshot: 0.25,
  tn_coast: 0.3,
}

const PAST_DAYS = 75
const FUTURE_DAYS = 21

/**
 * Generates a realistic booking history per court: busier evenings and
 * weekends, completed/cancelled/no-show in the past, confirmed/pending in
 * the future. Bookings never overlap on the same court.
 */
function build(): Booking[] {
  const today = todayISO()
  const nowHour = new Date().getHours()
  const bookings: Booking[] = []
  let seq = 0

  for (const court of courtSeed) {
    if (court.status === 'inactive') continue
    const tenant = tenantSeed.find((t) => t.id === court.tenantId)!
    const location = locationSeed.find((l) => l.id === court.locationId)!
    const customers = customerSeed.filter((c) => c.tenantId === tenant.id)
    const rand = createRandom(hashString(court.id))
    const base = demand[tenant.id] ?? 0.3

    // A suspended tenant stopped taking bookings ~40 days ago; a trialing
    // one only started recently.
    const firstDay = tenant.status === 'trialing' ? -9 : -PAST_DAYS
    const lastDay = tenant.status === 'suspended' ? -40 : FUTURE_DAYS

    for (let offset = firstDay; offset <= lastDay; offset++) {
      const date = addDays(today, offset)
      // Courts under maintenance have been closed for the last week.
      if (court.status === 'maintenance' && offset > -7) continue

      let hour = location.openHour
      while (hour < location.closeHour) {
        const evening = hour >= 17 && hour <= 21
        const morning = hour >= 6 && hour <= 8
        let p = base * (evening ? 1.7 : morning ? 1.15 : 0.6)
        if (isWeekend(date)) p *= 1.3
        // Fewer bookings the further into the future.
        if (offset > 0) p *= Math.max(0.15, 1 - offset / (FUTURE_DAYS + 4))

        if (!rand.chance(Math.min(p, 0.95))) {
          hour += 1
          continue
        }

        const duration = Math.min(
          rand.chance(0.6) ? 1 : rand.chance(0.75) ? 2 : 3,
          location.closeHour - hour,
        )
        const isPast = offset < 0 || (offset === 0 && hour + duration <= nowHour)
        const source: BookingSource = rand.chance(0.7)
          ? 'online'
          : rand.chance(0.5)
            ? 'walk_in'
            : 'phone'

        let status: BookingStatus
        if (isPast) {
          const r = rand.next()
          status = r < 0.88 ? 'completed' : r < 0.95 ? 'cancelled' : 'no_show'
        } else {
          status = offset <= 3 && source === 'online' && rand.chance(0.22) ? 'pending' : 'confirmed'
          if (rand.chance(0.04)) status = 'cancelled'
        }

        let paymentStatus: PaymentStatus = 'paid'
        if (status === 'pending') paymentStatus = 'unpaid'
        if (status === 'cancelled') paymentStatus = rand.chance(0.5) ? 'refunded' : 'unpaid'
        if (status === 'confirmed' && !tenant.bookingRules.requirePrepayment && rand.chance(0.45)) {
          paymentStatus = 'unpaid'
        }

        const customer = rand.pick(customers)
        const leadDate = addDays(date, -rand.int(0, 6))
        const createdDate = leadDate > today ? today : leadDate
        bookings.push({
          id: `bk_${(++seq).toString(36).padStart(5, '0')}`,
          reference: bookingReference(tenant.branding.monogram, rand.next),
          groupId: null,
          tenantId: tenant.id,
          locationId: location.id,
          courtId: court.id,
          customerId: customer.id,
          date,
          startHour: hour,
          durationHours: duration,
          status,
          paymentStatus,
          amount: bookingPrice(court, hour, duration),
          source,
          notes: rand.chance(0.08) ? rand.pick(NOTES) : '',
          createdAt: `${createdDate}T${String(rand.int(7, 22)).padStart(2, '0')}:${String(rand.int(0, 59)).padStart(2, '0')}:00`,
        })
        hour += duration
      }
    }
  }
  return bookings
}

const NOTES = [
  'Bringing own paddles',
  'Birthday group, may need extra chairs',
  'Beginner group — asked about coaching',
  'Corporate team, invoice to company',
  'Requested court near the entrance',
  'Paddle rental for 4',
]

export const bookingSeed: Booking[] = build()
