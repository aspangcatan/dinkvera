import type { TrialRequest } from '@/types/billing'

/** Free-trial requests from the marketing site's Contact page. */
export const trialRequestSeed: TrialRequest[] = [
  {
    id: 'trq_1',
    businessName: 'Net Gains Pickleball',
    contactName: 'Carla Reyes',
    email: 'carla@netgains.ph',
    phone: '0918 555 0142',
    city: 'Iloilo City',
    courts: 4,
    message: 'We open in two weeks and want players booking online from day one.',
    planId: 'growth',
    status: 'new',
    createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    handledAt: null,
  },
]
