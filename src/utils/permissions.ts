import type { Permission, StaffRole } from '@/types/staff'

/**
 * What a business account can open in the tenant dashboard: everything.
 * A UI convenience only; RLS (role_permissions in the database) enforces
 * the same list.
 */
export const rolePermissions: Record<StaffRole, Permission[]> = {
  owner: [
    'dashboard',
    'calendar',
    'bookings',
    'customers',
    'payments',
    'venues',
    'reports',
    'settings',
    'billing',
  ],
}

export const roleLabels: Record<StaffRole, string> = {
  owner: 'Business account',
}

export function can(role: StaffRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission)
}
