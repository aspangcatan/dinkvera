<script setup lang="ts">
import {
  Clock,
  BarChart3,
  CalendarDays,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  MapPin,
  Plus,
  ReceiptText,
  Settings,
  ShieldAlert,
  Sparkles,
  UserRound,
  Wallet,
} from '@lucide/vue'
import { computed, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BookingFormModal from '@/components/booking/BookingFormModal.vue'
import DashboardShell from '@/components/layout/DashboardShell.vue'
import PersonaCard from '@/components/layout/PersonaCard.vue'
import TenantMark from '@/components/layout/TenantMark.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { useBrandTheme } from '@/composables/useBrandTheme'
import {
  bookingsVersionKey,
  openNewBookingKey,
  type NewBookingPrefill,
} from '@/composables/useNewBooking'
import { countPendingPayments } from '@/services/paymentService'
import { listInvoices } from '@/services/subscriptionService'
import { listTenants } from '@/services/tenantService'
import { useSessionStore } from '@/stores/session'
import { useTenantStore } from '@/stores/tenant'
import type { Permission } from '@/types/staff'
import type { Tenant } from '@/types/tenant'
import type { NavGroup, NavItem } from '@/types/ui'
import { daysBetween, todayISO } from '@/utils/dates'

const route = useRoute()
const router = useRouter()
const store = useTenantStore()

// Past due but every overdue invoice already has proof waiting: say "under
// review" instead of "overdue". Re-checked whenever the tenant row reloads.
const overdueInReview = ref(false)
watch(
  () => store.tenant,
  async (t) => {
    overdueInReview.value = false
    if (!t || t.status !== 'past_due' || !store.can('billing')) return
    try {
      const overdue = await listInvoices({ tenantId: t.id, status: 'overdue' })
      overdueInReview.value = overdue.length > 0 && overdue.every((i) => !!i.proofSubmittedAt)
    } catch {
      // Just a banner; keep the "overdue" wording.
    }
  },
  { immediate: true },
)
const session = useSessionStore()

const slug = computed(() => String(route.params.tenantSlug))
const pendingPayments = ref(0)

async function load(): Promise<void> {
  const ok = await store.load(slug.value)
  if (ok && store.tenant) pendingPayments.value = await countPendingPayments(store.tenant.id)
}
watch(slug, load, { immediate: true })
// Payments page approvals change the badge.
watch(
  () => route.fullPath,
  async () => {
    if (store.tenant) pendingPayments.value = await countPendingPayments(store.tenant.id)
  },
)

useBrandTheme(() => store.tenant?.branding)

const base = computed(() => `/manage/${slug.value}`)

const groups = computed<NavGroup[]>(() => {
  const item = (permission: Permission, nav: NavItem): NavItem[] =>
    store.can(permission) ? [nav] : []
  const b = base.value
  return [
    {
      label: 'Operations',
      items: [
        ...item('dashboard', { to: b, label: 'Dashboard', icon: LayoutDashboard, exact: true }),
        ...item('calendar', { to: `${b}/calendar`, label: 'Calendar', icon: CalendarDays }),
        ...item('bookings', { to: `${b}/bookings`, label: 'Bookings', icon: ReceiptText }),
        ...item('customers', { to: `${b}/customers`, label: 'Customers', icon: UserRound }),
        ...item('payments', {
          to: `${b}/payments`,
          label: 'Payments',
          icon: Wallet,
          badge: pendingPayments.value || null,
        }),
      ],
    },
    {
      label: 'Venue',
      items: [...item('venues', { to: `${b}/venues`, label: 'Locations & courts', icon: MapPin })],
    },
    {
      label: 'Business',
      items: [
        ...item('reports', { to: `${b}/reports`, label: 'Reports', icon: BarChart3 }),
        ...item('settings', { to: `${b}/settings`, label: 'Settings', icon: Settings }),
        ...item('billing', { to: `${b}/subscription`, label: 'Subscription', icon: CreditCard }),
      ],
    },
  ].filter((g) => g.items.length)
})

// --- Banners ---------------------------------------------------------------
const trialDaysLeft = computed(() => {
  const sub = store.subscription
  if (sub?.status !== 'trialing' || !sub.trialEndsAt) return null
  return Math.max(0, daysBetween(todayISO(), sub.trialEndsAt))
})

// --- Platform admin: switch between businesses ------------------------------
const allTenants = ref<Tenant[]>([])
watch(
  () => session.isPlatformAdmin,
  async (isAdmin) => {
    if (isAdmin) allTenants.value = await listTenants()
  },
  { immediate: true },
)
function switchTenant(event: Event): void {
  const next = (event.target as HTMLSelectElement).value
  void router.push(`/manage/${next}`)
}

// --- "New booking" from anywhere in the dashboard ---------------------------
const bookingOpen = ref(false)
const prefill = ref<NewBookingPrefill>({})
function openNewBooking(values: NewBookingPrefill = {}): void {
  prefill.value = values
  bookingOpen.value = true
}
provide(openNewBookingKey, openNewBooking)

// Pages listen for this to refresh after a booking is created here.
const bookingsVersion = ref(0)
provide(bookingsVersionKey, bookingsVersion)
function onBookingCreated(): void {
  bookingOpen.value = false
  bookingsVersion.value++
  void store.refresh()
}
</script>

<template>
  <div v-if="store.notFound" class="flex min-h-screen items-center justify-center p-6 text-center">
    <div>
      <p class="text-charcoal-700 text-lg font-semibold">Business not found</p>
      <p class="text-charcoal-400 mt-1 text-sm">There is no business at “{{ slug }}”.</p>
      <AppButton class="mt-4" to="/login">Back to sign in</AppButton>
    </div>
  </div>

  <DashboardShell
    v-else-if="store.tenant"
    theme="tenant"
    :groups="groups"
    :label="`${store.tenant.name} dashboard`"
  >
    <template #brand>
      <RouterLink :to="base" class="flex items-center gap-3 px-2">
        <TenantMark :branding="store.tenant.branding" />
        <div class="min-w-0">
          <p class="text-charcoal-700 truncate text-sm font-semibold">{{ store.tenant.name }}</p>
          <p class="text-charcoal-400 truncate text-xs">
            {{ store.plan?.name }} plan · {{ store.locations.length }}
            {{ store.locations.length === 1 ? 'location' : 'locations' }}
          </p>
        </div>
      </RouterLink>
      <label v-if="session.isPlatformAdmin" class="mt-3 block px-2">
        <span class="sr-only">Switch business</span>
        <select
          :value="store.tenant.slug"
          class="border-charcoal-200 text-charcoal-600 h-9 w-full rounded-lg border bg-white px-2 text-xs"
          @change="switchTenant"
        >
          <option v-for="t in allTenants" :key="t.id" :value="t.slug">{{ t.name }}</option>
        </select>
      </label>
    </template>

    <template #topbar>
      <div class="ml-auto flex items-center gap-2">
        <AppButton
          variant="ghost"
          size="sm"
          :href="router.resolve(`/book/${store.tenant.slug}`).href"
        >
          <template #icon-left><ExternalLink class="size-4" aria-hidden="true" /></template>
          <span class="hidden sm:inline">Booking site</span>
        </AppButton>
        <AppButton v-if="store.can('bookings')" size="sm" @click="openNewBooking()">
          <template #icon-left><Plus class="size-4" aria-hidden="true" /></template>
          New booking
        </AppButton>
      </div>
    </template>

    <template #banner>
      <div
        v-if="session.isPlatformAdmin"
        class="flex items-center gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-800 sm:px-6"
      >
        <ShieldAlert class="size-4 shrink-0" aria-hidden="true" />
        You're viewing {{ store.tenant.name }} as platform support. Changes affect this business.
        <RouterLink to="/admin" class="ml-auto font-semibold underline">Back to admin</RouterLink>
      </div>
      <div
        v-if="trialDaysLeft !== null"
        class="bg-brand-50 text-brand-800 flex flex-wrap items-center gap-2 px-4 py-2 text-xs sm:px-6"
      >
        <Sparkles class="size-4 shrink-0" aria-hidden="true" />
        {{ trialDaysLeft }} days left in your {{ store.plan?.name }} trial.
        <RouterLink
          v-if="store.can('billing')"
          :to="`${base}/subscription`"
          class="ml-auto font-semibold underline"
          >View plan</RouterLink
        >
      </div>
      <div
        v-if="store.tenant.status === 'past_due' && overdueInReview"
        class="flex flex-wrap items-center gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6"
      >
        <Clock class="size-4 shrink-0" aria-hidden="true" />
        Payment under review — Sideline is checking your proof of payment. Your booking page stays
        online meanwhile.
        <RouterLink
          v-if="store.can('billing')"
          :to="`${base}/subscription`"
          class="ml-auto font-semibold underline"
          >View invoice</RouterLink
        >
      </div>
      <div
        v-else-if="store.tenant.status === 'past_due'"
        class="flex flex-wrap items-center gap-2 bg-red-50 px-4 py-2 text-xs text-red-800 sm:px-6"
      >
        <ShieldAlert class="size-4 shrink-0" aria-hidden="true" />
        Your latest Sideline invoice is overdue. Pay it to keep your booking page online.
        <RouterLink
          v-if="store.can('billing')"
          :to="`${base}/subscription`"
          class="ml-auto font-semibold underline"
          >View invoice</RouterLink
        >
      </div>
      <div
        v-if="store.tenant.status === 'suspended'"
        class="flex items-center gap-2 bg-red-600 px-4 py-2 text-xs text-white sm:px-6"
      >
        <ShieldAlert class="size-4 shrink-0" aria-hidden="true" />
        This account is suspended. The public booking page is offline.
      </div>
    </template>

    <template #sidebar-footer>
      <PersonaCard tone="tenant" />
    </template>

    <RouterView :key="store.tenant.id" />

    <BookingFormModal
      :open="bookingOpen"
      :prefill="prefill"
      @close="bookingOpen = false"
      @saved="onBookingCreated"
    />
  </DashboardShell>

  <LoadingState v-else class="mx-auto mt-20 max-w-lg" :rows="6" />
  <ToastHost />
</template>
