import { createRouter, createWebHistory } from 'vue-router'

import { brand } from '@/config/brand'

import { useSessionStore } from '@/stores/session'
import { useTenantStore } from '@/stores/tenant'
import type { Permission } from '@/types/staff'

declare module 'vue-router' {
  interface RouteMeta {
    /** Who may open this area. */
    requires?: 'platform_admin' | 'tenant_member'
    /** Tenant dashboard pages: which role permission is needed. */
    permission?: Permission
    title?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    // Auth links carry tokens in the hash (#access_token=…): not an anchor.
    if (to.hash && !to.hash.includes('=')) return { el: to.hash, behavior: 'smooth', top: 72 }
    return { top: 0 }
  },
  routes: [
    // --- Platform marketing + demo launcher ------------------------------
    {
      path: '/',
      component: () => import('@/layouts/MarketingLayout.vue'),
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/views/marketing/HomeView.vue'),
          meta: { title: 'Court booking software for pickleball businesses' },
        },
        {
          path: 'contact',
          name: 'contact',
          component: () => import('@/views/marketing/ContactView.vue'),
          meta: { title: 'Start your free trial' },
        },
        {
          path: 'privacy',
          name: 'privacy',
          component: () => import('@/views/marketing/PrivacyView.vue'),
          meta: { title: 'Privacy Policy' },
        },
        {
          path: 'terms',
          name: 'terms',
          component: () => import('@/views/marketing/TermsView.vue'),
          meta: { title: 'Terms and Conditions' },
        },
      ],
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/marketing/LoginView.vue'),
      meta: { title: 'Sign in' },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/marketing/ForgotPasswordView.vue'),
      meta: { title: 'Forgot password' },
    },
    {
      // Opened from the reset email (supabase-js reads the token from the link).
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/views/marketing/ResetPasswordView.vue'),
      meta: { title: 'Set a new password' },
    },

    // --- A. Super Admin ---------------------------------------------------
    {
      path: '/admin',
      component: () => import('@/layouts/PlatformLayout.vue'),
      meta: { requires: 'platform_admin' },
      children: [
        {
          path: '',
          name: 'admin-overview',
          component: () => import('@/views/platform/OverviewView.vue'),
          meta: { title: 'Overview' },
        },
        {
          path: 'tenants',
          name: 'admin-tenants',
          component: () => import('@/views/platform/TenantsView.vue'),
          meta: { title: 'Businesses' },
        },
        {
          path: 'tenants/:tenantId',
          name: 'admin-tenant-detail',
          component: () => import('@/views/platform/TenantDetailView.vue'),
          meta: { title: 'Business' },
        },
        {
          path: 'subscriptions',
          name: 'admin-subscriptions',
          component: () => import('@/views/platform/SubscriptionsView.vue'),
          meta: { title: 'Subscriptions' },
        },
        {
          path: 'invoices',
          name: 'admin-invoices',
          component: () => import('@/views/platform/InvoicesView.vue'),
          meta: { title: 'Invoices' },
        },
        {
          path: 'plans',
          name: 'admin-plans',
          component: () => import('@/views/platform/PlansView.vue'),
          meta: { title: 'Plans & limits' },
        },
        {
          path: 'settings',
          name: 'admin-settings',
          component: () => import('@/views/platform/SettingsView.vue'),
          meta: { title: 'Platform settings' },
        },
      ],
    },

    // --- B. Tenant / court owner dashboard --------------------------------
    {
      path: '/manage/:tenantSlug',
      component: () => import('@/layouts/TenantLayout.vue'),
      meta: { requires: 'tenant_member' },
      children: [
        {
          path: '',
          name: 'tenant-dashboard',
          component: () => import('@/views/tenant/DashboardView.vue'),
          meta: { permission: 'dashboard', title: 'Dashboard' },
        },
        {
          path: 'calendar',
          name: 'tenant-calendar',
          component: () => import('@/views/tenant/CalendarView.vue'),
          meta: { permission: 'calendar', title: 'Calendar' },
        },
        {
          path: 'bookings',
          name: 'tenant-bookings',
          component: () => import('@/views/tenant/BookingsView.vue'),
          meta: { permission: 'bookings', title: 'Bookings' },
        },
        {
          path: 'customers',
          name: 'tenant-customers',
          component: () => import('@/views/tenant/CustomersView.vue'),
          meta: { permission: 'customers', title: 'Customers' },
        },
        {
          path: 'payments',
          name: 'tenant-payments',
          component: () => import('@/views/tenant/PaymentsView.vue'),
          meta: { permission: 'payments', title: 'Payments' },
        },
        {
          path: 'venues',
          name: 'tenant-venues',
          component: () => import('@/views/tenant/VenuesView.vue'),
          meta: { permission: 'venues', title: 'Locations & courts' },
        },
        {
          path: 'reports',
          name: 'tenant-reports',
          component: () => import('@/views/tenant/ReportsView.vue'),
          meta: { permission: 'reports', title: 'Reports' },
        },
        {
          path: 'settings',
          name: 'tenant-settings',
          component: () => import('@/views/tenant/SettingsView.vue'),
          meta: { permission: 'settings', title: 'Settings' },
        },
        {
          path: 'subscription',
          name: 'tenant-subscription',
          component: () => import('@/views/tenant/SubscriptionView.vue'),
          meta: { permission: 'billing', title: 'Subscription' },
        },
        // Old or mistyped dashboard links (e.g. the removed Staff page).
        { path: ':pathMatch(.*)*', redirect: { name: 'tenant-dashboard' } },
      ],
    },

    // --- C. Public booking website (per tenant) ---------------------------
    {
      path: '/book/:tenantSlug',
      component: () => import('@/layouts/StorefrontLayout.vue'),
      children: [
        {
          path: '',
          name: 'store-home',
          component: () => import('@/views/storefront/StoreHomeView.vue'),
        },
        {
          path: 'courts',
          name: 'store-courts',
          component: () => import('@/views/storefront/StoreCourtsView.vue'),
          meta: { title: 'Courts & rates' },
        },
        {
          path: 'reserve',
          name: 'store-reserve',
          component: () => import('@/views/storefront/ReserveView.vue'),
          meta: { title: 'Book a court' },
        },
        {
          path: 'lookup',
          name: 'store-lookup',
          component: () => import('@/views/storefront/LookupView.vue'),
          meta: { title: 'Find my booking' },
        },
      ],
    },

    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/marketing/NotFoundView.vue'),
      meta: { title: 'Page not found' },
    },
  ],
})

// Guards are a UX convenience, not a security boundary — Supabase RLS will
// enforce tenant isolation and roles (see docs/architecture.md).
router.beforeEach(async (to) => {
  const session = useSessionStore()
  const needs = to.matched.find((r) => r.meta.requires)?.meta.requires
  if (!needs) return true

  // Restore a Supabase session (once per page load) before deciding.
  await session.initialize()
  if (!session.persona) return { name: 'login', query: { redirect: to.fullPath } }

  if (needs === 'platform_admin') {
    return session.isPlatformAdmin ? true : { name: 'login', query: { denied: '1' } }
  }

  // Tenant dashboard: an account of this business, or a platform admin (support).
  const tenantStore = useTenantStore()
  const ok = await tenantStore.load(String(to.params.tenantSlug))
  if (!ok) return true // the layout shows "not found"
  if (!tenantStore.role) return { name: 'login', query: { denied: '1' } }

  const permission = to.meta.permission
  if (permission && !tenantStore.can(permission)) {
    // Coaches etc. land on the first page they can open.
    const fallback = tenantStore.can('dashboard') ? 'tenant-dashboard' : 'tenant-calendar'
    if (to.name === fallback) return true
    return { name: fallback, params: to.params }
  }
  return true
})

router.afterEach((to) => {
  const tenant = to.params.tenantSlug ? useTenantStore().tenant : null
  const parts = [to.meta.title, tenant?.name ?? brand.product].filter(Boolean)
  document.title = parts.join(' · ')
})

export default router
