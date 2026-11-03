import type { StaffMember, StaffStatus } from '@/types/staff'
import { newId } from '@/utils/ids'

import { db, findOrThrow, respond, ServiceError } from './mockDb'

/**
 * Business accounts: the logins that run a business site, all with full
 * access. Only a platform admin manages them (Super Admin → business).
 */
export async function listAccounts(tenantId: string): Promise<StaffMember[]> {
  return respond(db.staff.filter((s) => s.tenantId === tenantId))
}

export type AccountInput = Pick<StaffMember, 'name' | 'email' | 'phone'>

/** New accounts start as `invited` until someone signs in with that email. */
export async function addAccount(tenantId: string, input: AccountInput): Promise<StaffMember> {
  const email = input.email.trim().toLowerCase()
  if (db.staff.some((s) => s.tenantId === tenantId && s.email.toLowerCase() === email)) {
    throw new ServiceError('This business already has an account with this email.', 'conflict')
  }
  const account: StaffMember = {
    ...input,
    email,
    id: newId('stf'),
    tenantId,
    role: 'owner',
    status: 'invited',
    lastActiveAt: null,
  }
  db.staff.push(account)
  return respond(account)
}

/** Keeps at least one working login on every business. */
export function assertNotLastActive(accounts: StaffMember[], id: string): void {
  const others = accounts.filter((s) => s.id !== id && s.status !== 'disabled')
  if (!others.length) {
    throw new ServiceError('A business needs at least one account that can sign in.', 'invalid')
  }
}

export async function setAccountStatus(id: string, status: StaffStatus): Promise<StaffMember> {
  const account = findOrThrow(db.staff, id, 'Account')
  if (status === 'disabled') {
    assertNotLastActive(
      db.staff.filter((s) => s.tenantId === account.tenantId),
      id,
    )
  }
  account.status = status
  return respond(account)
}

export async function removeAccount(id: string): Promise<void> {
  const account = findOrThrow(db.staff, id, 'Account')
  assertNotLastActive(
    db.staff.filter((s) => s.tenantId === account.tenantId),
    id,
  )
  db.staff = db.staff.filter((s) => s.id !== id)
  await respond(null)
}
