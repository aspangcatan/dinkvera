import { ref } from 'vue'

import { listTrialRequests } from '@/services/trialRequestService'

// Shared across the admin console so the sidebar badge updates as soon as
// a request is handled.
const count = ref(0)

async function refresh(): Promise<void> {
  try {
    count.value = (await listTrialRequests()).filter((r) => r.status === 'new').length
  } catch {
    // The badge is a hint only; the requests list shows real errors.
  }
}

/** Free-trial requests from the marketing site nobody has handled yet. */
export function useNewTrialRequests() {
  return { count, refresh }
}
