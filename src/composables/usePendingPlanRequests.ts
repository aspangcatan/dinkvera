import { ref } from 'vue'

import { listPlanRequests } from '@/services/subscriptionService'

// Shared across the admin console so the sidebar badge updates as soon as
// a request is approved or declined anywhere.
const count = ref(0)

async function refresh(): Promise<void> {
  try {
    count.value = (await listPlanRequests({ status: 'pending' })).length
  } catch {
    // The badge is a hint only; the requests list shows real errors.
  }
}

/** Number of plan change requests waiting for a platform admin. */
export function usePendingPlanRequests() {
  return { count, refresh }
}
