import { usingSupabase } from '@/config/env'

import * as mock from './mock/tenantService'
import * as remote from './supabase/tenantService'

export type { NewTenantInput, TenantPatch } from './mock/tenantService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<
  typeof mock,
  | 'listTenants'
  | 'getTenant'
  | 'getTenantBySlug'
  | 'updateTenant'
  | 'setTenantStatus'
  | 'createTenant'
>
const api: Api = usingSupabase ? remote : mock

export const listTenants = api.listTenants
export const getTenant = api.getTenant
export const getTenantBySlug = api.getTenantBySlug
export const updateTenant = api.updateTenant
export const setTenantStatus = api.setTenantStatus
export const createTenant = api.createTenant
