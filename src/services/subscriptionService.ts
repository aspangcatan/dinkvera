import { usingSupabase } from '@/config/env'

import * as mock from './mock/subscriptionService'
import * as remote from './supabase/subscriptionService'

export type {
  BillingRunResult,
  InvoiceFilters,
  PlanRequestFilters,
} from './mock/subscriptionService'
export { PROOF_MAX_BYTES, PROOF_TYPES } from './mock/subscriptionService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<
  typeof mock,
  | 'listPlans'
  | 'updatePlan'
  | 'listSubscriptions'
  | 'getSubscription'
  | 'changePlan'
  | 'listPlanRequests'
  | 'requestPlanChange'
  | 'cancelPlanRequest'
  | 'decidePlanRequest'
  | 'setCancelAtPeriodEnd'
  | 'listInvoices'
  | 'markInvoicePaid'
  | 'uploadInvoiceProof'
  | 'submitInvoicePayment'
  | 'reviewInvoicePayment'
  | 'getInvoiceProofUrl'
  | 'startInvoiceCheckout'
  | 'syncInvoiceCheckout'
  | 'runBillingCycle'
  | 'getUsage'
>
const api: Api = usingSupabase ? remote : mock

export const listPlans = api.listPlans
export const updatePlan = api.updatePlan
export const listSubscriptions = api.listSubscriptions
export const getSubscription = api.getSubscription
export const changePlan = api.changePlan
export const listPlanRequests = api.listPlanRequests
export const requestPlanChange = api.requestPlanChange
export const cancelPlanRequest = api.cancelPlanRequest
export const decidePlanRequest = api.decidePlanRequest
export const setCancelAtPeriodEnd = api.setCancelAtPeriodEnd
export const listInvoices = api.listInvoices
export const markInvoicePaid = api.markInvoicePaid
export const uploadInvoiceProof = api.uploadInvoiceProof
export const submitInvoicePayment = api.submitInvoicePayment
export const reviewInvoicePayment = api.reviewInvoicePayment
export const getInvoiceProofUrl = api.getInvoiceProofUrl
/** Online payment through PayMongo checkout, confirmed automatically. */
export const startInvoiceCheckout = api.startInvoiceCheckout
export const syncInvoiceCheckout = api.syncInvoiceCheckout
/** Platform admin: run the daily billing job now. */
export const runBillingCycle = api.runBillingCycle
export const getUsage = api.getUsage
