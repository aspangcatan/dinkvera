<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

import { useElementWidth } from '@/composables/useElementWidth'
import { columnPath, labelStride, niceTicks } from '@/utils/chart'

export interface BarDatum {
  label: string
  value: number
  /** Longer label for the tooltip. */
  detail?: string
}

/**
 * Single-series column chart. Columns are capped at 24px with a 4px
 * rounded top on a square baseline; per-column hover tooltip; only the
 * peak gets a direct label.
 */
const props = withDefaults(
  defineProps<{
    data: BarDatum[]
    formatValue?: (v: number) => string
    formatTick?: (v: number) => string
    height?: number
    /** Index drawn in the accent color (e.g. "now"); others use the muted step. */
    highlight?: number | null
    label: string
  }>(),
  {
    formatValue: (v: number) => v.toLocaleString('en-PH'),
    formatTick: undefined,
    height: 220,
    highlight: null,
  },
)

const M = { top: 20, right: 8, bottom: 28, left: 44 }
const container = useTemplateRef<HTMLDivElement>('container')
const width = useElementWidth(container)
const hover = ref<number | null>(null)

const innerW = computed(() => Math.max(width.value - M.left - M.right, 40))
const innerH = computed(() => props.height - M.top - M.bottom)
const ticks = computed(() => niceTicks(Math.max(...props.data.map((d) => d.value), 0)))
const yMax = computed(() => ticks.value.at(-1)!)
const band = computed(() => innerW.value / Math.max(props.data.length, 1))
const barW = computed(() => Math.min(24, Math.max(band.value - 2, 2)))
const peak = computed(() => {
  let best = 0
  props.data.forEach((d, i) => {
    if (d.value > (props.data[best]?.value ?? 0)) best = i
  })
  return best
})

function y(v: number): number {
  return M.top + innerH.value * (1 - v / yMax.value)
}

const bars = computed(() =>
  props.data.map((d, i) => {
    const cx = M.left + band.value * i + band.value / 2
    const top = y(d.value)
    return {
      ...d,
      cx,
      path: columnPath(cx - barW.value / 2, top, barW.value, M.top + innerH.value - top),
      top,
    }
  }),
)

const stride = computed(() =>
  labelStride(props.data.length, Math.max(2, Math.floor(innerW.value / 44))),
)
const tickText = (v: number) => (props.formatTick ?? props.formatValue)(v)

function barClass(i: number): string {
  if (hover.value === i) return 'fill-brand-700'
  if (props.highlight === null || props.highlight === i) return 'fill-brand-600'
  return 'fill-brand-300'
}
</script>

<template>
  <div ref="container" class="relative w-full select-none">
    <svg :width="width" :height="height" role="img" :aria-label="label" class="block max-w-full">
      <template v-for="t in ticks" :key="t">
        <line
          :x1="M.left"
          :x2="M.left + innerW"
          :y1="y(t)"
          :y2="y(t)"
          class="stroke-charcoal-100"
          stroke-width="1"
        />
        <text
          :x="M.left - 8"
          :y="y(t)"
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-charcoal-400 tabular text-[11px]"
        >
          {{ tickText(t) }}
        </text>
      </template>
      <g v-for="(b, i) in bars" :key="i">
        <path :d="b.path" :class="barClass(i)" class="transition-colors" />
        <!-- Hit target: the full band, taller than the mark. -->
        <rect
          :x="b.cx - band / 2"
          :y="M.top"
          :width="band"
          :height="innerH"
          fill="transparent"
          @pointerenter="hover = i"
          @pointerdown="hover = i"
          @pointerleave="hover = null"
        />
        <text
          v-if="i % stride === 0"
          :x="b.cx"
          :y="height - 8"
          text-anchor="middle"
          class="fill-charcoal-400 text-[11px]"
        >
          {{ b.label }}
        </text>
        <text
          v-if="i === peak && hover === null && b.value > 0"
          :x="b.cx"
          :y="b.top - 6"
          text-anchor="middle"
          class="fill-charcoal-600 tabular text-[11px] font-semibold"
        >
          {{ formatValue(b.value) }}
        </text>
      </g>
    </svg>
    <div
      v-if="hover !== null && bars[hover]"
      class="border-charcoal-100 pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-white px-3 py-2 text-xs whitespace-nowrap shadow-lg"
      :style="{
        left: `${Math.min(Math.max(bars[hover]!.cx, 60), width - 60)}px`,
        top: `${bars[hover]!.top - 6}px`,
      }"
    >
      <p class="text-charcoal-500">{{ bars[hover]!.detail ?? bars[hover]!.label }}</p>
      <p class="text-charcoal-700 tabular font-semibold">{{ formatValue(bars[hover]!.value) }}</p>
    </div>
  </div>
</template>
