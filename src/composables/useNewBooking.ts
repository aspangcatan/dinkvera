import { inject, ref, type InjectionKey, type Ref } from 'vue'

export interface NewBookingPrefill {
  locationId?: string
  courtId?: string
  date?: string
  startHour?: number
  customer?: { name: string; email: string; phone: string }
}

/**
 * The tenant layout owns one "New booking" modal. Pages open it with a
 * prefill (e.g. the calendar slot that was clicked) and watch
 * `bookingsVersion` to reload after a booking is created.
 */
export const openNewBookingKey: InjectionKey<(prefill?: NewBookingPrefill) => void> =
  Symbol('openNewBooking')
export const bookingsVersionKey: InjectionKey<Ref<number>> = Symbol('bookingsVersion')

export function useNewBooking() {
  return {
    openNewBooking: inject(openNewBookingKey, () => {}),
    bookingsVersion: inject(bookingsVersionKey, ref(0)),
  }
}
