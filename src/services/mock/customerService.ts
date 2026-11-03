import type { Customer } from '@/types/booking'
import { todayISO } from '@/utils/dates'
import { newId } from '@/utils/ids'

import { db, findOrThrow, respond, ServiceError } from './mockDb'

export interface CustomerSummary extends Customer {
  bookings: number
  totalSpent: number
  lastVisit: string | null
  noShows: number
}

/** Customers with their booking stats (later: a Postgres view). */
export async function listCustomers(tenantId: string): Promise<CustomerSummary[]> {
  const stats = new Map<
    string,
    { bookings: number; spent: number; last: string | null; noShows: number }
  >()
  const today = todayISO()
  for (const b of db.bookings) {
    if (b.tenantId !== tenantId) continue
    const s = stats.get(b.customerId) ?? { bookings: 0, spent: 0, last: null, noShows: 0 }
    if (b.status !== 'cancelled') s.bookings++
    if (b.paymentStatus === 'paid') s.spent += b.amount
    if (b.status === 'no_show') s.noShows++
    if (b.status === 'completed' && b.date <= today && (!s.last || b.date > s.last)) s.last = b.date
    stats.set(b.customerId, s)
  }
  const rows = db.customers
    .filter((c) => c.tenantId === tenantId)
    .map((c) => {
      const s = stats.get(c.id)
      return {
        ...c,
        bookings: s?.bookings ?? 0,
        totalSpent: s?.spent ?? 0,
        lastVisit: s?.last ?? null,
        noShows: s?.noShows ?? 0,
      }
    })
  return respond(rows)
}

export async function getCustomer(id: string): Promise<Customer> {
  return respond(findOrThrow(db.customers, id, 'Customer'))
}

export type CustomerInput = Pick<Customer, 'name' | 'email' | 'phone' | 'tags'>

export async function saveCustomer(
  tenantId: string,
  input: CustomerInput,
  id?: string,
): Promise<Customer> {
  if (id) {
    const customer = findOrThrow(db.customers, id, 'Customer')
    Object.assign(customer, input)
    return respond(customer)
  }
  return respond(insertCustomer(tenantId, input))
}

// --- Customer tags ----------------------------------------------------------------

/** Added automatically to first-time bookers; every business has it. */
export const BUILT_IN_TAG = 'New'
/** A business's tags until it edits them (same as the database default). */
export const DEFAULT_CUSTOMER_TAGS = ['Regular', 'Member', 'League', 'Clinic', 'Corporate']
export const MAX_CUSTOMER_TAGS = 20
export const MAX_TAG_LENGTH = 24

/** Trims and checks a tag list; throws with a message to show the owner. */
export function cleanCustomerTags(tags: string[]): string[] {
  const cleaned = tags.map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean)
  const seen = new Set<string>()
  for (const t of cleaned) {
    const key = t.toLowerCase()
    if (key === BUILT_IN_TAG.toLowerCase()) {
      throw new ServiceError(`"${BUILT_IN_TAG}" is built in and added automatically.`, 'invalid')
    }
    if (t.length > MAX_TAG_LENGTH) {
      throw new ServiceError(`Keep tags to ${MAX_TAG_LENGTH} characters ("${t}").`, 'invalid')
    }
    if (seen.has(key)) throw new ServiceError(`"${t}" is listed twice.`, 'invalid')
    seen.add(key)
  }
  if (cleaned.length > MAX_CUSTOMER_TAGS) {
    throw new ServiceError(`Up to ${MAX_CUSTOMER_TAGS} tags.`, 'invalid')
  }
  return cleaned
}

/** The business's own tags (without the built-in "New"). */
export async function listCustomerTags(tenantId: string): Promise<string[]> {
  return respond(db.customerTagLists[tenantId] ?? DEFAULT_CUSTOMER_TAGS)
}

export async function saveCustomerTags(tenantId: string, tags: string[]): Promise<string[]> {
  db.customerTagLists[tenantId] = cleanCustomerTags(tags)
  return respond(db.customerTagLists[tenantId])
}

/** Matches an existing customer by phone or email, else creates one. */
export function findOrCreateCustomer(
  tenantId: string,
  input: Omit<CustomerInput, 'tags'>,
): Customer {
  const phone = input.phone.replace(/\s/g, '')
  const existing = db.customers.find(
    (c) =>
      c.tenantId === tenantId &&
      ((phone && c.phone.replace(/\s/g, '') === phone) ||
        (input.email && c.email.toLowerCase() === input.email.toLowerCase())),
  )
  return existing ?? insertCustomer(tenantId, { ...input, tags: ['New'] })
}

function insertCustomer(tenantId: string, input: CustomerInput): Customer {
  const customer: Customer = { ...input, id: newId('cus'), tenantId, createdAt: todayISO() }
  db.customers.push(customer)
  return customer
}
