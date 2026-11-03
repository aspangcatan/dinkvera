import { defineStore } from 'pinia'

import { getSubscription, getUsage, listPlans } from '@/services/subscriptionService'
import { getTenantBySlug } from '@/services/tenantService'
import { listLocations } from '@/services/venueService'
import type { Plan, Subscription } from '@/types/billing'
import type { Permission, StaffRole } from '@/types/staff'
import type { Tenant } from '@/types/tenant'
import type { Location } from '@/types/venue'
import { can } from '@/utils/permissions'
import type { UsageItem } from '@/utils/usage'

import { useSessionStore } from './session'

/**
 * Locations are public (the booking site needs them). Subscription and
 * usage are private to the business's staff: with Supabase, RLS refuses
 * them to visitors and to other businesses, which here just means "not
 * available" rather than an error.
 */
async function fetchContext(tenantId: string) {
  // Visitors (signed out) never ask for private data at all.
  const signedIn = useSessionStore().isAuthenticated
  const [locations, subscription, usage, plans] = await Promise.all([
    listLocations(tenantId),
    signedIn ? getSubscription(tenantId).catch(() => null) : null,
    signedIn ? getUsage(tenantId).catch(() => []) : [],
    listPlans(),
  ])
  return {
    locations,
    subscription,
    usage,
    plan: plans.find((p) => p.id === subscription?.planId) ?? null,
  }
}

/**
 * The tenant currently being viewed — in the dashboard (/manage/:slug) or
 * on its public site (/book/:slug). Holds the context almost every tenant
 * page needs: the business, its locations, plan and usage.
 */
export const useTenantStore = defineStore('tenant', {
  state: () => ({
    tenant: null as Tenant | null,
    locations: [] as Location[],
    subscription: null as Subscription | null,
    plan: null as Plan | null,
    usage: [] as UsageItem[],
    loading: false,
    notFound: false,
  }),
  getters: {
    /** Role of the signed-in persona here; platform admins act as owner. */
    role(): StaffRole | null {
      const session = useSessionStore()
      const persona = session.persona
      if (!persona || !this.tenant) return null
      if (persona.kind === 'platform_admin') return 'owner'
      return persona.tenantId === this.tenant.id ? persona.role : null
    },
    activeLocations: (state) => state.locations.filter((l) => l.status === 'active'),
  },
  actions: {
    async load(slug: string): Promise<boolean> {
      if (this.tenant?.slug === slug) return true
      this.loading = true
      this.notFound = false
      try {
        const tenant = await getTenantBySlug(slug)
        if (!tenant) {
          this.tenant = null
          this.notFound = true
          return false
        }
        // Fetch the context first and set `tenant` last: layouts render
        // their pages as soon as `tenant` is set, and those pages expect
        // locations and plan to be there already.
        const context = await fetchContext(tenant.id)
        this.$patch({ ...context, tenant })
        return true
      } finally {
        this.loading = false
      }
    },

    /** Re-reads locations, plan and usage after something changed. */
    async refresh(): Promise<void> {
      if (!this.tenant) return
      this.$patch(await fetchContext(this.tenant.id))
    },

    /** Re-reads the tenant row itself (its status can change, e.g. after paying). */
    async reload(): Promise<void> {
      if (!this.tenant) return
      const fresh = await getTenantBySlug(this.tenant.slug)
      if (fresh) this.tenant = fresh
      await this.refresh()
    },

    setTenant(tenant: Tenant): void {
      this.tenant = tenant
    },

    can(permission: Permission): boolean {
      return this.role ? can(this.role, permission) : false
    },
  },
})
