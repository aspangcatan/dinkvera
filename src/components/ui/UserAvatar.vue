<script setup lang="ts">
import { computed } from 'vue'

import { initials } from '@/utils/format'
import { hashString } from '@/utils/random'

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
})

// Muted, fixed set so avatars stay calm next to status colors.
const TONES = [
  'bg-forest-100 text-forest-700',
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
]

const tone = computed(() => TONES[hashString(props.name) % TONES.length])
const sizeClass = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-12 text-base' }
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
    :class="[tone, sizeClass[size]]"
    aria-hidden="true"
    >{{ initials(name) }}</span
  >
</template>
