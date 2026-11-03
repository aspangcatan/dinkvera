<script setup lang="ts">
import { ArrowRight } from '@lucide/vue'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { useSectionLink } from '@/composables/useSectionLink'

/**
 * Marketing call-to-action. `primary` (lime) is the one conversion style
 * used across the landing page; `outline` / `outline-light` sit beside it
 * on light and dark backgrounds. A `to` like "/#pricing" scrolls to that
 * home-page section.
 */
const props = withDefaults(
  defineProps<{
    to: string
    variant?: 'primary' | 'outline' | 'outline-light'
    size?: 'md' | 'lg'
    arrow?: boolean
    fullWidth?: boolean
  }>(),
  { variant: 'primary', size: 'md', arrow: false, fullWidth: false },
)

const { goToSection } = useSectionLink()
const sectionId = computed(() => (props.to.startsWith('/#') ? props.to.slice(2) : null))

const variants = {
  primary:
    'bg-ball text-court shadow-[0_8px_24px_-8px_rgba(199,243,107,0.65)] hover:bg-[#d4f78a] active:bg-[#b9ea52]',
  outline: 'border border-court/15 bg-white text-court hover:border-court/30 hover:bg-mist',
  'outline-light': 'border border-white/20 text-white hover:border-white/40 hover:bg-white/10',
}
const sizes = { md: 'h-11 px-5 text-sm', lg: 'h-13 px-7 text-base' }
</script>

<template>
  <component
    :is="sectionId ? 'a' : RouterLink"
    v-bind="sectionId ? { href: to } : { to }"
    class="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-200 hover:-translate-y-px"
    :class="[variants[variant], sizes[size], fullWidth ? 'w-full' : '']"
    @click="sectionId && goToSection($event, sectionId)"
  >
    <slot />
    <ArrowRight
      v-if="arrow"
      class="size-4 transition-transform group-hover:translate-x-0.5"
      aria-hidden="true"
    />
  </component>
</template>
