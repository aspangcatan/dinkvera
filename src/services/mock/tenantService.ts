import type { StaffMember } from '@/types/staff'
import type { Tenant, TenantStatus } from '@/types/tenant'
import type { PlanId } from '@/types/billing'
import { addDays, todayISO } from '@/utils/dates'
import { newId, slugify } from '@/utils/ids'

import { db, findOrThrow, respond, ServiceError } from './mockDb'

export async function listTenants(): Promise<Tenant[]> {
  return respond(db.tenants)
}

export async function getTenant(id: string): Promise<Tenant> {
  return respond(findOrThrow(db.tenants, id, 'Business'))
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  return respond(db.tenants.find((t) => t.slug === slug) ?? null, 80)
}

export type TenantPatch = Partial<
  Pick<
    Tenant,
    'name' | 'legalName' | 'phone' | 'city' | 'about' | 'ownerEmail' | 'ownerName' | 'policies'
  >
> & {
  branding?: Partial<Tenant['branding']>
  bookingRules?: Partial<Tenant['bookingRules']>
}

export async function updateTenant(id: string, patch: TenantPatch): Promise<Tenant> {
  const tenant = findOrThrow(db.tenants, id, 'Business')
  const { branding, bookingRules, ...rest } = patch
  Object.assign(tenant, rest)
  if (branding) Object.assign(tenant.branding, branding)
  if (bookingRules) Object.assign(tenant.bookingRules, bookingRules)
  return respond(tenant)
}

export async function setTenantStatus(id: string, status: TenantStatus): Promise<Tenant> {
  const tenant = findOrThrow(db.tenants, id, 'Business')
  tenant.status = status
  db.activity.unshift({
    id: newId('act'),
    kind: status === 'suspended' ? 'suspended' : 'support',
    tenantId: id,
    message: status === 'suspended' ? 'Suspended by platform admin' : `Status set to ${status}`,
    at: new Date().toISOString(),
  })
  return respond(tenant)
}

export interface NewTenantInput {
  name: string
  ownerName: string
  ownerEmail: string
  phone: string
  city: string
  planId: PlanId
  primary: string
}

/**
 * Onboards a business: tenant row, a 14-day trial subscription and the
 * owner's staff seat. (Later: one Postgres function so it's atomic.)
 */
export async function createTenant(input: NewTenantInput): Promise<Tenant> {
  const slug = slugify(input.name)
  if (db.tenants.some((t) => t.slug === slug)) {
    throw new ServiceError('A business with this name already exists', 'conflict')
  }
  const today = todayISO()
  const template = db.tenants[0]!
  const monogram = input.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  const tenant: Tenant = {
    id: newId('tn'),
    slug,
    name: input.name,
    legalName: input.name,
    status: 'trialing',
    ownerName: input.ownerName,
    ownerEmail: input.ownerEmail,
    phone: input.phone,
    city: input.city,
    timezone: 'Asia/Manila',
    currency: 'PHP',
    createdAt: today,
    branding: {
      primary: input.primary,
      accent: '#f59e0b',
      monogram,
      tagline: '',
      heroStyle: 'color',
      heroImages: [],
    },
    bookingRules: structuredClone(template.bookingRules),
    policies: [],
    about: '',
  }
  db.tenants.push(tenant)
  db.subscriptions.push({
    id: newId('sub'),
    tenantId: tenant.id,
    planId: input.planId,
    status: 'trialing',
    billingCycle: 'monthly',
    startedAt: today,
    currentPeriodStart: today,
    currentPeriodEnd: addDays(today, db.platformSettings.trialDays),
    trialEndsAt: addDays(today, db.platformSettings.trialDays),
    cancelAtPeriodEnd: false,
  })
  const owner: StaffMember = {
    id: newId('stf'),
    tenantId: tenant.id,
    name: input.ownerName,
    email: input.ownerEmail,
    phone: input.phone,
    role: 'owner',
    status: 'invited',
    lastActiveAt: null,
  }
  db.staff.push(owner)
  db.activity.unshift({
    id: newId('act'),
    kind: 'signup',
    tenantId: tenant.id,
    message: 'Created by platform admin — 14-day trial started',
    at: new Date().toISOString(),
  })
  return respond(tenant)
}
