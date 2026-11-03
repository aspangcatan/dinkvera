import { usingSupabase } from '@/config/env'

import * as mock from './mock/customerService'
import * as remote from './supabase/customerService'

export type { CustomerInput, CustomerSummary } from './mock/customerService'
export { BUILT_IN_TAG, MAX_CUSTOMER_TAGS, MAX_TAG_LENGTH } from './mock/customerService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<
  typeof mock,
  'listCustomers' | 'getCustomer' | 'saveCustomer' | 'listCustomerTags' | 'saveCustomerTags'
>
const api: Api = usingSupabase ? remote : mock

export const listCustomers = api.listCustomers
export const getCustomer = api.getCustomer
export const saveCustomer = api.saveCustomer
/** The business's own customer tags (without the built-in "New"). */
export const listCustomerTags = api.listCustomerTags
export const saveCustomerTags = api.saveCustomerTags
