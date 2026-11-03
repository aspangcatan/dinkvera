import { usingSupabase } from '@/config/env'

import * as mock from './mock/accountService'
import * as remote from './supabase/accountService'

export type { AccountInput } from './mock/accountService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<typeof mock, 'listAccounts' | 'addAccount' | 'setAccountStatus' | 'removeAccount'>
const api: Api = usingSupabase ? remote : mock

export const listAccounts = api.listAccounts
export const addAccount = api.addAccount
export const setAccountStatus = api.setAccountStatus
export const removeAccount = api.removeAccount
