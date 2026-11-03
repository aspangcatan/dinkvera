<script setup lang="ts">
import type { BadgeTone } from '@/types/ui'

withDefaults(
  defineProps<{
    tone?: BadgeTone
    /** Leading status dot. Status badges keep it and always carry a text label. */
    dot?: boolean
  }>(),
  { tone: 'neutral', dot: true },
)

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-charcoal-100 text-charcoal-500',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/15',
  info: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/15',
}

const dotClasses: Record<BadgeTone, string> = {
  neutral: 'bg-charcoal-300',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  brand: 'bg-brand-600',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-transparent ring-inset"
    :class="toneClasses[tone]"
  >
    <span v-if="dot" class="size-1.5 rounded-full" :class="dotClasses[tone]" aria-hidden="true" />
    <slot />
  </span>
</template>
