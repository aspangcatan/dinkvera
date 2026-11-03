import { check, supabase, unwrap } from '@/lib/supabase/client'
import type { TrialRequest, TrialRequestStatus } from '@/types/billing'

import type { TrialRequestInput } from '../mock/trialRequestService'
import { toTrialRequest } from './mappers'

export async function submitTrialRequest(input: TrialRequestInput): Promise<void> {
  check(
    await supabase().rpc('submit_trial_request', {
      p_business_name: input.businessName,
      p_contact_name: input.contactName,
      p_email: input.email,
      p_phone: input.phone,
      p_city: input.city,
      p_courts: input.courts,
      p_message: input.message,
      p_plan_id: input.planId,
    }),
  )
}

export async function listTrialRequests(): Promise<TrialRequest[]> {
  return unwrap(
    await supabase().from('trial_requests').select('*').order('created_at', { ascending: false }),
  ).map(toTrialRequest)
}

export async function setTrialRequestStatus(id: string, status: TrialRequestStatus): Promise<void> {
  check(await supabase().rpc('set_trial_request_status', { p_request_id: id, p_status: status }))
}
