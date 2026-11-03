<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'

import { useElementWidth } from '@/composables/useElementWidth'
import { labelStride, niceTicks } from '@/utils/chart'

export interface LineSeries {
  name: string
  values: number[]
  /** CSS color (a token var); defaults to the categorical order. */
  color?: string
}

/**
 * Time-series line chart. 2px lines, a 10% area wash for a single series,
 * hairline gridlines on clean ticks, and a crosshair tooltip on hover/tap.
 * One y-axis only — never two scales on one chart.
 */
const props = withDefaults(
  defineProps<{
    labels: string[]
    series: LineSeries[]
    /** Long label per point for the tooltip (defaults to `labels`). */
    tooltipLabels?: string[]
    formatValue?: (v: number) => string
    formatTick?: (v: number) => string
    height?: number
    label: string
  }>(),
  {
    tooltipLabels: undefined,
    formatValue: (v: number) => v.toLocaleString('en-PH'),
    formatTick: undefined,
    height: 240,
  },
)

const DEFAULT_COLORS = ['var(--color-series-1)', 'var(--color-series-2)', 'var(--color-series-3)']
const M = { top: 12, right: 12, bottom: 28, left: 52 }

const container = useTemplateRef<HTMLDivElement>('container')
const width = useElementWidth(container)
const hover = ref<number | null>(null)

const innerW = computed(() => Math.max(width.value - M.left - M.right, 40))
const innerH = computed(() => props.height - M.top - M.bottom)
const count = computed(() => props.labels.length)

const ticks = computed(() => niceTicks(Math.max(...props.series.flatMap((s) => s.values), 0)))
const yMax = computed(() => ticks.value.at(-1)!)

function x(i: number): number {
  return M.left + (count.value <= 1 ? innerW.value / 2 : (i / (count.value - 1)) * innerW.value)
}
function y(v: number): number {
  return M.top + innerH.value * (1 - v / yMax.value)
}

const colored = computed(() =>
  props.series.map((s, i) => ({
    ...s,
    color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]!,
  })),
)

const paths = computed(() =>
  colored.value.map((s) => {
    const line = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
    const area = `${line} L${x(s.values.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
    return { ...s, line, area }
  }),
)

const stride = computed(() => labelStride(count.value, Math.max(2, Math.floor(innerW.value / 70))))
const tickText = (v: number) => (props.formatTick ?? props.formatValue)(v)

function onMove(event: PointerEvent): void {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const px = event.clientX - rect.left - M.left
  const i = Math.round((px / innerW.value) * (count.value - 1))
  hover.value = Math.min(Math.max(i, 0), count.value - 1)
}

const tooltipLeft = computed(() => {
  if (hover.value === null) return 0
  return Math.min(Math.max(x(hover.value), 80), width.value - 80)
})
</script>

<template>
  <div ref="container" class="relative w-full select-none">
    <svg
      :width="width"
      :height="height"
      role="img"
      :aria-label="label"
      class="block max-w-full touch-pan-y"
      @pointermove="onMove"
      @pointerdown="onMove"
      @pointerleave="hover = null"
    >
      <!-- Gridlines + y ticks -->
      <g>
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
      </g>
      <!-- X labels -->
      <g>
        <template v-for="(l, i) in labels" :key="i">
          <text
            v-if="
              i === labels.length - 1 || (i % stride === 0 && labels.length - 1 - i >= stride * 0.6)
            "
            :x="x(i)"
            :y="height - 8"
            text-anchor="middle"
            class="fill-charcoal-400 text-[11px]"
          >
            {{ l }}
          </text>
        </template>
      </g>
      <!-- Area (single series only) + lines -->
      <path
        v-if="paths.length === 1"
        :d="paths[0]!.area"
        :style="{ fill: paths[0]!.color }"
        fill-opacity="0.1"
      />
      <path
        v-for="p in paths"
        :key="p.name"
        :d="p.line"
        fill="none"
        :style="{ stroke: p.color }"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <!-- End dots -->
      <circle
        v-for="p in paths"
        :key="`${p.name}-end`"
        :cx="x(p.values.length - 1)"
        :cy="y(p.values.at(-1) ?? 0)"
        r="4"
        :style="{ fill: p.color }"
        class="stroke-white"
        stroke-width="2"
      />
      <!-- Crosshair -->
      <g v-if="hover !== null">
        <line
          :x1="x(hover)"
          :x2="x(hover)"
          :y1="M.top"
          :y2="M.top + innerH"
          class="stroke-charcoal-300"
          stroke-width="1"
        />
        <circle
          v-for="p in paths"
          :key="`${p.name}-hover`"
          :cx="x(hover)"
          :cy="y(p.values[hover] ?? 0)"
          r="4.5"
          :style="{ fill: p.color }"
          class="stroke-white"
          stroke-width="2"
        />
      </g>
    </svg>

    <div
      v-if="hover !== null"
      class="border-charcoal-100 pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-lg border bg-white px-3 py-2 text-xs shadow-lg"
      :style="{ left: `${tooltipLeft}px` }"
    >
      <p class="text-charcoal-500 mb-1 font-medium">{{ (tooltipLabels ?? labels)[hover] }}</p>
      <p v-for="p in paths" :key="p.name" class="flex items-center justify-between gap-4">
        <span class="text-charcoal-500 flex items-center gap-1.5">
          <span class="size-2 rounded-full" :style="{ background: p.color }" />
          {{ p.name }}
        </span>
        <span class="text-charcoal-700 tabular font-semibold">{{
          formatValue(p.values[hover] ?? 0)
        }}</span>
      </p>
    </div>

    <!-- Legend: only when 2+ series (one series is named by the card title). -->
    <div v-if="paths.length > 1" class="mt-2 flex flex-wrap gap-4 pl-13 text-xs">
      <span v-for="p in paths" :key="p.name" class="text-charcoal-500 flex items-center gap-1.5">
        <span class="h-0.5 w-3 rounded-full" :style="{ background: p.color }" />
        {{ p.name }}
      </span>
    </div>
  </div>
</template>
