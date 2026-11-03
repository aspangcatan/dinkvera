<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import { addMonths, formatMonth, parseISODate, toISODate, todayISO } from '@/utils/dates'

/**
 * Month grid date picker; dates outside [min, max] are disabled. `marked`
 * dates (already added to the booking) get a ring and a dot.
 */
const props = withDefaults(defineProps<{ min: string; max: string; marked?: string[] }>(), {
  marked: () => [],
})
const model = defineModel<string>({ required: true })
const markedSet = computed(() => new Set(props.marked))

const month = ref(model.value.slice(0, 7))
watch(model, (v) => (month.value = v.slice(0, 7)))

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const cells = computed(() => {
  const first = parseISODate(`${month.value}-01`)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const list: (string | null)[] = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= daysInMonth; d++) {
    list.push(toISODate(new Date(first.getFullYear(), first.getMonth(), d)))
  }
  return list
})

const canPrev = computed(() => month.value > props.min.slice(0, 7))
const canNext = computed(() => month.value < props.max.slice(0, 7))
const disabled = (d: string) => d < props.min || d > props.max
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <button
        type="button"
        class="text-charcoal-500 hover:bg-charcoal-100 rounded-lg p-2 disabled:opacity-30"
        :disabled="!canPrev"
        aria-label="Previous month"
        @click="month = addMonths(`${month}-01`, -1).slice(0, 7)"
      >
        <ChevronLeft class="size-4" aria-hidden="true" />
      </button>
      <p class="text-charcoal-700 text-sm font-semibold" aria-live="polite">
        {{ formatMonth(month) }}
      </p>
      <button
        type="button"
        class="text-charcoal-500 hover:bg-charcoal-100 rounded-lg p-2 disabled:opacity-30"
        :disabled="!canNext"
        aria-label="Next month"
        @click="month = addMonths(`${month}-01`, 1).slice(0, 7)"
      >
        <ChevronRight class="size-4" aria-hidden="true" />
      </button>
    </div>
    <div class="grid grid-cols-7 gap-1 text-center" role="grid" :aria-label="formatMonth(month)">
      <span v-for="w in WEEKDAYS" :key="w" class="text-charcoal-400 pb-1 text-[11px] font-medium">{{
        w
      }}</span>
      <template v-for="(d, i) in cells" :key="d ?? `pad-${i}`">
        <span v-if="!d" />
        <button
          v-else
          type="button"
          class="tabular relative aspect-square rounded-lg text-sm transition-colors disabled:cursor-not-allowed"
          :class="[
            d === model
              ? 'bg-brand-600 font-semibold text-white'
              : markedSet.has(d)
                ? 'bg-brand-50 text-brand-700 ring-brand-600 hover:bg-brand-100 font-semibold ring-2 ring-inset'
                : disabled(d)
                  ? 'text-charcoal-200'
                  : 'text-charcoal-600 hover:bg-brand-50',
          ]"
          :disabled="disabled(d)"
          :aria-pressed="d === model"
          :aria-label="
            markedSet.has(d)
              ? `${parseISODate(d).toDateString()}, added to your booking`
              : parseISODate(d).toDateString()
          "
          @click="model = d"
        >
          {{ Number(d.slice(8)) }}
          <span
            v-if="markedSet.has(d)"
            class="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full"
            :class="d === model ? 'bg-white' : 'bg-brand-600'"
            aria-hidden="true"
          />
          <span
            v-else-if="d === todayISO() && d !== model"
            class="bg-charcoal-300 absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full"
            aria-hidden="true"
          />
        </button>
      </template>
    </div>
  </div>
</template>
