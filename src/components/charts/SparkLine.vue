<script setup lang="ts">
import { computed } from 'vue'

/** Tiny trend line for stat tiles: de-emphasized line, accent end dot. */
const props = defineProps<{ values: number[] }>()

const W = 80
const H = 32
const PAD = 4

const points = computed(() => {
  const max = Math.max(...props.values)
  const min = Math.min(...props.values)
  const span = max - min || 1
  const step = (W - PAD * 2) / Math.max(props.values.length - 1, 1)
  return props.values.map((v, i) => ({
    x: PAD + i * step,
    y: PAD + (H - PAD * 2) * (1 - (v - min) / span),
  }))
})

const path = computed(() => points.value.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '))
const last = computed(() => points.value.at(-1)!)
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" aria-hidden="true">
    <path
      :d="path"
      fill="none"
      class="stroke-charcoal-200"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
    <circle
      :cx="last.x"
      :cy="last.y"
      r="3"
      class="fill-brand-600 stroke-white"
      stroke-width="1.5"
    />
  </svg>
</template>
