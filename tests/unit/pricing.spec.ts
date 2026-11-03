import { describe, expect, it } from 'vitest'

import type { Court } from '@/types/venue'
import { bookingPrice, hourlyRateFor, isNight } from '@/utils/pricing'

const court: Court = {
  id: 'c1',
  tenantId: 't1',
  locationId: 'l1',
  name: 'Court 1',
  type: 'outdoor',
  surface: '',
  dayRate: 15000,
  nightRate: 25000,
  nightStartHour: 16,
  status: 'active',
  features: [],
}

describe('day / night pricing', () => {
  it('switches to the night rate at the court’s night start', () => {
    expect(isNight(court, 15)).toBe(false)
    expect(isNight(court, 16)).toBe(true)
    expect(hourlyRateFor(court, 9)).toBe(15000)
    expect(hourlyRateFor(court, 20)).toBe(25000)
  })

  it('prices each hour on its own, including after midnight', () => {
    expect(bookingPrice(court, 15, 2)).toBe(15000 + 25000)
    expect(bookingPrice(court, 23, 3)).toBe(3 * 25000) // 11 PM – 2 AM
  })
})

describe('formatOpeningHours', () => {
  it('reads naturally for normal, overnight and 24-hour locations', async () => {
    const { formatOpeningHours } = await import('@/utils/dates')
    expect(formatOpeningHours(6, 22)).toBe('6 AM – 10 PM')
    expect(formatOpeningHours(17, 26)).toBe('5 PM – 2 AM (next day)')
    expect(formatOpeningHours(0, 24)).toBe('Open 24 hours')
    expect(formatOpeningHours(0, 25)).toBe('Open 24 hours')
  })
})
