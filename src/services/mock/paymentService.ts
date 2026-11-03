import type { Payment, PaymentRecordStatus } from '@/types/booking'
import type { PaymentMethod } from '@/types/tenant'

import { db, findOrThrow, respond } from './mockDb'

export interface PaymentRow extends Payment {
  bookingReference: string
  bookingDate: string
  customerName: string
  locationId: string
}

export interface PaymentFilters {
  from?: string
  to?: string
  status?: PaymentRecordStatus | ''
  method?: PaymentMethod | ''
  locationId?: string
  search?: string
}

export async function listPayments(
  tenantId: string,
  f: PaymentFilters = {},
): Promise<PaymentRow[]> {
  const search = f.search?.trim().toLowerCase()
  const rows: PaymentRow[] = []
  for (const p of db.payments) {
    if (p.tenantId !== tenantId) continue
    const day = p.createdAt.slice(0, 10)
    if ((f.from && day < f.from) || (f.to && day > f.to)) continue
    if ((f.status && p.status !== f.status) || (f.method && p.method !== f.method)) continue
    const booking = db.bookings.find((b) => b.id === p.bookingId)
    if (f.locationId && booking?.locationId !== f.locationId) continue
    const row: PaymentRow = {
      ...p,
      bookingReference: booking?.reference ?? '—',
      bookingDate: booking?.date ?? '',
      customerName: db.customers.find((c) => c.id === p.customerId)?.name ?? 'Unknown',
      locationId: booking?.locationId ?? '',
    }
    if (
      search &&
      !row.reference.toLowerCase().includes(search) &&
      !row.bookingReference.toLowerCase().includes(search) &&
      !row.customerName.toLowerCase().includes(search)
    ) {
      continue
    }
    rows.push(row)
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return respond(rows)
}

/** Payment proofs waiting for a staff member to check them. */
export async function countPendingPayments(tenantId: string): Promise<number> {
  return respond(
    db.payments.filter((p) => p.tenantId === tenantId && p.status === 'pending').length,
    40,
  )
}

/**
 * The pending payment plus, for a multi-date booking, its siblings: one
 * transfer paid for every date, so it's approved or rejected as a whole.
 */
function pendingGroup(payment: Payment): Payment[] {
  const booking = db.bookings.find((b) => b.id === payment.bookingId)
  if (!booking?.groupId) return [payment]
  const ids = new Set(db.bookings.filter((b) => b.groupId === booking.groupId).map((b) => b.id))
  return db.payments.filter(
    (p) => p.id === payment.id || (ids.has(p.bookingId) && p.status === 'pending'),
  )
}

/** Approve a pending GCash / transfer proof: payment paid, booking(s) confirmed. */
export async function approvePayment(id: string): Promise<Payment> {
  const payment = findOrThrow(db.payments, id, 'Payment')
  for (const p of pendingGroup(payment)) {
    p.status = 'paid'
    p.paidAt = new Date().toISOString()
    const booking = db.bookings.find((b) => b.id === p.bookingId)
    if (booking) {
      booking.paymentStatus = 'paid'
      if (booking.status === 'pending') booking.status = 'confirmed'
    }
  }
  return respond(payment)
}

export async function rejectPayment(id: string): Promise<Payment> {
  const payment = findOrThrow(db.payments, id, 'Payment')
  for (const p of pendingGroup(payment)) p.status = 'failed'
  return respond(payment)
}

export async function refundPayment(id: string): Promise<Payment> {
  const payment = findOrThrow(db.payments, id, 'Payment')
  payment.status = 'refunded'
  const booking = db.bookings.find((b) => b.id === payment.bookingId)
  if (booking) booking.paymentStatus = 'refunded'
  return respond(payment)
}

// --- Proof of payment ---------------------------------------------------------

/** Screenshots or PDF receipts up to 5 MB (same as the Storage bucket). */
export const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
export const PROOF_MAX_BYTES = 5 * 1024 * 1024

export function assertProofFile(file: File): void {
  if (!PROOF_TYPES.includes(file.type)) throw new Error('Use a JPG, PNG, WebP or PDF file.')
  if (file.size > PROOF_MAX_BYTES)
    throw new Error('The file is over 5 MB. Try a smaller screenshot.')
}

/** Mock upload: keeps the file in memory as a data URL, which doubles as its "path". */
export async function uploadPaymentProof(
  _tenantId: string,
  _reference: string,
  file: File,
): Promise<string> {
  assertProofFile(file)
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

/** Links the proof to the booking's pending payment(s); needs reference + phone. */
export async function attachPaymentProof(
  tenantId: string,
  reference: string,
  phone: string,
  proofPath: string,
  transactionReference = '',
): Promise<number> {
  const digits = phone.replace(/\D/g, '').slice(-10)
  const bookingIds = new Set(
    db.bookings
      .filter((b) => {
        if (b.tenantId !== tenantId || b.reference !== reference.trim().toUpperCase()) return false
        const customer = db.customers.find((c) => c.id === b.customerId)
        return customer?.phone.replace(/\D/g, '').slice(-10) === digits
      })
      .map((b) => b.id),
  )
  const pending = db.payments.filter((p) => bookingIds.has(p.bookingId) && p.status === 'pending')
  if (!pending.length) throw new Error('No payment waiting for proof on that booking.')
  for (const p of pending) {
    p.proofPath = proofPath
    p.transactionReference = transactionReference.trim()
  }
  return respond(pending.length)
}

/** A URL staff can open to view the proof (in mock mode the path is already a data URL). */
export async function getProofUrl(proofPath: string): Promise<string> {
  return respond(proofPath, 40)
}
