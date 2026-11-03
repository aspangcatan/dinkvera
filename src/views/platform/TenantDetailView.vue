<script setup lang="ts">
import { ArrowLeft, ExternalLink, LayoutDashboard, Mail, MapPin, Phone } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import TenantMark from '@/components/layout/TenantMark.vue'
import BusinessAccountsCard from '@/components/platform/BusinessAccountsCard.vue'
import ChangePlanModal from '@/components/platform/ChangePlanModal.vue'
import PlanRequestsCard from '@/components/platform/PlanRequestsCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import StatTile from '@/components/ui/StatTile.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import UsageMeter from '@/components/ui/UsageMeter.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useQuery } from '@/composables/useQuery'
import { getPlatformOverview, listPlatformActivity } from '@/services/analyticsService'
import { listInvoices, listPlans, markInvoicePaid } from '@/services/subscriptionService'
import { setTenantStatus } from '@/services/tenantService'
import { listCourts, listLocations } from '@/services/venueService'
import { useSessionStore } from '@/stores/session'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import { formatPHP } from '@/utils/currency'
import { formatOpeningHours, formatLongDate, formatRelative, formatShortDate } from '@/utils/dates'
import { formatNumber } from '@/utils/format'
import { courtTypeLabels } from '@/utils/labels'

const route = useRoute()
const router = useRouter()
const toast = useToastStore()
const session = useSessionStore()
const tenantStore = useTenantStore()
const id = computed(() => String(route.params.tenantId))

const overview = useQuery(getPlatformOverview)
const row = computed(() => overview.data.value?.rows.find((r) => r.tenant.id === id.value) ?? null)

const locations = useQuery(() => listLocations(id.value), [id])
const courts = useQuery(() => listCourts(id.value), [id])
const invoices = useQuery(() => listInvoices({ tenantId: id.value }), [id])
const activity = useQuery(() => listPlatformActivity(id.value), [id])
const { data: plans } = useQuery(listPlans)

const changingPlan = ref(false)
const confirmSuspend = ref(false)
const busy = ref(false)

async function reload(): Promise<void> {
  await Promise.all([overview.refresh(), invoices.refresh(), activity.refresh()])
  // The tenant store caches the open business; force a fresh read next time.
  tenantStore.$reset()
}

async function toggleSuspend(): Promise<void> {
  if (!row.value) return
  busy.value = true
  try {
    const suspended = row.value.tenant.status === 'suspended'
    await setTenantStatus(id.value, suspended ? 'active' : 'suspended')
    toast.show(suspended ? 'Business reactivated' : 'Business suspended — booking site is offline')
    confirmSuspend.value = false
    await reload()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function payInvoice(invoiceId: string): Promise<void> {
  try {
    await markInvoicePaid(invoiceId)
    toast.show('Invoice marked as paid')
    await reload()
  } catch (e) {
    toast.error(e)
  }
}

function openAsSupport(): void {
  if (!row.value) return
  tenantStore.$reset()
  void router.push(`/manage/${row.value.tenant.slug}`)
}

const courtsByLocation = (locationId: string) =>
  (courts.data.value ?? []).filter((c) => c.locationId === locationId)
</script>

<template>
  <div>
    <RouterLink
      to="/admin/tenants"
      class="text-charcoal-400 hover:text-charcoal-600 mb-4 inline-flex items-center gap-1.5 text-sm"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> Businesses
    </RouterLink>

    <ErrorState
      v-if="overview.error.value"
      :message="overview.error.value"
      @retry="overview.refresh"
    />
    <LoadingState v-else-if="overview.loading.value && !row" :rows="8" />
    <p v-else-if="!row" class="text-charcoal-500">This business doesn't exist.</p>

    <div v-else class="space-y-6">
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-center gap-4">
          <TenantMark :branding="row.tenant.branding" size="lg" />
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-charcoal-700 font-sans text-2xl font-semibold tracking-tight">
                {{ row.tenant.name }}
              </h1>
              <StatusBadge kind="tenant" :value="row.tenant.status" />
            </div>
            <p class="text-charcoal-400 text-sm">
              {{ row.tenant.legalName }} · {{ row.tenant.city }} · joined
              {{ formatLongDate(row.tenant.createdAt) }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <AppButton variant="outline" :href="router.resolve(`/book/${row.tenant.slug}`).href">
            <template #icon-left><ExternalLink class="size-4" aria-hidden="true" /></template>
            Booking site
          </AppButton>
          <AppButton v-if="session.isPlatformAdmin" variant="outline" @click="openAsSupport">
            <template #icon-left><LayoutDashboard class="size-4" aria-hidden="true" /></template>
            Open dashboard
          </AppButton>
          <AppButton
            :variant="row.tenant.status === 'suspended' ? 'primary' : 'danger'"
            @click="row.tenant.status === 'suspended' ? toggleSuspend() : (confirmSuspend = true)"
          >
            {{ row.tenant.status === 'suspended' ? 'Reactivate' : 'Suspend' }}
          </AppButton>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="MRR"
          :value="row.mrr ? formatPHP(row.mrr) : '—'"
          :hint="row.plan?.name + ' plan'"
        />
        <StatTile
          label="Booking volume (30d)"
          :value="formatPHP(row.gmv30d)"
          hint="Paid bookings"
        />
        <StatTile
          label="Bookings (30d)"
          :value="formatNumber(row.bookings30d)"
          hint="Excluding cancelled"
        />
        <StatTile
          label="Venues"
          :value="`${row.locations} / ${row.courts}`"
          hint="Locations / courts"
        />
      </div>

      <PlanRequestsCard :tenant-id="id" @decided="reload" />

      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Subscription -->
        <AppCard title="Subscription" class="lg:col-span-1">
          <template #actions>
            <AppButton size="sm" variant="outline" @click="changingPlan = true"
              >Change plan</AppButton
            >
          </template>
          <dl v-if="row.subscription" class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-charcoal-400">Plan</dt>
              <dd class="text-charcoal-700 font-medium">
                {{ row.plan?.name }} · {{ row.subscription.billingCycle }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-charcoal-400">Status</dt>
              <dd><StatusBadge kind="subscription" :value="row.subscription.status" /></dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-charcoal-400">
                {{ row.subscription.status === 'trialing' ? 'Trial ends' : 'Renews' }}
              </dt>
              <dd class="text-charcoal-700">
                {{
                  formatLongDate(row.subscription.trialEndsAt ?? row.subscription.currentPeriodEnd)
                }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-charcoal-400">Customer since</dt>
              <dd class="text-charcoal-700">{{ formatLongDate(row.subscription.startedAt) }}</dd>
            </div>
          </dl>
          <div class="border-charcoal-100 mt-5 space-y-4 border-t pt-5">
            <UsageMeter v-for="u in row.usage" :key="u.key" :item="u" compact />
          </div>
        </AppCard>

        <!-- Contact -->
        <AppCard title="Owner & contact">
          <div class="flex items-center gap-3">
            <UserAvatar :name="row.tenant.ownerName" />
            <div>
              <p class="text-charcoal-700 text-sm font-medium">{{ row.tenant.ownerName }}</p>
              <p class="text-charcoal-400 text-xs">Owner</p>
            </div>
          </div>
          <ul class="text-charcoal-600 mt-4 space-y-2 text-sm">
            <li class="flex items-center gap-2">
              <Mail class="text-charcoal-300 size-4" aria-hidden="true" />
              <a :href="`mailto:${row.tenant.ownerEmail}`" class="hover:underline">{{
                row.tenant.ownerEmail
              }}</a>
            </li>
            <li class="flex items-center gap-2">
              <Phone class="text-charcoal-300 size-4" aria-hidden="true" /> {{ row.tenant.phone }}
            </li>
          </ul>
        </AppCard>

        <BusinessAccountsCard :tenant-id="row.tenant.id" />

        <!-- Activity -->
        <AppCard title="Account activity" :padded="false">
          <ul v-if="activity.data.value?.length" class="divide-charcoal-100 divide-y">
            <li v-for="a in activity.data.value" :key="a.id" class="px-5 py-3">
              <p class="text-charcoal-600 text-sm">{{ a.message }}</p>
              <p class="text-charcoal-400 text-xs">{{ formatRelative(a.at) }}</p>
            </li>
          </ul>
          <p v-else class="text-charcoal-400 px-5 py-8 text-center text-sm">No activity yet.</p>
        </AppCard>
      </div>

      <!-- Locations -->
      <AppCard
        title="Locations & courts"
        :description="`${row.locations} locations · ${row.courts} courts`"
      >
        <p v-if="!locations.data.value?.length" class="text-charcoal-400 text-sm">
          No locations set up yet.
        </p>
        <div class="grid gap-4 md:grid-cols-2">
          <div
            v-for="loc in locations.data.value ?? []"
            :key="loc.id"
            class="border-charcoal-100 rounded-xl border p-4"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <p class="text-charcoal-700 font-medium">{{ loc.name }}</p>
                <p class="text-charcoal-400 flex items-center gap-1 text-xs">
                  <MapPin class="size-3" aria-hidden="true" /> {{ loc.city }} ·
                  {{ formatOpeningHours(loc.openHour, loc.closeHour) }}
                </p>
              </div>
              <StatusBadge kind="location" :value="loc.status" />
            </div>
            <ul class="mt-3 flex flex-wrap gap-1.5">
              <li
                v-for="c in courtsByLocation(loc.id)"
                :key="c.id"
                class="bg-charcoal-50 text-charcoal-500 rounded-md px-2 py-1 text-xs"
              >
                {{ c.name }} · {{ courtTypeLabels[c.type] }} · {{ formatPHP(c.dayRate) }}/h day
              </li>
            </ul>
          </div>
        </div>
      </AppCard>

      <!-- Invoices -->
      <AppCard title="Invoices" :padded="false">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-charcoal-400 border-charcoal-100 border-b text-xs">
                <th class="px-5 py-2.5 text-left font-medium">Invoice</th>
                <th class="px-4 py-2.5 text-left font-medium">Issued</th>
                <th class="px-4 py-2.5 text-left font-medium">Status</th>
                <th class="px-4 py-2.5 text-right font-medium">Amount</th>
                <th class="px-5 py-2.5"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="inv in (invoices.data.value ?? []).slice(0, 8)"
                :key="inv.id"
                class="border-charcoal-100/70 border-b last:border-0"
              >
                <td class="text-charcoal-700 px-5 py-3 font-medium">{{ inv.number }}</td>
                <td class="text-charcoal-500 px-4 py-3">{{ formatShortDate(inv.issuedAt) }}</td>
                <td class="px-4 py-3"><StatusBadge kind="invoice" :value="inv.status" /></td>
                <td class="tabular text-charcoal-700 px-4 py-3 text-right">
                  {{ formatPHP(inv.amount) }}
                </td>
                <td class="px-5 py-3 text-right">
                  <AppButton
                    v-if="inv.status === 'overdue' || inv.status === 'open'"
                    size="sm"
                    variant="outline"
                    @click="payInvoice(inv.id)"
                    >Mark paid</AppButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
          <p
            v-if="!invoices.data.value?.length"
            class="text-charcoal-400 px-5 py-8 text-center text-sm"
          >
            No invoices yet — still on trial.
          </p>
        </div>
      </AppCard>
    </div>

    <ChangePlanModal
      v-if="row?.subscription"
      :open="changingPlan"
      :tenant-id="id"
      :current-plan-id="row.subscription.planId"
      :current-cycle="row.subscription.billingCycle"
      :plans="plans ?? []"
      :usage="row.usage"
      include-private
      @close="changingPlan = false"
      @changed="((changingPlan = false), reload())"
    />
    <ConfirmDialog
      :open="confirmSuspend"
      title="Suspend this business?"
      :message="`${row?.tenant.name} will lose access to their dashboard and their booking site goes offline. Existing bookings are kept.`"
      confirm-label="Suspend"
      danger
      :loading="busy"
      @cancel="confirmSuspend = false"
      @confirm="toggleSuspend"
    />
  </div>
</template>
