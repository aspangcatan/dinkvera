<script setup lang="ts">
import { Download } from '@lucide/vue'
import { computed, ref } from 'vue'

import BarChart from '@/components/charts/BarChart.vue'
import BarList from '@/components/charts/BarList.vue'
import LineChart from '@/components/charts/LineChart.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import StatTile from '@/components/ui/StatTile.vue'
import { useQuery } from '@/composables/useQuery'
import { getTenantAnalytics } from '@/services/analyticsService'
import { useTenantStore } from '@/stores/tenant'
import { formatPHP, formatPHPCompact } from '@/utils/currency'
import { downloadCsv } from '@/utils/csv'
import { addDays, formatHour, formatShortDate, todayISO } from '@/utils/dates'
import { formatNumber, formatPercent, percentChange } from '@/utils/format'

const store = useTenantStore()
type Span = '7' | '30' | '90'
const span = ref<Span>('30')
const locationId = ref('')

const range = computed(() => ({
  from: addDays(todayISO(), -(Number(span.value) - 1)),
  to: todayISO(),
  locationId: locationId.value || undefined,
}))
const { data, loading, error, refresh } = useQuery(
  () => getTenantAnalytics(store.tenant!.id, range.value),
  [range],
)

const vs = computed(() => `vs prior ${span.value} days`)
const c = computed(() => data.value!.current)
const p = computed(() => data.value!.previous)

/** Daily points get noisy past a month; group 90 days into weeks. */
const series = computed(() => {
  const daily = data.value?.daily ?? []
  if (span.value !== '90') return daily.map((d) => ({ label: formatShortDate(d.date), ...d }))
  const weeks = []
  for (let i = 0; i < daily.length; i += 7) {
    const chunk = daily.slice(i, i + 7)
    weeks.push({
      label: `Wk of ${formatShortDate(chunk[0]!.date)}`,
      date: chunk[0]!.date,
      revenue: chunk.reduce((s, d) => s + d.revenue, 0),
      bookings: chunk.reduce((s, d) => s + d.bookings, 0),
    })
  }
  return weeks
})

function exportCsv(): void {
  downloadCsv(
    `${store.tenant!.slug}-report-${range.value.from}-to-${range.value.to}.csv`,
    ['Date', 'Bookings', 'Revenue (PHP)'],
    (data.value?.daily ?? []).map((d) => [d.date, d.bookings, d.revenue / 100]),
  )
}
</script>

<template>
  <div>
    <PageHeader title="Reports" description="Revenue, occupancy and demand across your courts.">
      <template #actions>
        <AppButton variant="outline" :disabled="!data" @click="exportCsv">
          <template #icon-left><Download class="size-4" aria-hidden="true" /></template>
          Export
        </AppButton>
      </template>
    </PageHeader>

    <!-- Filters: one row above all charts -->
    <div class="mb-6 flex flex-wrap items-center gap-3">
      <SegmentedControl
        v-model="span"
        label="Period"
        :options="[
          { value: '7', label: 'Last 7 days' },
          { value: '30', label: '30 days' },
          { value: '90', label: '90 days' },
        ]"
      />
      <AppSelect
        v-model="locationId"
        label="Location"
        hide-label
        placeholder="All locations"
        :options="store.locations.map((l) => ({ value: l.id, label: l.name }))"
        class="w-48"
      />
      <span v-if="loading && data" class="text-charcoal-400 text-xs">Updating…</span>
    </div>

    <ErrorState v-if="error" :message="error" @retry="refresh" />
    <LoadingState v-else-if="!data" :rows="8" />

    <div v-else class="space-y-6" :class="loading ? 'opacity-70' : ''">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Revenue"
          :value="formatPHP(c.revenue)"
          :delta="percentChange(c.revenue, p.revenue)"
          :delta-label="vs"
        />
        <StatTile
          label="Bookings"
          :value="formatNumber(c.bookings)"
          :delta="percentChange(c.bookings, p.bookings)"
          :delta-label="vs"
        />
        <StatTile
          label="Occupancy"
          :value="formatPercent(c.occupancy, 1)"
          :delta="percentChange(c.occupancy, p.occupancy)"
          :delta-label="vs"
        />
        <StatTile
          label="Avg. booking value"
          :value="formatPHP(c.averageBookingValue)"
          :delta="percentChange(c.averageBookingValue, p.averageBookingValue)"
          :delta-label="vs"
        />
        <StatTile
          label="Unique players"
          :value="formatNumber(c.uniqueCustomers)"
          :delta="percentChange(c.uniqueCustomers, p.uniqueCustomers)"
          :delta-label="vs"
        />
        <StatTile
          label="Court-hours booked"
          :value="formatNumber(c.bookedHours)"
          :delta="percentChange(c.bookedHours, p.bookedHours)"
          :delta-label="vs"
        />
        <StatTile
          label="Cancellation rate"
          :value="formatPercent(c.cancellationRate, 1)"
          :delta="percentChange(c.cancellationRate, p.cancellationRate)"
          :delta-label="vs"
          :up-is-good="false"
        />
        <StatTile
          label="No-show rate"
          :value="formatPercent(c.noShowRate, 1)"
          :delta="percentChange(c.noShowRate, p.noShowRate)"
          :delta-label="vs"
          :up-is-good="false"
        />
      </div>

      <AppCard :title="span === '90' ? 'Revenue by week' : 'Revenue by day'">
        <LineChart
          label="Revenue over the selected period"
          :labels="series.map((d) => d.label)"
          :series="[
            {
              name: 'Revenue',
              values: series.map((d) => d.revenue),
              color: 'var(--color-brand-600)',
            },
          ]"
          :format-value="formatPHP"
          :format-tick="formatPHPCompact"
        />
      </AppCard>

      <div class="grid gap-6 lg:grid-cols-2">
        <AppCard title="Demand by hour" description="Court-hours booked, by start of hour">
          <BarChart
            label="Court-hours booked by hour of day"
            :data="
              data.byHour.map((h) => ({
                label: formatHour(h.hour).replace(' ', ''),
                detail: formatHour(h.hour),
                value: h.bookings,
              }))
            "
            :format-value="(v) => `${formatNumber(v)} court-hours`"
            :format-tick="(v) => formatNumber(v)"
          />
        </AppCard>
        <AppCard
          title="Bookings by day"
          :description="span === '90' ? 'Weekly totals' : 'Daily totals'"
        >
          <BarChart
            label="Bookings over the selected period"
            :data="
              series.map((d) => ({
                label: d.label.replace('Wk of ', ''),
                detail: d.label,
                value: d.bookings,
              }))
            "
            :highlight="series.length - 1"
            :format-value="(v) => `${formatNumber(v)} bookings`"
            :format-tick="(v) => formatNumber(v)"
          />
        </AppCard>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <AppCard title="Occupancy by court">
          <BarList
            :items="
              [...data.byCourt]
                .sort((a, b) => b.occupancy - a.occupancy)
                .map((x) => ({
                  key: x.courtId,
                  label: x.name,
                  sublabel: x.locationName,
                  value: x.occupancy,
                }))
            "
            :max="1"
            :format-value="(v) => formatPercent(v)"
          />
        </AppCard>
        <AppCard title="Revenue by location">
          <BarList
            :items="
              data.byLocation.map((l) => ({
                key: l.locationId,
                label: l.name,
                sublabel: `${formatNumber(l.bookings)} bookings`,
                value: l.revenue,
              }))
            "
            :format-value="formatPHP"
          />
        </AppCard>
        <div class="space-y-6">
          <AppCard title="Where bookings come from">
            <BarList
              :items="data.bySource.map((s) => ({ key: s.key, label: s.label, value: s.value }))"
              :format-value="(v) => formatNumber(v)"
            />
          </AppCard>
          <AppCard title="Payment methods">
            <BarList :items="data.byMethod" :format-value="formatPHP" />
          </AppCard>
        </div>
      </div>
    </div>
  </div>
</template>
