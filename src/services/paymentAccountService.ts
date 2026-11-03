import { usingSupabase } from '@/config/env'

import * as mock from './mock/paymentAccountService'
import * as remote from './supabase/paymentAccountService'

export type { PaymentAccountInput } from './mock/paymentAccountService'
export { QR_MAX_BYTES, QR_TYPES } from './mock/paymentAccountService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<
  typeof mock,
  | 'listPaymentAccounts'
  | 'savePaymentAccount'
  | 'uploadPaymentQr'
  | 'removePaymentQr'
  | 'listPlatformPaymentAccounts'
  | 'savePlatformPaymentAccount'
  | 'uploadPlatformPaymentQr'
  | 'removePlatformPaymentQr'
>
const api: Api = usingSupabase ? remote : mock

export const listPaymentAccounts = api.listPaymentAccounts
export const savePaymentAccount = api.savePaymentAccount
export const uploadPaymentQr = api.uploadPaymentQr
export const removePaymentQr = api.removePaymentQr
/** Sideline's own accounts, where businesses pay their invoices. */
export const listPlatformPaymentAccounts = api.listPlatformPaymentAccounts
export const savePlatformPaymentAccount = api.savePlatformPaymentAccount
export const uploadPlatformPaymentQr = api.uploadPlatformPaymentQr
export const removePlatformPaymentQr = api.removePlatformPaymentQr
