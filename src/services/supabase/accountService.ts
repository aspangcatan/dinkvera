import { supabase, toError, unwrap } from '@/lib/supabase/client'
import type { StaffMember, StaffStatus } from '@/types/staff'

import { assertNotLastActive, type AccountInput } from '../mock/accountService'
import { toStaff } from './mappers'

export async function listAccounts(tenantId: string): Promise<StaffMember[]> {
  return unwrap(
    await supabase()
      .from('staff_members')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at'),
  ).map(toStaff)
}

/**
 * Adds an account as `invited` (platform admins only, enforced by RLS). It
 * becomes active when a login with the same email exists: created in
 * Supabase Auth → Users for now.
 */
export async function addAccount(tenantId: string, input: AccountInput): Promise<StaffMember> {
  const row = unwrap<Record<string, unknown>>(
    await supabase()
      .from('staff_members')
      .insert({
        tenant_id: tenantId,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        role: 'owner',
      })
      .select('*')
      .single(),
  )
  return toStaff(row)
}

async function siblings(id: string): Promise<StaffMember[]> {
  const { tenant_id } = unwrap<{ tenant_id: string }>(
    await supabase().from('staff_members').select('tenant_id').eq('id', id).single(),
  )
  return listAccounts(tenant_id)
}

export async function setAccountStatus(id: string, status: StaffStatus): Promise<StaffMember> {
  if (status === 'disabled') assertNotLastActive(await siblings(id), id)
  return toStaff(
    unwrap(
      await supabase().from('staff_members').update({ status }).eq('id', id).select('*').single(),
    ),
  )
}

export async function removeAccount(id: string): Promise<void> {
  assertNotLastActive(await siblings(id), id)
  const { error } = await supabase().from('staff_members').delete().eq('id', id)
  if (error) throw toError(error)
}
