<script setup lang="ts">
import { Banknote, CalendarCheck, Clock, Gauge, Wallet } from '@lucide/vue'
import { computed, ref } from 'vue'

import BookingDetailModal from '@/components/booking/BookingDetailModal.vue'
import BarList from '@/components/charts/BarList.vue'
import LineChart from '@/components/charts/LineChart.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatTile from '@/components/ui/StatTile.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import UsageMeter from '@/components/ui/UsageMeter.vue'
import { useNewBooking } from '@/composables/useNewBooking'
import { useQuery } from '@/composables/useQuery'
import { getCollected, getTenantAnalytics } from '@/services/analyticsService'
import { listBookings } from '@/services/bookingService'
import { countPendingPayments } from '@/services/paymentService'
import { useSessionStore } from '@/stores/session'
import { useTenantStore } from '@/stores/tenant'
import { formatPHP, formatPHPCompact } from '@/utils/currency'
import {
  addDays,
  formatShortDate,
  formatTimeRange,
  formatWeekdayDate,
  todayISO,
} from '@/utils/dates'
import { formatNumber, formatPercent, percentChange } from '@/utils/format'

const store = useTenantStore()
const session = useSessionStore()
const { openNewBooking, bookingsVersion } = useNewBooking()
const tenantId = computed(() => store.tenant!.id)
const today = todayISO()

const todayStats = useQuery(
  () => getTenantAnalytics(tenantId.value, { from: today, to: today }),
  [bookingsVersion],
)
const month = useQuery(
  () => getTenantAnalytics(tenantId.value, { from: addDays(today, -29), to: today }),
  [bookingsVersion],
)
const todays = useQuery(
  () => listBookings(tenantId.value, { from: today, to: today }),
  [bookingsVersion],
)
const pending = useQuery(() => countPendingPayments(tenantId.value), [bookingsVersion])
/** Money received, by the day it was paid (not the day the court is played). */
const collected = useQuery(() => getCollected(tenantId.value), [bookingsVersion])

const selectedId = ref<string | null>(null)
const nowHour = new Date().getHours()

const schedule = computed(() =>
  (todays.data.value ?? [])
    .filter((b) => b.status !== 'cancelled')
    .sort((a, b) => a.startHour - b.startHour || a.courtName.localeCompare(b.courtName)),
)
const upNext = computed(() => schedule.value.filter((b) => b.startHour + b.durationHours > nowHour))

const firstName = computed(() => session.persona?.name.split(' ')[0] ?? '')
const greeting = nowHour < 12 ? 'Good morning' : nowHour < 18 ? 'Good afternoon' : 'Good evening'

function refreshAll(): void {
  void todayStats.refresh()
  void month.refresh()
  void todays.refresh()
  void pending.refresh()
  void collected.refresh()
}
</script>

<template>
  <div>
    <PageHeader :eyebrow="formatWeekdayDate(today)" :title="`${greeting}, ${firstName}`">
      <template #description>
        Here's how {{ store.tenant!.name }} is doing across {{ store.activeLocations.length }}
        {{ store.activeLocations.length === 1 ? 'location' : 'locations' }}.
      </template>
      <template #actions>
        <AppButton variant="outline" :to="`/manage/${store.tenant!.slug}/calendar`"
          >Open calendar</AppButton
        >
      </template>
    </PageHeader>

    <div class="space-y-6">
      <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Bookings today"
          :value="
            todayStats.data.value ? formatNumber(todayStats.data.value.current.bookings) : '—'
          "
          :delta="
            todayStats.data.value
              ? percentChange(
                  todayStats.data.value.current.bookings,
                  todayStats.data.value.previous.bookings,
                )
              : null
          "
          delta-label="vs yesterday"
          :icon="CalendarCheck"
        />
        <StatTile
          label="Collected today"
          :value="collected.data.value ? formatPHP(collected.data.value.today) : '—'"
          :delta="
            collected.data.value
              ? percentChange(collected.data.value.today, collected.data.value.yesterday)
              : null
          "
          delta-label="vs yesterday"
          :icon="Wallet"
        />
        <StatTile
          label="Collected this month"
          :value="collected.data.value ? formatPHP(collected.data.value.month) : '—'"
          :delta="
            collected.data.value
              ? percentChange(collected.data.value.month, collected.data.value.lastMonthToDate)
              : null
          "
          delta-label="vs same days last month"
          :icon="Banknote"
        />
        <StatTile
          label="Court occupancy today"
          :value="
            todayStats.data.value ? formatPercent(todayStats.data.value.current.occupancy) : '—'
          "
          hint="Booked hours ÷ open court-hours"
          :icon="Gauge"
        />
        <StatTile
          label="Payments to review"
          :value="String(pending.data.value ?? '—')"
          :hint="pending.data.value ? 'GCash / transfer proofs waiting' : 'All caught up'"
          :icon="Clock"
        />
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <AppCard class="lg:col-span-2" title="Revenue by play date, last 30 days">
          <template #actions>
            <span v-if="month.data.value" class="tabular text-charcoal-700 text-sm font-semibold">
              {{ formatPHP(month.data.value.current.revenue) }}
            </span>
          </template>
          <LoadingState v-if="!month.data.value" :rows="5" />
          <LineChart
            v-else
            label="Daily revenue, last 30 days"
            :labels="month.data.value.daily.map((d) => formatShortDate(d.date))"
            :series="[
              {
                name: 'Revenue',
                values: month.data.value.daily.map((d) => d.revenue),
                color: 'var(--color-brand-600)',
              },
            ]"
            :format-value="formatPHP"
            :format-tick="formatPHPCompact"
            :height="220"
          />
        </AppCard>

        <AppCard title="Up next today" :padded="false">
          <template #actions>
            <span class="text-charcoal-400 text-xs">{{ upNext.length }} remaining</span>
          </template>
          <LoadingState v-if="todays.loading.value && !todays.data.value" />
          <EmptyState
            v-else-if="!upNext.length"
            title="Nothing else today"
            description="No more bookings on the schedule."
          >
            <template #action>
              <AppButton size="sm" variant="outline" @click="openNewBooking({ date: today })">
                Add a booking
              </AppButton>
            </template>
          </EmptyState>
          <ul v-else class="divide-charcoal-100 max-h-[300px] divide-y overflow-y-auto">
            <li v-for="b in upNext.slice(0, 12)" :key="b.id">
              <button
                type="button"
                class="hover:bg-charcoal-50 flex w-full items-center gap-3 px-5 py-2.5 text-left"
                @click="selectedId = b.id"
              >
                <span
                  class="tabular text-charcoal-700 w-24 shrink-0 text-xs font-semibold whitespace-nowrap"
                >
                  {{ formatTimeRange(b.startHour, b.durationHours) }}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="text-charcoal-700 block truncate text-sm font-medium">{{
                    b.customerName
                  }}</span>
                  <span class="text-charcoal-400 block truncate text-xs"
                    >{{ b.locationName }} · {{ b.courtName }}</span
                  >
                </span>
                <StatusBadge
                  v-if="b.paymentStatus === 'unpaid'"
                  kind="payment"
                  :value="b.paymentStatus"
                />
              </button>
            </li>
          </ul>
        </AppCard>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <AppCard title="Occupancy by location" description="Last 30 days">
          <BarList
            v-if="month.data.value"
            :items="
              month.data.value.byLocation.map((l) => ({
                key: l.locationId,
                label: l.name,
                value: l.occupancy,
              }))
            "
            :max="1"
            :format-value="(v) => formatPercent(v)"
          />
        </AppCard>
        <AppCard title="Busiest courts" description="Occupancy, last 30 days">
          <BarList
            v-if="month.data.value"
            :items="
              [...month.data.value.byCourt]
                .sort((a, b) => b.occupancy - a.occupancy)
                .slice(0, 5)
                .map((c) => ({
                  key: c.courtId,
                  label: c.name,
                  sublabel: c.locationName,
                  value: c.occupancy,
                }))
            "
            :max="1"
            :format-value="(v) => formatPercent(v)"
          />
        </AppCard>
        <AppCard :title="`${store.plan?.name ?? ''} plan usage`">
          <template v-if="store.can('billing')" #actions>
            <RouterLink
              :to="`/manage/${store.tenant!.slug}/subscription`"
              class="text-brand-700 text-xs font-semibold hover:underline"
              >Manage</RouterLink
            >
          </template>
          <div class="space-y-4">
            <UsageMeter v-for="u in store.usage" :key="u.key" :item="u" compact />
          </div>
        </AppCard>
      </div>
    </div>

    <BookingDetailModal :booking-id="selectedId" @close="selectedId = null" @changed="refreshAll" />
  </div>
</template>
