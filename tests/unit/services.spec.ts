import { describe, expect, it } from 'vitest'

import {
  createBooking,
  createBookingGroup,
  getAvailability,
  getBookingDetail,
  lookupBooking,
} from '@/services/bookingService'
import { approvePayment } from '@/services/paymentService'
import { db } from '@/services/mock/mockDb'
import { getUsage } from '@/services/subscriptionService'
import { saveCourt } from '@/services/venueService'
import { addDays, todayISO } from '@/utils/dates'

/** First free hour on a court on a given day, or null. */
function freeHour(courtId: string, date: string): number | null {
  const court = db.courts.find((c) => c.id === courtId)!
  const loc = db.locations.find((l) => l.id === court.locationId)!
  for (let h = loc.openHour; h < loc.closeHour; h++) {
    const clash = db.bookings.some(
      (b) =>
        b.courtId === courtId &&
        b.date === date &&
        b.status !== 'cancelled' &&
        b.status !== 'no_show' &&
        b.startHour <= h &&
        h < b.startHour + b.durationHours,
    )
    if (!clash) return h
  }
  return null
}

const customer = { name: 'Test Player', phone: '+63 999 123 4567', email: 'test@example.ph' }

describe('booking service', () => {
  const date = addDays(todayISO(), 5)
  const court = db.courts.find((c) => c.tenantId === 'tn_rally' && c.status === 'active')!

  it('creates an online booking that shows as taken and can be looked up', async () => {
    const hour = freeHour(court.id, date)!
    const booking = await createBooking({
      tenantId: 'tn_rally',
      courtId: court.id,
      date,
      startHour: hour,
      durationHours: 1,
      customer,
      notes: '',
      source: 'online',
      paymentMethod: 'gcash',
      paymentPending: true,
    })
    // Rally Point requires prepayment: unverified GCash = pending.
    expect(booking.status).toBe('pending')
    expect(booking.reference).toMatch(/^RP-/)

    const taken = await getAvailability(court.locationId, date)
    expect(taken[court.id]).toContain(hour)

    const found = await lookupBooking('tn_rally', booking.reference, '09991234567')
    expect(found.map((b) => b.id)).toEqual([booking.id])
    expect(await lookupBooking('tn_rally', booking.reference, '09170000000')).toEqual([])
  })

  it('rejects an overlapping booking on the same court', async () => {
    const hour = freeHour(court.id, date)!
    const input = {
      tenantId: 'tn_rally',
      courtId: court.id,
      date,
      startHour: hour,
      durationHours: 1,
      customer,
      notes: '',
      source: 'walk_in' as const,
      paymentMethod: 'cash' as const,
    }
    await createBooking(input)
    await expect(createBooking(input)).rejects.toThrow(/overlaps/)
  })

  it("won't take bookings for a suspended business", async () => {
    const coastCourt = db.courts.find((c) => c.tenantId === 'tn_coast')!
    await expect(
      createBooking({
        tenantId: 'tn_coast',
        courtId: coastCourt.id,
        date,
        startHour: 10,
        durationHours: 1,
        customer,
        notes: '',
        source: 'online',
      }),
    ).rejects.toThrow(/not taking bookings/)
  })
})

describe('plan limits', () => {
  it('blocks adding a court past the Starter limit', async () => {
    // Kitchen Line is on Starter (4 courts) and already has 4.
    const courts = (await getUsage('tn_kitchen')).find((u) => u.key === 'courts')!
    expect(courts.used).toBe(courts.limit)
    await expect(
      saveCourt('tn_kitchen', {
        name: 'Court 5',
        locationId: 'loc_kl_lanang',
        type: 'outdoor',
        surface: 'Acrylic',
        dayRate: 20000,
        nightRate: 30000,
        nightStartHour: 17,
        status: 'active',
        features: [],
      }),
    ).rejects.toThrow(/Upgrade/)
  })
})

describe('multi-date bookings', () => {
  const court = db.courts.find((c) => c.tenantId === 'tn_rally' && c.status === 'active')!
  const dates = [addDays(todayISO(), 8), addDays(todayISO(), 9)]

  it('books several dates under one reference and approves them with one payment', async () => {
    const slots = dates.map((date) => ({
      courtId: court.id,
      date,
      startHour: freeHour(court.id, date)!,
      durationHours: 1,
    }))
    const group = await createBookingGroup({
      tenantId: 'tn_rally',
      slots,
      customer: { name: 'Group Player', phone: '+63 999 765 4321', email: '' },
      notes: '',
      source: 'online',
      paymentMethod: 'gcash',
      paymentPending: true,
    })
    expect(group.bookings).toHaveLength(2)
    expect(new Set(group.bookings.map((b) => b.reference))).toEqual(new Set([group.reference]))
    expect(group.total).toBe(group.bookings[0]!.amount + group.bookings[1]!.amount)

    const found = await lookupBooking('tn_rally', group.reference, '09997654321')
    expect(found).toHaveLength(2)

    const detail = await getBookingDetail(group.bookings[0]!.id)
    expect(detail.siblings.map((s) => s.id)).toEqual([group.bookings[1]!.id])

    // Approving the GCash proof on one date confirms every date in the group.
    await approvePayment(detail.payments[0]!.id)
    const after = await lookupBooking('tn_rally', group.reference, '09997654321')
    expect(after.every((b) => b.status === 'confirmed' && b.paymentStatus === 'paid')).toBe(true)
  })

  it('creates nothing when one of the picks is taken or two picks overlap', async () => {
    const date = addDays(todayISO(), 10)
    const hour = freeHour(court.id, date)!
    const before = db.bookings.length
    const base = {
      tenantId: 'tn_rally',
      customer,
      notes: '',
      source: 'online' as const,
    }
    await expect(
      createBookingGroup({
        ...base,
        slots: [
          { courtId: court.id, date, startHour: hour, durationHours: 1 },
          { courtId: court.id, date, startHour: hour, durationHours: 1 },
        ],
      }),
    ).rejects.toThrow(/overlap/)
    expect(db.bookings.length).toBe(before)
  })
})

describe('payment proofs (mock)', () => {
  it('attaches a screenshot to every pending payment of the booking, only with the right phone', async () => {
    const { attachPaymentProof } = await import('@/services/paymentService')
    const court = db.courts.find((c) => c.tenantId === 'tn_dink' && c.status === 'active')!
    const dates = [addDays(todayISO(), 6), addDays(todayISO(), 7)]
    const group = await createBookingGroup({
      tenantId: 'tn_dink',
      slots: dates.map((date) => ({
        courtId: court.id,
        date,
        startHour: freeHour(court.id, date)!,
        durationHours: 1,
      })),
      customer: { name: 'Proof Player', phone: '0917 444 5555', email: '' },
      notes: '',
      source: 'online',
      paymentMethod: 'gcash',
      paymentPending: true,
    })
    await expect(
      attachPaymentProof('tn_dink', group.reference, '0917 000 0000', 'proof.png'),
    ).rejects.toThrow(/No payment waiting/)
    expect(
      await attachPaymentProof('tn_dink', group.reference, '09174445555', 'proof.png', 'GC-1'),
    ).toBe(2)
    const payments = db.payments.filter((p) => group.bookings.some((b) => b.id === p.bookingId))
    expect(
      payments.every((p) => p.proofPath === 'proof.png' && p.transactionReference === 'GC-1'),
    ).toBe(true)
  })
})
