<script setup lang="ts">
import { computed } from 'vue'

export interface BarListItem {
  key: string
  label: string
  sublabel?: string
  value: number
}

/**
 * Ranked horizontal bars (courts by occupancy, revenue by method…). Plain
 * HTML so long labels wrap instead of colliding. Values sit outside the
 * bar, in text color.
 */
const props = withDefaults(
  defineProps<{
    items: BarListItem[]
    formatValue?: (v: number) => string
    /** Fixed scale maximum (e.g. 1 for ratios); defaults to the largest value. */
    max?: number
  }>(),
  { formatValue: (v: number) => v.toLocaleString('en-PH'), max: undefined },
)

const scale = computed(() => props.max ?? Math.max(...props.items.map((i) => i.value), 1))
</script>

<template>
  <ul class="space-y-3">
    <li v-for="item in items" :key="item.key">
      <div class="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span class="text-charcoal-600 min-w-0 truncate">
          {{ item.label }}
          <span v-if="item.sublabel" class="text-charcoal-400 text-xs"> · {{ item.sublabel }}</span>
        </span>
        <span class="text-charcoal-700 tabular shrink-0 font-semibold">{{
          formatValue(item.value)
        }}</span>
      </div>
      <div class="bg-brand-50 h-2 overflow-hidden rounded-full">
        <div
          class="bg-brand-600 h-full rounded-full"
          :style="{ width: `${Math.max((item.value / scale) * 100, item.value > 0 ? 1.5 : 0)}%` }"
        />
      </div>
    </li>
  </ul>
</template>
