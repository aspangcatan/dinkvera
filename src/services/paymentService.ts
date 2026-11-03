import { usingSupabase } from '@/config/env'

import * as mock from './mock/paymentService'
import * as remote from './supabase/paymentService'

export type { PaymentFilters, PaymentRow } from './mock/paymentService'
export { PROOF_MAX_BYTES, PROOF_TYPES } from './mock/paymentService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<
  typeof mock,
  | 'listPayments'
  | 'countPendingPayments'
  | 'approvePayment'
  | 'rejectPayment'
  | 'refundPayment'
  | 'uploadPaymentProof'
  | 'attachPaymentProof'
  | 'getProofUrl'
>
const api: Api = usingSupabase ? remote : mock

export const listPayments = api.listPayments
export const countPendingPayments = api.countPendingPayments
export const approvePayment = api.approvePayment
export const rejectPayment = api.rejectPayment
export const refundPayment = api.refundPayment
export const uploadPaymentProof = api.uploadPaymentProof
export { assertProofFile } from './mock/paymentService'
export const attachPaymentProof = api.attachPaymentProof
export const getProofUrl = api.getProofUrl
