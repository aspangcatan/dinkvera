<script setup lang="ts">
import { brand } from '@/config/brand'

/**
 * Product wordmark: a court outline mark + "CourtDesk", optionally with
 * "by Sideline" underneath (marketing and sign-in pages).
 */
withDefaults(defineProps<{ tone?: 'light' | 'dark'; showName?: boolean; byline?: boolean }>(), {
  tone: 'dark',
  showName: true,
  byline: false,
})
</script>

<template>
  <span class="inline-flex items-center gap-2.5">
    <svg viewBox="0 0 32 32" class="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" :fill="tone === 'light' ? '#c9e86a' : '#11302a'" />
      <rect
        x="7"
        y="7"
        width="18"
        height="18"
        rx="2"
        fill="none"
        :stroke="tone === 'light' ? '#11302a' : '#c9e86a'"
        stroke-width="2"
      />
      <path d="M16 7v18" :stroke="tone === 'light' ? '#11302a' : '#c9e86a'" stroke-width="2" />
      <circle cx="21" cy="12" r="2.5" :fill="tone === 'light' ? '#11302a' : '#c9e86a'" />
    </svg>
    <span v-if="showName" class="flex flex-col leading-none">
      <span
        class="font-display text-xl font-semibold tracking-wide uppercase"
        :class="tone === 'light' ? 'text-white' : 'text-forest-800'"
        >Court<span :class="tone === 'light' ? 'text-lime-300' : 'text-forest-500'"
          >Desk</span
        ></span
      >
      <span
        v-if="byline"
        class="mt-0.5 text-[10px] font-medium tracking-[0.12em] uppercase"
        :class="tone === 'light' ? 'text-white/55' : 'text-forest-800/55'"
        >by {{ brand.company }}</span
      >
    </span>
  </span>
</template>
