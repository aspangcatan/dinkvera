<script setup lang="ts">
import { Download, Plus } from '@lucide/vue'
import { computed, ref } from 'vue'

import BookingDetailModal from '@/components/booking/BookingDetailModal.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useNewBooking } from '@/composables/useNewBooking'
import { useQuery } from '@/composables/useQuery'
import { listBookings, type BookingRow } from '@/services/bookingService'
import { useTenantStore } from '@/stores/tenant'
import type { BookingStatus, PaymentStatus } from '@/types/booking'
import type { Column } from '@/types/ui'
import { formatPHP } from '@/utils/currency'
import { downloadCsv } from '@/utils/csv'
import { groupBookings, type BookingGroup } from '@/utils/bookingGroups'
import {
  addDays,
  formatHour,
  formatLongDate,
  formatShortDate,
  formatTimeRange,
  todayISO,
} from '@/utils/dates'
import { bookingStatus, paymentStatus, sourceLabels } from '@/utils/labels'

const store = useTenantStore()
const { openNewBooking, bookingsVersion } = useNewBooking()

type Range = 'upcoming' | 'today' | 'past30' | 'all'
const range = ref<Range>('upcoming')
const locationId = ref('')
const status = ref<BookingStatus | ''>('')
const payment = ref<PaymentStatus | ''>('')
const search = ref('')

const dates = computed(() => {
  const t = todayISO()
  return {
    upcoming: { from: t, to: undefined },
    today: { from: t, to: t },
    past30: { from: addDays(t, -30), to: addDays(t, -1) },
    all: { from: undefined, to: undefined },
  }[range.value]
})

const bookings = useQuery(
  () =>
    listBookings(store.tenant!.id, {
      ...dates.value,
      locationId: locationId.value,
      status: status.value,
      paymentStatus: payment.value,
      search: search.value,
    }),
  [dates, locationId, status, payment, search, bookingsVersion],
)

/** One row per booking: slots booked together ("Add date") share a row. */
const groups = computed(() => groupBookings(bookings.data.value ?? []))

const startKey = (b: BookingRow) => `${b.date}-${String(b.startHour).padStart(2, '0')}`

const columns: Column<BookingGroup>[] = [
  { key: 'reference', label: 'Ref', sortable: true },
  { key: 'when', label: 'Date & time', sortable: true, sortBy: (g) => startKey(g.first) },
  { key: 'customerName', label: 'Customer', sortable: true, sortBy: (g) => g.first.customerName },
  {
    key: 'court',
    label: 'Court',
    sortable: true,
    sortBy: (g) => `${g.first.locationName} ${g.first.courtName}`,
    hideBelow: 'md',
  },
  { key: 'source', label: 'Source', hideBelow: 'lg' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'paymentStatus', label: 'Payment', sortable: true, hideBelow: 'sm' },
  { key: 'amount', label: 'Amount', align: 'right', sortable: true, sortBy: (g) => g.total },
]

/** "Thu, Nov 12, 2026" or "Nov 12 – Nov 14, 2026" for several dates. */
function groupDates(g: BookingGroup): string {
  if (g.dates.length === 1) return formatLongDate(g.dates[0]!)
  return `${formatShortDate(g.dates[0]!)} – ${formatLongDate(g.dates.at(-1)!).replace(/^\w+, /, '')}`
}

/** "12 AM – 3 AM", or "3 times · 12 AM – 6 AM" for several slots. */
function groupTimes(g: BookingGroup): string {
  if (g.bookings.length === 1) return formatTimeRange(g.first.startHour, g.first.durationHours)
  const start = Math.min(...g.bookings.map((b) => b.startHour))
  const end = Math.max(...g.bookings.map((b) => b.startHour + b.durationHours))
  return `${g.bookings.length} times · ${formatHour(start)} – ${formatHour(end)}`
}

const selectedId = ref<string | null>(null)
const summary = computed(() => {
  const list = groups.value
  return {
    count: list.length,
    value: list.filter((g) => g.status !== 'cancelled').reduce((s, g) => s + g.total, 0),
    unpaid: list.filter((g) => g.paymentStatus === 'unpaid' && g.status !== 'cancelled').length,
  }
})

function exportCsv(): void {
  const rows = bookings.data.value ?? []
  downloadCsv(
    `${store.tenant!.slug}-bookings-${todayISO()}.csv`,
    [
      'Reference',
      'Date',
      'Start',
      'Hours',
      'Location',
      'Court',
      'Customer',
      'Phone',
      'Status',
      'Payment',
      'Amount (PHP)',
      'Source',
    ],
    rows.map((b) => [
      b.reference,
      b.date,
      formatHour(b.startHour),
      b.durationHours,
      b.locationName,
      b.courtName,
      b.customerName,
      b.customerPhone,
      bookingStatus[b.status].label,
      paymentStatus[b.paymentStatus].label,
      b.amount / 100,
      sourceLabels[b.source],
    ]),
  )
}
</script>

<template>
  <div>
    <PageHeader title="Bookings" description="Every court booking across your locations.">
      <template #actions>
        <AppButton variant="outline" :disabled="!bookings.data.value?.length" @click="exportCsv">
          <template #icon-left><Download class="size-4" aria-hidden="true" /></template>
          Export CSV
        </AppButton>
        <AppButton @click="openNewBooking()">
          <template #icon-left><Plus class="size-4" aria-hidden="true" /></template>
          New booking
        </AppButton>
      </template>
    </PageHeader>

    <AppCard :padded="false">
      <div class="border-charcoal-100 space-y-3 border-b p-4">
        <div class="flex flex-wrap items-center gap-3">
          <SegmentedControl
            v-model="range"
            label="Date range"
            :options="[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'today', label: 'Today' },
              { value: 'past30', label: 'Past 30 days' },
              { value: 'all', label: 'All' },
            ]"
          />
          <p class="text-charcoal-400 ml-auto text-xs">
            <span class="text-charcoal-700 tabular font-semibold">{{
              summary.count.toLocaleString('en-PH')
            }}</span>
            bookings ·
            <span class="text-charcoal-700 tabular font-semibold">{{
              formatPHP(summary.value)
            }}</span>
            <template v-if="summary.unpaid">
              · <span class="text-amber-700">{{ summary.unpaid }} unpaid</span></template
            >
          </p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput v-model="search" placeholder="Ref, name or phone" />
          <AppSelect
            v-model="locationId"
            label="Location"
            hide-label
            placeholder="All locations"
            :options="store.locations.map((l) => ({ value: l.id, label: l.name }))"
          />
          <AppSelect
            v-model="status"
            label="Status"
            hide-label
            placeholder="Any status"
            :options="
              Object.entries(bookingStatus).map(([value, s]) => ({ value, label: s.label }))
            "
          />
          <AppSelect
            v-model="payment"
            label="Payment"
            hide-label
            placeholder="Any payment"
            :options="
              Object.entries(paymentStatus).map(([value, s]) => ({ value, label: s.label }))
            "
          />
        </div>
      </div>

      <DataTable
        label="Bookings"
        :columns="columns"
        :rows="groups"
        :row-key="(g) => g.key"
        :loading="bookings.loading.value && !bookings.data.value"
        :page-size="15"
        clickable
        empty-title="No bookings match"
        empty-description="Change the filters or date range."
        @row-click="(g) => (selectedId = g.first.id)"
      >
        <template #cell-reference="{ row }">
          <span class="text-charcoal-700 font-mono text-xs font-semibold">{{ row.reference }}</span>
        </template>
        <template #cell-when="{ row }">
          <p class="text-charcoal-700 whitespace-nowrap">{{ groupDates(row) }}</p>
          <p class="text-charcoal-400 text-xs">{{ groupTimes(row) }}</p>
        </template>
        <template #cell-customerName="{ row }">
          <p class="text-charcoal-700">{{ row.first.customerName }}</p>
          <p class="text-charcoal-400 text-xs">{{ row.first.customerPhone }}</p>
        </template>
        <template #cell-court="{ row }">
          {{ row.courtNames.length === 1 ? row.courtNames[0] : row.courtNames.join(', ') }}
          <span class="text-charcoal-400 block text-xs">{{ row.locationNames.join(', ') }}</span>
        </template>
        <template #cell-source="{ row }">{{ sourceLabels[row.first.source] }}</template>
        <template #cell-status="{ row }">
          <AppBadge v-if="row.status === 'mixed'">Mixed</AppBadge>
          <StatusBadge v-else kind="booking" :value="row.status" />
        </template>
        <template #cell-paymentStatus="{ row }">
          <AppBadge v-if="row.paymentStatus === 'mixed'">Mixed</AppBadge>
          <StatusBadge v-else kind="payment" :value="row.paymentStatus" />
        </template>
        <template #cell-amount="{ row }">
          <span class="tabular text-charcoal-700 font-medium">{{ formatPHP(row.total) }}</span>
        </template>
      </DataTable>
    </AppCard>

    <BookingDetailModal
      :booking-id="selectedId"
      @close="selectedId = null"
      @changed="bookings.refresh()"
    />
  </div>
</template>
