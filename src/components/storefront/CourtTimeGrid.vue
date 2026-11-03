<script setup lang="ts">
import type { Court } from '@/types/venue'
import { formatPHP } from '@/utils/currency'
import { formatHour } from '@/utils/dates'
import type { HourTile, TileSelection } from '@/utils/timeTiles'

/**
 * The day's availability as a grid: one column per court, one row per
 * hour. Tap a start time, then a later time in the same court to book
 * longer (see utils/timeTiles.ts). Every court shares the location's
 * hours, so row `i` is the same hour in every column.
 */
const props = defineProps<{
  courts: Court[]
  /** Tiles per court id, all the same length (one per hour). */
  tilesByCourt: Record<string, HourTile[]>
  selection: (TileSelection & { courtId: string }) | null
}>()
const emit = defineEmits<{ tap: [courtId: string, index: number] }>()

const hours = () => props.tilesByCourt[props.courts[0]?.id ?? '']?.map((t) => t.hour) ?? []

function isPicked(courtId: string, index: number): boolean {
  const s = props.selection
  return !!s && s.courtId === courtId && index >= s.start && index < s.start + s.count
}
function isStart(courtId: string, index: number): boolean {
  return props.selection?.courtId === courtId && props.selection.start === index
}

function cellClass(tile: HourTile, courtId: string, index: number): string {
  if (isPicked(courtId, index)) return 'border-brand-600 bg-brand-600 text-white'
  switch (tile.status) {
    case 'available':
      return 'border-brand-200 bg-white text-brand-700 hover:border-brand-600 hover:bg-brand-50'
    case 'added':
      return 'border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-600'
    case 'booked':
      return 'border-charcoal-100 bg-charcoal-50 text-charcoal-300'
    default:
      return 'border-transparent bg-transparent text-charcoal-300'
  }
}

/** Free hours start or extend a pick; added ones reopen that pick for changes. */
function tappable(tile: HourTile): boolean {
  return tile.status === 'available' || tile.status === 'added'
}

function label(tile: HourTile, courtId: string, index: number): string {
  if (isStart(courtId, index)) return 'Start'
  if (isPicked(courtId, index)) return '✓'
  if (tile.status === 'available') return formatPHP(tile.price)
  if (tile.status === 'added') return 'Added'
  if (tile.status === 'booked') return 'Booked'
  return '—'
}

function ariaLabel(court: Court, tile: HourTile, index: number): string {
  const when = `${court.name}, ${formatHour(tile.hour)} to ${formatHour(tile.hour + 1)}`
  if (isPicked(court.id, index)) return `${when}, selected`
  if (tile.status === 'available') return `${when}, ${formatPHP(tile.price)}`
  if (tile.status === 'added') return `${when}, added, tap to change`
  return `${when}, ${tile.status === 'past' ? 'passed' : tile.status}`
}
</script>

<template>
  <div>
    <div class="overflow-x-auto">
      <table class="w-full min-w-[440px] border-separate border-spacing-1.5 text-sm">
        <caption class="sr-only">
          Available times per court
        </caption>
        <thead>
          <tr>
            <th scope="col" class="w-20"><span class="sr-only">Time</span></th>
            <th
              v-for="c in courts"
              :key="c.id"
              scope="col"
              class="text-charcoal-700 px-1 pb-1 text-left text-sm font-semibold"
            >
              {{ c.name }}
              <span class="text-charcoal-400 block text-xs font-normal capitalize">{{
                c.type
              }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(hour, index) in hours()" :key="hour">
            <th
              scope="row"
              class="text-charcoal-600 bg-warm-white sticky left-0 z-10 pr-2 text-left text-xs font-semibold whitespace-nowrap"
            >
              {{ formatHour(hour) }}
              <span class="text-charcoal-400 block text-[10px] font-normal">
                – {{ formatHour(hour + 1) }}
              </span>
            </th>
            <td v-for="c in courts" :key="c.id" class="p-0">
              <button
                v-if="tilesByCourt[c.id]?.[index]"
                type="button"
                class="tabular h-11 w-full rounded-lg border px-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed"
                :class="[
                  cellClass(tilesByCourt[c.id]![index]!, c.id, index),
                  tilesByCourt[c.id]![index]!.status === 'booked' ? 'line-through' : '',
                ]"
                :disabled="!tappable(tilesByCourt[c.id]![index]!)"
                :aria-pressed="isPicked(c.id, index)"
                :aria-label="ariaLabel(c, tilesByCourt[c.id]![index]!, index)"
                @click="emit('tap', c.id, index)"
              >
                {{ label(tilesByCourt[c.id]![index]!, c.id, index) }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ul class="text-charcoal-500 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
      <li class="flex items-center gap-1.5">
        <span class="border-brand-200 size-3 rounded border bg-white" /> Available
      </li>
      <li class="flex items-center gap-1.5">
        <span class="bg-brand-600 size-3 rounded" /> Selected
      </li>
      <li class="flex items-center gap-1.5">
        <span class="border-brand-200 bg-brand-50 size-3 rounded border" /> Added
      </li>
      <li class="flex items-center gap-1.5">
        <span class="border-charcoal-100 bg-charcoal-50 size-3 rounded border" /> Booked
      </li>
    </ul>
  </div>
</template>
