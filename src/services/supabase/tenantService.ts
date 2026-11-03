import { check, supabase, unwrap, unwrapMaybe } from '@/lib/supabase/client'
import type { Tenant, TenantStatus } from '@/types/tenant'

import type { NewTenantInput, TenantPatch } from '../mock/tenantService'
import { fromBookingRules, TENANT_SELECT, toTenant } from './mappers'

export async function listTenants(): Promise<Tenant[]> {
  const rows = unwrap(await supabase().from('tenants').select(TENANT_SELECT).order('name'))
  return rows.map(toTenant)
}

export async function getTenant(id: string): Promise<Tenant> {
  return toTenant(
    unwrap(await supabase().from('tenants').select(TENANT_SELECT).eq('id', id).single()),
  )
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const row = unwrapMaybe(
    await supabase().from('tenants').select(TENANT_SELECT).eq('slug', slug).maybeSingle(),
  )
  return row ? toTenant(row) : null
}

export async function updateTenant(id: string, patch: TenantPatch): Promise<Tenant> {
  const { branding, bookingRules, ...profile } = patch
  const row: Record<string, unknown> = {}
  const columns: Record<string, string> = {
    name: 'name',
    legalName: 'legal_name',
    phone: 'phone',
    city: 'city',
    about: 'about',
    ownerEmail: 'owner_email',
    ownerName: 'owner_name',
    policies: 'policies',
  }
  for (const [key, value] of Object.entries(profile)) {
    if (value !== undefined && columns[key]) row[columns[key]] = value
  }
  if (branding) {
    if (branding.primary !== undefined) row.brand_primary = branding.primary
    if (branding.accent !== undefined) row.brand_accent = branding.accent
    if (branding.monogram !== undefined) row.brand_monogram = branding.monogram
    if (branding.tagline !== undefined) row.brand_tagline = branding.tagline
    if (branding.heroStyle !== undefined) row.hero_style = branding.heroStyle
  }
  if (Object.keys(row).length) {
    unwrap(await supabase().from('tenants').update(row).eq('id', id).select('id').single())
  }
  if (bookingRules) {
    unwrap(
      await supabase()
        .from('booking_rules')
        .update(fromBookingRules(bookingRules))
        .eq('tenant_id', id)
        .select('tenant_id')
        .single(),
    )
  }
  return getTenant(id)
}

export async function setTenantStatus(id: string, status: TenantStatus): Promise<Tenant> {
  check(await supabase().rpc('set_tenant_status', { p_tenant_id: id, p_status: status }))
  return getTenant(id)
}

export async function createTenant(input: NewTenantInput): Promise<Tenant> {
  const id = unwrap(
    await supabase().rpc('create_tenant', {
      p_name: input.name,
      p_owner_name: input.ownerName,
      p_owner_email: input.ownerEmail,
      p_phone: input.phone,
      p_city: input.city,
      p_plan_id: input.planId,
      p_brand_primary: input.primary,
    }),
  ) as string
  return getTenant(id)
}
