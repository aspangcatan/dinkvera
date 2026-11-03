/**
 * Everyone attached to a business has full access to it. Accounts are
 * added only by a platform admin (Super Admin → business → Business accounts).
 */
export type StaffRole = 'owner'
export type StaffStatus = 'active' | 'invited' | 'disabled'

export interface StaffMember {
  id: string
  tenantId: string
  name: string
  email: string
  phone: string
  role: StaffRole
  status: StaffStatus
  lastActiveAt: string | null
}

/** Areas of the tenant dashboard. */
export type Permission =
  | 'dashboard'
  | 'calendar'
  | 'bookings'
  | 'customers'
  | 'payments'
  | 'venues'
  | 'reports'
  | 'settings'
  | 'billing'
