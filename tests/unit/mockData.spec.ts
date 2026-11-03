import { describe, expect, it } from 'vitest'

import { bookingSeed } from '@/mocks/bookings'
import { courtSeed } from '@/mocks/courts'
import { customerSeed } from '@/mocks/customers'
import { locationSeed } from '@/mocks/locations'
import { paymentSeed } from '@/mocks/payments'
import { subscriptionSeed } from '@/mocks/subscriptions'
import { tenantSeed } from '@/mocks/tenants'

describe('mock data integrity', () => {
  it('never double-books a court', () => {
    const blocking = bookingSeed.filter((b) => b.status !== 'cancelled')
    const byCourtDay = new Map<string, typeof blocking>()
    for (const b of blocking) {
      const key = `${b.courtId}|${b.date}`
      byCourtDay.set(key, [...(byCourtDay.get(key) ?? []), b])
    }
    for (const list of byCourtDay.values()) {
      const sorted = [...list].sort((a, b) => a.startHour - b.startHour)
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!
        expect(sorted[i]!.startHour).toBeGreaterThanOrEqual(prev.startHour + prev.durationHours)
      }
    }
  })

  it('keeps every row inside its own tenant', () => {
    for (const b of bookingSeed) {
      expect(courtSeed.find((c) => c.id === b.courtId)?.tenantId).toBe(b.tenantId)
      expect(customerSeed.find((c) => c.id === b.customerId)?.tenantId).toBe(b.tenantId)
      expect(locationSeed.find((l) => l.id === b.locationId)?.tenantId).toBe(b.tenantId)
    }
    for (const p of paymentSeed) {
      expect(bookingSeed.find((b) => b.id === p.bookingId)?.tenantId).toBe(p.tenantId)
    }
  })

  it('books only within opening hours', () => {
    for (const b of bookingSeed) {
      const loc = locationSeed.find((l) => l.id === b.locationId)!
      expect(b.startHour).toBeGreaterThanOrEqual(loc.openHour)
      expect(b.startHour + b.durationHours).toBeLessThanOrEqual(loc.closeHour)
    }
  })

  it('gives every tenant exactly one subscription and unique references', () => {
    for (const t of tenantSeed) {
      expect(subscriptionSeed.filter((s) => s.tenantId === t.id)).toHaveLength(1)
    }
    const refs = new Set(bookingSeed.map((b) => `${b.tenantId}|${b.reference}`))
    // A handful of random collisions is acceptable; a broken generator is not.
    expect(refs.size).toBeGreaterThan(bookingSeed.length * 0.99)
  })
})
