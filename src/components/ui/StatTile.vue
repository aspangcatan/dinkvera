<script setup lang="ts">
import { TrendingDown, TrendingUp } from '@lucide/vue'
import { computed, type Component } from 'vue'

import Sparkline from '@/components/charts/SparkLine.vue'
import { formatPercent } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    label: string
    value: string
    /** Signed ratio vs the previous period; null = no comparison. */
    delta?: number | null
    deltaLabel?: string
    /** Whether a rise is good news (revenue) or bad (cancellations). */
    upIsGood?: boolean
    hint?: string
    icon?: Component
    trend?: number[]
  }>(),
  {
    delta: null,
    deltaLabel: 'vs previous period',
    upIsGood: true,
    hint: '',
    icon: undefined,
    trend: undefined,
  },
)

const good = computed(() =>
  props.delta === null ? null : props.delta === 0 ? null : props.delta > 0 === props.upIsGood,
)
</script>

<template>
  <div
    class="border-charcoal-100 min-w-0 rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
  >
    <div class="flex items-center justify-between gap-2">
      <p class="text-charcoal-400 text-xs font-medium">{{ label }}</p>
      <component :is="icon" v-if="icon" class="text-charcoal-300 size-4" aria-hidden="true" />
    </div>
    <div class="mt-2 flex items-end justify-between gap-3">
      <p class="text-charcoal-700 tabular text-2xl font-semibold tracking-tight">{{ value }}</p>
      <Sparkline v-if="trend && trend.length > 1" :values="trend" class="mb-1 h-8 w-20" />
    </div>
    <p v-if="delta !== null" class="mt-1.5 flex items-center gap-1 text-xs">
      <span
        class="tabular inline-flex items-center gap-0.5 font-semibold"
        :class="good === null ? 'text-charcoal-400' : good ? 'text-emerald-700' : 'text-red-700'"
      >
        <TrendingUp v-if="delta > 0" class="size-3.5" aria-hidden="true" />
        <TrendingDown v-else-if="delta < 0" class="size-3.5" aria-hidden="true" />
        {{ delta > 0 ? '+' : '' }}{{ formatPercent(delta, 1) }}
      </span>
      <span class="text-charcoal-400">{{ deltaLabel }}</span>
    </p>
    <p v-else-if="hint" class="text-charcoal-400 mt-1.5 text-xs">{{ hint }}</p>
  </div>
</template>
