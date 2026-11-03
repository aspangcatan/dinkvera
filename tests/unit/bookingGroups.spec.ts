import { describe, expect, it } from 'vitest'

import type { BookingRow } from '@/services/bookingService'
import { groupBookings } from '@/utils/bookingGroups'

function row(over: Partial<BookingRow>): BookingRow {
  return {
    id: 'b1',
    reference: 'MP-01CC33',
    groupId: null,
    tenantId: 't',
    locationId: 'l',
    courtId: 'c1',
    customerId: 'cu',
    date: '2026-11-12',
    startHour: 0,
    durationHours: 3,
    status: 'pending',
    paymentStatus: 'unpaid',
    amount: 45000,
    source: 'online',
    notes: '',
    createdAt: '',
    customerName: 'Asnaui',
    customerPhone: '',
    courtName: 'Court 1',
    locationName: 'Match Pickleball Court',
    ...over,
  }
}

describe('groupBookings', () => {
  it('turns a multi-date booking into one group with every slot and the total', () => {
    const groups = groupBookings([
      row({ id: 'a', groupId: 'g', startHour: 3 }),
      row({ id: 'b', groupId: 'g', courtId: 'c2', courtName: 'Court 2', amount: 90000 }),
      row({ id: 'c', groupId: 'g' }),
      row({ id: 'single', reference: 'MP-ZZZZ', groupId: null }),
    ])
    expect(groups).toHaveLength(2)
    const g = groups.find((x) => x.key === 'g')!
    expect(g.bookings.map((b) => b.id)).toEqual(['c', 'b', 'a']) // midnight court 1, court 2, then 3 AM
    expect(g.total).toBe(45000 + 90000 + 45000)
    expect(g.courtNames).toEqual(['Court 1', 'Court 2'])
    expect(g.status).toBe('pending')
  })

  it('reports mixed status and leaves cancelled slots out of the total', () => {
    const [g] = groupBookings([
      row({ id: 'a', groupId: 'g', status: 'confirmed', paymentStatus: 'paid' }),
      row({
        id: 'b',
        groupId: 'g',
        status: 'cancelled',
        paymentStatus: 'refunded',
        date: '2026-11-13',
      }),
    ])
    expect(g!.status).toBe('mixed')
    expect(g!.paymentStatus).toBe('mixed')
    expect(g!.total).toBe(45000)
    expect(g!.dates).toEqual(['2026-11-12', '2026-11-13'])
  })
})

describe('groupPayments', () => {
  it('shows one transfer for a multi-date booking, with the combined amount', async () => {
    const { groupPayments } = await import('@/utils/bookingGroups')
    const base = {
      tenantId: 't',
      customerId: 'cu',
      method: 'gcash' as const,
      status: 'pending' as const,
      reference: 'GC12345678',
      proofPath: null,
      transactionReference: '',
      createdAt: '',
      paidAt: null,
      bookingReference: 'MP-01CC33',
      bookingDate: '2026-11-12',
      customerName: 'Asnaui',
      locationId: 'l',
    }
    const groups = groupPayments([
      { ...base, id: 'p1', bookingId: 'b1', amount: 45000 },
      { ...base, id: 'p2', bookingId: 'b2', amount: 90000 },
      { ...base, id: 'p3', bookingId: 'b3', amount: 45000 },
      {
        ...base,
        id: 'p4',
        bookingId: 'b4',
        amount: 30000,
        bookingReference: 'MP-OTHER',
        reference: 'GC9',
      },
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ id: 'p1', amount: 180000, count: 3, ids: ['p1', 'p2', 'p3'] })
  })
})
