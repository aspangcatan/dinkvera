import { usingSupabase } from '@/config/env'

import * as mock from './mock/trialRequestService'
import * as remote from './supabase/trialRequestService'

export type { TrialRequestInput } from './mock/trialRequestService'

/** Mock data or Sideline's Supabase project (see src/config/env.ts). Same API either way. */
type Api = Pick<typeof mock, 'submitTrialRequest' | 'listTrialRequests' | 'setTrialRequestStatus'>
const api: Api = usingSupabase ? remote : mock

/** Marketing site: a court owner asks for a free trial. */
export const submitTrialRequest = api.submitTrialRequest
export const listTrialRequests = api.listTrialRequests
export const setTrialRequestStatus = api.setTrialRequestStatus
