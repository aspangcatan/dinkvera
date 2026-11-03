<script setup lang="ts">
import { Plus, Wrench } from '@lucide/vue'
import { computed } from 'vue'

import type { BookingRow } from '@/services/bookingService'
import type { Court, Location } from '@/types/venue'
import { formatHour, todayISO } from '@/utils/dates'

/**
 * One location's day: a column per court, a row per hour. Booking blocks
 * span their duration; empty cells open "New booking" for that slot.
 */
const props = defineProps<{
  location: Location
  courts: Court[]
  bookings: BookingRow[]
  date: string
  canBook: boolean
}>()

const emit = defineEmits<{
  select: [bookingId: string]
  create: [slot: { courtId: string; startHour: number }]
}>()

const ROW = 56 // px per hour

const hours = computed(() =>
  Array.from(
    { length: props.location.closeHour - props.location.openHour },
    (_, i) => props.location.openHour + i,
  ),
)

const byCourt = computed(() => {
  const map = new Map<string, BookingRow[]>()
  for (const b of props.bookings) map.set(b.courtId, [...(map.get(b.courtId) ?? []), b])
  return map
})

function isTaken(courtId: string, hour: number): boolean {
  return (byCourt.value.get(courtId) ?? []).some(
    (b) => b.startHour <= hour && hour < b.startHour + b.durationHours,
  )
}

const now = new Date()
const nowOffset = computed(() => {
  if (props.date !== todayISO()) return null
  const h = now.getHours() + now.getMinutes() / 60
  if (h < props.location.openHour || h > props.location.closeHour) return null
  return (h - props.location.openHour) * ROW
})
const isPastSlot = (hour: number) =>
  props.date < todayISO() || (props.date === todayISO() && hour < now.getHours())

const blockTone: Record<string, string> = {
  confirmed: 'bg-brand-50 border-brand-600 text-brand-900',
  pending: 'bg-amber-50 border-amber-500 text-amber-900 border-dashed',
  completed: 'bg-charcoal-50 border-charcoal-300 text-charcoal-600',
  no_show: 'bg-red-50 border-red-400 text-red-800',
}
</script>

<template>
  <div class="overflow-x-auto">
    <div
      class="grid min-w-full"
      :style="{ gridTemplateColumns: `4rem repeat(${courts.length}, minmax(9rem, 1fr))` }"
    >
      <!-- Header row -->
      <div class="border-charcoal-100 sticky left-0 z-20 border-b bg-white" />
      <div
        v-for="court in courts"
        :key="court.id"
        class="border-charcoal-100 border-b border-l bg-white px-3 py-2.5"
      >
        <p class="text-charcoal-700 text-sm font-semibold">{{ court.name }}</p>
        <p class="text-charcoal-400 text-xs capitalize">
          {{ court.status === 'active' ? court.type : court.status }}
        </p>
      </div>

      <!-- Hour labels -->
      <div class="border-charcoal-100 sticky left-0 z-10 bg-white">
        <div
          v-for="h in hours"
          :key="h"
          class="text-charcoal-400 tabular border-charcoal-100 border-b pt-1 pr-2 text-right text-[11px]"
          :style="{ height: `${ROW}px` }"
        >
          {{ formatHour(h) }}
        </div>
      </div>

      <!-- Court columns -->
      <div
        v-for="court in courts"
        :key="court.id"
        class="border-charcoal-100 relative border-l"
        :class="court.status !== 'active' ? 'maintenance' : ''"
      >
        <template v-if="court.status === 'active'">
          <template v-for="h in hours" :key="h">
            <button
              v-if="canBook && !isTaken(court.id, h) && !isPastSlot(h)"
              type="button"
              class="group border-charcoal-100 hover:bg-brand-50/60 flex w-full items-center justify-center border-b"
              :style="{ height: `${ROW}px` }"
              :aria-label="`Book ${court.name} at ${formatHour(h)}`"
              @click="emit('create', { courtId: court.id, startHour: h })"
            >
              <Plus
                class="text-brand-600 size-4 opacity-0 group-hover:opacity-100"
                aria-hidden="true"
              />
            </button>
            <div
              v-else
              class="border-charcoal-100 border-b"
              :class="isPastSlot(h) && !isTaken(court.id, h) ? 'bg-charcoal-50/50' : ''"
              :style="{ height: `${ROW}px` }"
            />
          </template>
        </template>
        <div
          v-else
          class="text-charcoal-400 flex flex-col items-center justify-center gap-1 text-xs"
          :style="{ height: `${hours.length * ROW}px` }"
        >
          <Wrench class="size-4" aria-hidden="true" />
          {{ court.status === 'maintenance' ? 'Under maintenance' : 'Inactive' }}
        </div>

        <!-- "Now" line -->
        <div
          v-if="nowOffset !== null"
          class="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500"
          :style="{ top: `${nowOffset}px` }"
          aria-hidden="true"
        />

        <!-- Bookings -->
        <button
          v-for="b in byCourt.get(court.id) ?? []"
          :key="b.id"
          type="button"
          class="absolute inset-x-1 overflow-hidden rounded-lg border-l-4 px-2 py-1.5 text-left shadow-sm transition-shadow hover:shadow-md"
          :class="blockTone[b.status] ?? blockTone.confirmed"
          :style="{
            top: `${(b.startHour - location.openHour) * ROW + 2}px`,
            height: `${b.durationHours * ROW - 4}px`,
          }"
          @click="emit('select', b.id)"
        >
          <p class="truncate text-xs font-semibold">{{ b.customerName }}</p>
          <p class="truncate text-[11px] opacity-80">
            {{ formatHour(b.startHour) }} – {{ formatHour(b.startHour + b.durationHours) }}
            <template v-if="b.paymentStatus === 'unpaid'"> · unpaid</template>
          </p>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.maintenance {
  background-image: repeating-linear-gradient(
    135deg,
    transparent 0 8px,
    rgb(0 0 0 / 0.035) 8px 16px
  );
}
</style>
