<script setup lang="ts">
import {
  Building2,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Layers,
  ReceiptText,
  Settings,
} from '@lucide/vue'
import { computed } from 'vue'

import DashboardShell from '@/components/layout/DashboardShell.vue'
import PersonaCard from '@/components/layout/PersonaCard.vue'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { useInvoicesToReview } from '@/composables/useInvoicesToReview'
import { useNewTrialRequests } from '@/composables/useNewTrialRequests'
import { usePendingPlanRequests } from '@/composables/usePendingPlanRequests'
import { useRefreshOnReturn } from '@/composables/useRefreshOnReturn'
import type { NavGroup } from '@/types/ui'

// Sidebar badges: payment proofs to review and overdue invoices to chase…
const invoicesToReview = useInvoicesToReview()
void invoicesToReview.refresh()
// …plan change requests that need an answer…
const planRequests = usePendingPlanRequests()
void planRequests.refresh()
// …and new free-trial requests from the marketing site.
const trialRequests = useNewTrialRequests()
void trialRequests.refresh()
useRefreshOnReturn(() =>
  Promise.all([invoicesToReview.refresh(), planRequests.refresh(), trialRequests.refresh()]),
)

const groups = computed<NavGroup[]>(() => [
  {
    label: 'Platform',
    items: [{ to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true }],
  },
  {
    label: 'Customers',
    items: [
      {
        to: '/admin/tenants',
        label: 'Businesses',
        icon: Building2,
        badge: trialRequests.count.value || null,
      },
      {
        to: '/admin/subscriptions',
        label: 'Subscriptions',
        icon: CreditCard,
        badge: planRequests.count.value || null,
      },
      {
        to: '/admin/invoices',
        label: 'Invoices',
        icon: ReceiptText,
        badge: invoicesToReview.count.value || null,
      },
    ],
  },
  {
    label: 'Product',
    items: [
      { to: '/admin/plans', label: 'Plans & limits', icon: Layers },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
])
</script>

<template>
  <DashboardShell theme="platform" :groups="groups" label="Super admin">
    <template #brand>
      <RouterLink to="/admin" class="flex items-center justify-between gap-2 px-2">
        <BrandLogo tone="light" />
        <span
          class="text-forest-900 rounded bg-lime-300 px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase"
          >Admin</span
        >
      </RouterLink>
    </template>

    <template #topbar>
      <p class="text-charcoal-500 hidden text-sm sm:block">CourtDesk admin console</p>
      <div class="ml-auto flex items-center gap-2">
        <RouterLink
          to="/"
          class="text-charcoal-500 hover:text-charcoal-700 hover:bg-charcoal-100 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          <ExternalLink class="size-4" aria-hidden="true" />
          <span class="hidden sm:inline">Demo launcher</span>
        </RouterLink>
      </div>
    </template>

    <template #sidebar-footer>
      <PersonaCard tone="platform" />
    </template>

    <RouterView />
  </DashboardShell>
  <ToastHost />
</template>
