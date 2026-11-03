import type { StaffRole } from './staff'

/**
 * A mock signed-in persona. Later this is derived from the Supabase Auth
 * user plus a `memberships` row (tenant + role).
 */
export type Persona =
  | { kind: 'platform_admin'; name: string; email: string }
  | { kind: 'staff'; name: string; email: string; tenantId: string; role: StaffRole }
