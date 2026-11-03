import type { BadgeTone } from '@/types/ui'
import type { InvoiceStatus, SubscriptionStatus, TrialRequestStatus } from '@/types/billing'
import type {
  BookingSource,
  BookingStatus,
  PaymentRecordStatus,
  PaymentStatus,
} from '@/types/booking'
import type { StaffStatus } from '@/types/staff'
import type { PaymentMethod, PlatformAccountMethod, TenantStatus } from '@/types/tenant'
import type { CourtStatus, CourtType, LocationStatus } from '@/types/venue'

/** Label + badge tone for every status the UI shows. Color is never the only signal. */
type StatusMap<K extends string> = Record<K, { label: string; tone: BadgeTone }>

export const bookingStatus: StatusMap<BookingStatus> = {
  pending: { label: 'Awaiting payment', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  no_show: { label: 'No-show', tone: 'danger' },
}

export const paymentStatus: StatusMap<PaymentStatus> = {
  unpaid: { label: 'Unpaid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  refunded: { label: 'Refunded', tone: 'info' },
}

export const paymentRecordStatus: StatusMap<PaymentRecordStatus> = {
  paid: { label: 'Paid', tone: 'success' },
  pending: { label: 'Needs review', tone: 'warning' },
  refunded: { label: 'Refunded', tone: 'info' },
  failed: { label: 'Failed', tone: 'danger' },
}

export const tenantStatus: StatusMap<TenantStatus> = {
  active: { label: 'Active', tone: 'success' },
  trialing: { label: 'Trial', tone: 'info' },
  past_due: { label: 'Past due', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export const subscriptionStatus: StatusMap<SubscriptionStatus> = {
  active: { label: 'Active', tone: 'success' },
  trialing: { label: 'Trial', tone: 'info' },
  past_due: { label: 'Past due', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

/** "review": proof sent, waiting for Sideline (see invoiceDisplayStatus). */
export const invoiceStatus: StatusMap<InvoiceStatus | 'review'> = {
  paid: { label: 'Paid', tone: 'success' },
  review: { label: 'Under review', tone: 'warning' },
  open: { label: 'Open', tone: 'info' },
  overdue: { label: 'Overdue', tone: 'danger' },
  void: { label: 'Void', tone: 'neutral' },
}

export const courtStatus: StatusMap<CourtStatus> = {
  active: { label: 'Open', tone: 'success' },
  maintenance: { label: 'Maintenance', tone: 'warning' },
  inactive: { label: 'Inactive', tone: 'neutral' },
}

export const locationStatus: StatusMap<LocationStatus> = {
  active: { label: 'Open', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
}

export const staffStatus: StatusMap<StaffStatus> = {
  active: { label: 'Active', tone: 'success' },
  invited: { label: 'Invited', tone: 'info' },
  disabled: { label: 'Disabled', tone: 'neutral' },
}

export const courtTypeLabels: Record<CourtType, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  covered: 'Covered',
}

export const sourceLabels: Record<BookingSource, string> = {
  online: 'Online',
  walk_in: 'Walk-in',
  phone: 'Phone',
}

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  gcash: 'GCash',
  maya: 'Maya',
  card: 'Credit / debit card',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
}

/** Invoice status as shown: unpaid invoices with proof waiting read "Under review". */
export function invoiceDisplayStatus(invoice: {
  status: InvoiceStatus
  proofSubmittedAt: string | null
}): InvoiceStatus | 'review' {
  return invoice.proofSubmittedAt && (invoice.status === 'open' || invoice.status === 'overdue')
    ? 'review'
    : invoice.status
}

export const trialRequestStatus: StatusMap<TrialRequestStatus> = {
  new: { label: 'New', tone: 'info' },
  contacted: { label: 'Contacted', tone: 'warning' },
  converted: { label: 'Business added', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
}

/** Sideline's own payment options for invoices (incl. one QR Ph code). */
export const platformMethodLabels: Record<PlatformAccountMethod, string> = {
  qrph: 'QR Ph',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank transfer',
}
