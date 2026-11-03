import { ref } from 'vue'

import { listInvoices } from '@/services/subscriptionService'
import { invoiceDisplayStatus } from '@/utils/labels'

// Shared across the admin console so the sidebar badge updates as soon as
// a payment is approved or declined anywhere.
const count = ref(0)

async function refresh(): Promise<void> {
  try {
    const invoices = await listInvoices()
    count.value = invoices.filter(
      (i) => invoiceDisplayStatus(i) === 'review' || i.status === 'overdue',
    ).length
  } catch {
    // The badge is a hint only; the invoices list shows real errors.
  }
}

/** Invoices that need a platform admin: proofs to review plus overdue ones to chase. */
export function useInvoicesToReview() {
  return { count, refresh }
}
