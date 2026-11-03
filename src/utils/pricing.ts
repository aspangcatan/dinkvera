import type { Court } from '@/types/venue'

/**
 * Day / night pricing per court: from `nightStartHour` until closing
 * (including hours past midnight, 24+) the night rate applies, every day.
 * Mirrors public.booking_price() in the database.
 */
export function isNight(court: Court, hour: number): boolean {
  return hour >= court.nightStartHour
}

/** Rate for one hour on a court, in centavos. */
export function hourlyRateFor(court: Court, hour: number): number {
  return isNight(court, hour) ? court.nightRate : court.dayRate
}

/** Total price for a booking, each hour priced on its own (night can start mid-booking). */
export function bookingPrice(court: Court, startHour: number, durationHours: number): number {
  let total = 0
  for (let h = startHour; h < startHour + durationHours; h++) total += hourlyRateFor(court, h)
  return total
}
