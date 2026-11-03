import { fetchAll, supabase, unwrap, unwrapMaybe } from '@/lib/supabase/client'
import type { Customer } from '@/types/booking'

import {
  cleanCustomerTags,
  DEFAULT_CUSTOMER_TAGS,
  type CustomerInput,
  type CustomerSummary,
} from '../mock/customerService'
import { toCustomer, toCustomerSummary } from './mappers'

export async function listCustomers(tenantId: string): Promise<CustomerSummary[]> {
  const rows = await fetchAll((from, to) =>
    supabase()
      .from('customer_summaries')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, to),
  )
  return rows.map(toCustomerSummary)
}

export async function getCustomer(id: string): Promise<Customer> {
  return toCustomer(unwrap(await supabase().from('customers').select('*').eq('id', id).single()))
}

export async function saveCustomer(
  tenantId: string,
  input: CustomerInput,
  id?: string,
): Promise<Customer> {
  const row = { name: input.name, email: input.email, phone: input.phone, tags: input.tags }
  const query = id
    ? supabase().from('customers').update(row).eq('id', id)
    : supabase()
        .from('customers')
        .insert({ ...row, tenant_id: tenantId })
  return toCustomer(unwrap(await query.select('*').single()))
}

/** The business's own tags (without the built-in "New"); no row yet = the defaults. */
export async function listCustomerTags(tenantId: string): Promise<string[]> {
  const row = unwrapMaybe<{ tags: string[] }>(
    await supabase()
      .from('customer_tag_lists')
      .select('tags')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  )
  return row ? row.tags : DEFAULT_CUSTOMER_TAGS
}

/**
 * Update the list, or create it the first time. Not an upsert: that would
 * also rewrite tenant_id, which business accounts may not update.
 */
export async function saveCustomerTags(tenantId: string, tags: string[]): Promise<string[]> {
  const cleaned = cleanCustomerTags(tags)
  const updated = unwrapMaybe<{ tags: string[] }>(
    await supabase()
      .from('customer_tag_lists')
      .update({ tags: cleaned })
      .eq('tenant_id', tenantId)
      .select('tags')
      .maybeSingle(),
  )
  if (updated) return updated.tags
  const row = unwrap<{ tags: string[] }>(
    await supabase()
      .from('customer_tag_lists')
      .insert({ tenant_id: tenantId, tags: cleaned })
      .select('tags')
      .single(),
  )
  return row.tags
}
