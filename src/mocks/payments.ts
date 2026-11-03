import type { Payment, PaymentRecordStatus } from '@/types/booking'
import type { PaymentMethod } from '@/types/tenant'
import { createRandom } from '@/utils/random'

import { bookingSeed } from './bookings'
import { tenantSeed } from './tenants'

/**
 * One payment record per paid/refunded booking, plus pending proofs for
 * some unpaid online bookings and the occasional failed attempt.
 */
function build(): Payment[] {
  const rand = createRandom(20261101)
  const payments: Payment[] = []
  let seq = 0

  for (const booking of bookingSeed) {
    const tenant = tenantSeed.find((t) => t.id === booking.tenantId)!
    const methods = tenant.bookingRules.paymentMethods
    const onlineMethods = methods.filter((m) => m !== 'cash')
    const method: PaymentMethod =
      booking.source === 'walk_in' && methods.includes('cash')
        ? 'cash'
        : rand.pick(onlineMethods.length ? onlineMethods : methods)

    let status: PaymentRecordStatus | null = null
    if (booking.paymentStatus === 'paid') status = 'paid'
    else if (booking.paymentStatus === 'refunded') status = 'refunded'
    else if (booking.status === 'pending' && rand.chance(0.55)) status = 'pending'
    if (!status) continue

    if (status === 'paid' && method !== 'cash' && rand.chance(0.02)) {
      payments.push(record(++seq, booking, method, 'failed'))
    }
    payments.push(record(++seq, booking, method, status))
  }

  function record(
    n: number,
    booking: (typeof bookingSeed)[number],
    method: PaymentMethod,
    status: PaymentRecordStatus,
  ): Payment {
    const prefix = { gcash: 'GC', maya: 'MY', card: 'CD', bank_transfer: 'BT', cash: 'CS' }[method]
    return {
      id: `pay_${n.toString(36).padStart(5, '0')}`,
      tenantId: booking.tenantId,
      bookingId: booking.id,
      customerId: booking.customerId,
      amount: booking.amount,
      method,
      status,
      reference: `${prefix}${String(rand.int(10_000_000, 99_999_999))}`,
      proofPath: null,
      transactionReference: '',
      createdAt: booking.createdAt,
      paidAt: status === 'paid' ? booking.createdAt : null,
    }
  }

  return payments
}

export const paymentSeed: Payment[] = build()
