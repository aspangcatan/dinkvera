import { usingSupabase } from '@/config/env'

import * as mock from './mock/bookingService'
import * as remote from './supabase/bookingService'

export type {
  BookingDetail,
  BookingFilters,
  BookingRow,
  BookingSlot,
  CreatedBookingGroup,
  DaySchedule,
  NewBookingGroupInput,
  NewBookingInput,
  RescheduleInput,
} from './mock/bookingService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<
  typeof mock,
  | 'listBookings'
  | 'getBookingDetail'
  | 'getDaySchedule'
  | 'getAvailability'
  | 'createBooking'
  | 'createBookingGroup'
  | 'setBookingStatus'
  | 'cancelBooking'
  | 'markBookingPaid'
  | 'rescheduleBooking'
  | 'lookupBooking'
  | 'checkBookingLimits'
>
const api: Api = usingSupabase ? remote : mock

export const listBookings = api.listBookings
export const getBookingDetail = api.getBookingDetail
export const getDaySchedule = api.getDaySchedule
export const getAvailability = api.getAvailability
export const createBooking = api.createBooking
export const createBookingGroup = api.createBookingGroup
export const setBookingStatus = api.setBookingStatus
export const cancelBooking = api.cancelBooking
export const markBookingPaid = api.markBookingPaid
export const rescheduleBooking = api.rescheduleBooking
export const lookupBooking = api.lookupBooking
/** Booking site pre-check once the phone is known; throws the message the booking would. */
export const checkBookingLimits = api.checkBookingLimits

export { MAX_GROUP_SLOTS } from './mock/bookingService'
