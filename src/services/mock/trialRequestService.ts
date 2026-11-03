import type { PlanId, TrialRequest, TrialRequestStatus } from '@/types/billing'
import { newId } from '@/utils/ids'

import { db, findOrThrow, respond, ServiceError } from './mockDb'

export interface TrialRequestInput {
  businessName: string
  contactName: string
  email: string
  phone: string
  city: string
  courts: number | null
  message: string
  /** Plan they want to try; null = not sure. */
  planId: PlanId | null
}

/** Marketing site (signed out). Same checks as submit_trial_request. */
export async function submitTrialRequest(input: TrialRequestInput): Promise<void> {
  const email = input.email.trim().toLowerCase()
  if (!input.businessName.trim() || !input.contactName.trim()) {
    throw new ServiceError('Enter your business name and your name.', 'invalid')
  }
  if (!/^\S+@\S+\.\S+$/.test(email))
    throw new ServiceError('Enter a valid email address.', 'invalid')
  if (input.courts !== null && (input.courts < 1 || input.courts > 500)) {
    throw new ServiceError('Enter how many courts you have (1–500).', 'invalid')
  }
  db.trialRequests.push({
    id: newId('trq'),
    businessName: input.businessName.trim().slice(0, 100),
    contactName: input.contactName.trim().slice(0, 100),
    email,
    phone: input.phone.trim().slice(0, 30),
    city: input.city.trim().slice(0, 60),
    courts: input.courts,
    message: input.message.trim().slice(0, 1000),
    // Same as the database: only plans on offer are kept.
    planId: db.plans.some((p) => p.id === input.planId && p.isPublic && !p.comingSoon)
      ? input.planId
      : null,
    status: 'new',
    createdAt: new Date().toISOString(),
    handledAt: null,
  })
  await respond(null, 400)
}

/** Platform admin. Newest first. */
export async function listTrialRequests(): Promise<TrialRequest[]> {
  return respond([...db.trialRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
}

export async function setTrialRequestStatus(id: string, status: TrialRequestStatus): Promise<void> {
  const request = findOrThrow(db.trialRequests, id, 'Request')
  request.status = status
  request.handledAt = status === 'new' ? null : new Date().toISOString()
  await respond(null)
}
