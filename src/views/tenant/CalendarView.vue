<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BookingDetailModal from '@/components/booking/BookingDetailModal.vue'
import DayScheduleGrid from '@/components/booking/DayScheduleGrid.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useNewBooking } from '@/composables/useNewBooking'
import { useQuery } from '@/composables/useQuery'
import { getDaySchedule, listBookings } from '@/services/bookingService'
import { useTenantStore } from '@/stores/tenant'
import { formatPHP } from '@/utils/currency'
import {
  addDays,
  formatHour,
  formatShortDate,
  formatWeekdayDate,
  parseISODate,
  startOfWeek,
  todayISO,
} from '@/utils/dates'

const store = useTenantStore()
const route = useRoute()
const router = useRouter()
const { openNewBooking, bookingsVersion } = useNewBooking()

// Location, date and view live in the URL so a link reopens the same day.
const locationId = ref(String(route.query.location ?? store.activeLocations[0]?.id ?? ''))
const date = ref(String(route.query.date ?? todayISO()))
const view = ref<'day' | 'week'>(route.query.view === 'week' ? 'week' : 'day')
watch([locationId, date, view], () => {
  void router.replace({ query: { location: locationId.value, date: date.value, view: view.value } })
})

const day = useQuery(
  () => getDaySchedule(locationId.value, date.value),
  [locationId, date, bookingsVersion],
)

const weekStart = computed(() => startOfWeek(date.value))
const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart.value, i)))
const week = useQuery(
  () =>
    listBookings(store.tenant!.id, {
      locationId: locationId.value,
      from: weekStart.value,
      to: addDays(weekStart.value, 6),
    }),
  [locationId, weekStart, bookingsVersion],
)

const location = computed(() => store.locations.find((l) => l.id === locationId.value))
const activeCourts = computed(
  () => day.data.value?.courts.filter((c) => c.status === 'active').length ?? 0,
)

function shift(direction: number): void {
  date.value = addDays(date.value, direction * (view.value === 'week' ? 7 : 1))
}

const daySummary = computed(() => {
  const rows = (day.data.value?.bookings ?? []).filter((b) => b.status !== 'cancelled')
  return {
    count: rows.length,
    hours: rows.reduce((s, b) => s + b.durationHours, 0),
    revenue: rows.reduce((s, b) => s + b.amount, 0),
    unpaid: rows.filter((b) => b.paymentStatus === 'unpaid').length,
  }
})

/** Week heat-grid: how many courts are booked in each hour of each day. */
const weekHours = computed(() => {
  const loc = location.value
  return loc ? Array.from({ length: loc.closeHour - loc.openHour }, (_, i) => loc.openHour + i) : []
})
const weekCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const b of week.data.value ?? []) {
    if (b.status === 'cancelled') continue
    for (let h = b.startHour; h < b.startHour + b.durationHours; h++) {
      const key = `${b.date}|${h}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
})
function heat(dayIso: string, hour: number): { count: number; ratio: number } {
  const count = weekCounts.value.get(`${dayIso}|${hour}`) ?? 0
  return { count, ratio: activeCourts.value ? count / activeCourts.value : 0 }
}
// Sequential single-hue ramp (brand), light → dark.
function heatClass(ratio: number): string {
  if (ratio === 0) return 'bg-white text-charcoal-300'
  if (ratio < 0.34) return 'bg-brand-100 text-brand-800'
  if (ratio < 0.67) return 'bg-brand-300 text-brand-900'
  if (ratio < 1) return 'bg-brand-600 text-white'
  return 'bg-brand-800 text-white'
}

function openDay(d: string): void {
  date.value = d
  view.value = 'day'
}

const selectedId = ref<string | null>(null)
const dayLabel = (d: string) => parseISODate(d).toLocaleDateString('en-PH', { weekday: 'short' })
</script>

<template>
  <div>
    <PageHeader
      title="Calendar"
      description="Court schedule by location. Click an open slot to book it."
    >
      <template #actions>
        <SegmentedControl
          v-model="view"
          label="Calendar view"
          :options="[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
          ]"
        />
      </template>
    </PageHeader>

    <AppCard :padded="false">
      <div class="border-charcoal-100 flex flex-wrap items-center gap-3 border-b p-4">
        <AppSelect
          v-model="locationId"
          label="Location"
          hide-label
          :options="store.locations.map((l) => ({ value: l.id, label: l.name }))"
          class="w-full sm:w-52"
        />
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="text-charcoal-500 hover:bg-charcoal-100 rounded-lg p-2"
            :aria-label="view === 'week' ? 'Previous week' : 'Previous day'"
            @click="shift(-1)"
          >
            <ChevronLeft class="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="text-charcoal-500 hover:bg-charcoal-100 rounded-lg p-2"
            :aria-label="view === 'week' ? 'Next week' : 'Next day'"
            @click="shift(1)"
          >
            <ChevronRight class="size-4" aria-hidden="true" />
          </button>
          <AppButton size="sm" variant="outline" class="ml-1" @click="date = todayISO()"
            >Today</AppButton
          >
        </div>
        <p class="text-charcoal-700 text-sm font-semibold">
          <template v-if="view === 'day'">{{ formatWeekdayDate(date) }}</template>
          <template v-else>
            {{ formatShortDate(weekDays[0]!) }} – {{ formatShortDate(weekDays[6]!) }}
          </template>
        </p>
        <label class="ml-auto">
          <span class="sr-only">Jump to date</span>
          <input
            v-model="date"
            type="date"
            class="border-charcoal-200 text-charcoal-600 h-9 rounded-lg border px-2 text-sm"
          />
        </label>
      </div>

      <!-- Day -->
      <template v-if="view === 'day'">
        <div
          v-if="day.data.value"
          class="text-charcoal-500 border-charcoal-100 flex flex-wrap gap-x-6 gap-y-1 border-b px-4 py-2.5 text-xs"
        >
          <span
            ><span class="text-charcoal-700 tabular font-semibold">{{ daySummary.count }}</span>
            bookings</span
          >
          <span
            ><span class="text-charcoal-700 tabular font-semibold">{{ daySummary.hours }}</span>
            court-hours</span
          >
          <span
            ><span class="text-charcoal-700 tabular font-semibold">{{
              formatPHP(daySummary.revenue)
            }}</span>
            booked</span
          >
          <span v-if="daySummary.unpaid" class="text-amber-700"
            >{{ daySummary.unpaid }} unpaid</span
          >
          <span class="ml-auto flex items-center gap-3">
            <span class="flex items-center gap-1.5"
              ><span
                class="border-brand-600 bg-brand-50 size-2.5 rounded-sm border-l-2"
              />Confirmed</span
            >
            <span class="flex items-center gap-1.5"
              ><span class="size-2.5 rounded-sm border-l-2 border-amber-500 bg-amber-50" />Awaiting
              payment</span
            >
            <span class="flex items-center gap-1.5"
              ><span
                class="bg-charcoal-50 border-charcoal-300 size-2.5 rounded-sm border-l-2"
              />Completed</span
            >
          </span>
        </div>
        <LoadingState v-if="day.loading.value && !day.data.value" :rows="8" />
        <EmptyState
          v-else-if="day.data.value && !day.data.value.courts.length"
          title="No courts at this location"
          description="Add courts under Locations & courts."
        />
        <DayScheduleGrid
          v-else-if="day.data.value"
          :location="day.data.value.location"
          :courts="day.data.value.courts"
          :bookings="day.data.value.bookings"
          :date="date"
          :can-book="store.can('bookings')"
          :class="day.loading.value ? 'opacity-60' : ''"
          @select="(id) => (selectedId = id)"
          @create="(slot) => openNewBooking({ locationId, date, ...slot })"
        />
      </template>

      <!-- Week -->
      <div v-else class="overflow-x-auto p-4">
        <LoadingState v-if="week.loading.value && !week.data.value" :rows="8" />
        <table v-else class="w-full min-w-[640px] border-separate border-spacing-0.5 text-xs">
          <caption class="sr-only">
            Courts booked per hour this week
          </caption>
          <thead>
            <tr>
              <th class="w-14" />
              <th v-for="d in weekDays" :key="d" scope="col" class="pb-2 font-medium">
                <button
                  type="button"
                  class="hover:bg-charcoal-100 w-full rounded-lg py-1"
                  :class="d === todayISO() ? 'text-brand-700' : 'text-charcoal-500'"
                  @click="openDay(d)"
                >
                  {{ dayLabel(d) }}
                  <span class="text-charcoal-700 block text-sm font-semibold">{{
                    d.slice(8)
                  }}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in weekHours" :key="h">
              <th scope="row" class="text-charcoal-400 tabular pr-2 text-right font-normal">
                {{ formatHour(h) }}
              </th>
              <td v-for="d in weekDays" :key="d" class="p-0">
                <button
                  type="button"
                  class="tabular h-7 w-full rounded"
                  :class="heatClass(heat(d, h).ratio)"
                  :title="`${dayLabel(d)} ${formatHour(h)}: ${heat(d, h).count} of ${activeCourts} courts booked`"
                  @click="openDay(d)"
                >
                  {{ heat(d, h).count || '' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="text-charcoal-500 mt-3 flex flex-wrap items-center gap-2 text-xs">
          Courts booked of {{ activeCourts }}:
          <span class="border-charcoal-100 size-3 rounded border bg-white" /> none
          <span class="bg-brand-100 size-3 rounded" /> some
          <span class="bg-brand-300 size-3 rounded" /> half
          <span class="bg-brand-600 size-3 rounded" /> most
          <span class="bg-brand-800 size-3 rounded" /> full
        </div>
      </div>
    </AppCard>

    <BookingDetailModal
      :booking-id="selectedId"
      @close="selectedId = null"
      @changed="(day.refresh(), week.refresh())"
    />
  </div>
</template>
