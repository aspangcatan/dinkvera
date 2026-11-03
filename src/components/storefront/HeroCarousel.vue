<script setup lang="ts">
import { Pause, Play } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { HeroImage } from '@/types/tenant'

/**
 * A business's homepage photo carousel (Settings → Branding), modelled on
 * match-pickleball's: crossfade with a slow zoom, auto-advance, dot
 * navigation and a pause button (WCAG 2.2.2 — anything that moves on its
 * own for more than 5 seconds must be pausable). Auto-advance also pauses
 * on hover/keyboard focus and while the tab is hidden, and is off (no zoom
 * either) under prefers-reduced-motion. Fills its parent; content goes on
 * top through the default slot, over a brand-tinted scrim.
 */
const props = defineProps<{ images: HeroImage[]; businessName: string }>()

const INTERVAL_MS = 5000
const current = ref(0)
const userPaused = ref(false)
const hoverOrFocus = ref(false)
const reducedMotion = ref(false)
const autoplaying = computed(() => !userPaused.value && !reducedMotion.value)
const many = computed(() => props.images.length > 1)
let timer: ReturnType<typeof setInterval> | undefined

// Photos can be added/removed while the preview is open.
watch(
  () => props.images.length,
  (n) => {
    if (current.value >= n) current.value = 0
  },
)

function goTo(index: number): void {
  current.value = (index + props.images.length) % props.images.length
  restartTimer()
}

function restartTimer(): void {
  clearInterval(timer)
  timer = setInterval(() => {
    if (many.value && autoplaying.value && !hoverOrFocus.value && !document.hidden) {
      current.value = (current.value + 1) % props.images.length
    }
  }, INTERVAL_MS)
}

let motionQuery: MediaQueryList | undefined
function onMotionChange(event: MediaQueryListEvent): void {
  reducedMotion.value = event.matches
}
onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = motionQuery.matches
  motionQuery.addEventListener('change', onMotionChange)
  restartTimer()
})
onBeforeUnmount(() => {
  clearInterval(timer)
  motionQuery?.removeEventListener('change', onMotionChange)
})
</script>

<template>
  <section
    class="relative isolate overflow-hidden"
    aria-roledescription="carousel"
    :aria-label="`Photos of ${businessName}`"
    @mouseenter="hoverOrFocus = true"
    @mouseleave="hoverOrFocus = false"
    @focusin="hoverOrFocus = true"
    @focusout="hoverOrFocus = false"
  >
    <div
      v-for="(image, index) in images"
      :key="image.path"
      class="absolute inset-0 -z-20 transition-opacity duration-1000 ease-in-out motion-reduce:transition-none"
      :class="index === current ? 'opacity-100' : 'opacity-0'"
      role="group"
      aria-roledescription="slide"
      :aria-label="`${index + 1} of ${images.length}`"
      :aria-hidden="index !== current"
    >
      <img
        :src="image.url"
        :alt="`${businessName} photo ${index + 1}`"
        :loading="index === 0 ? 'eager' : 'lazy'"
        :fetchpriority="index === 0 ? 'high' : 'low'"
        decoding="async"
        class="h-full w-full object-cover transition-transform ease-out motion-reduce:transform-none motion-reduce:transition-none"
        :class="
          index === current && many ? 'scale-110 duration-[6000ms]' : 'scale-100 duration-1000'
        "
      />
    </div>

    <!-- Brand-tinted scrim: keeps the headline readable on any photo. -->
    <div
      class="from-brand-900/90 via-brand-900/60 pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r to-black/20"
      aria-hidden="true"
    />

    <slot />

    <div
      v-if="many"
      class="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 lg:right-6 lg:left-auto lg:translate-x-0"
    >
      <button
        v-for="(image, index) in images"
        :key="image.path"
        type="button"
        class="h-2 rounded-full transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        :class="index === current ? 'bg-brand-accent w-6' : 'w-2 bg-white/70 hover:bg-white'"
        :aria-label="`Show photo ${index + 1} of ${images.length}`"
        :aria-current="index === current ? 'true' : undefined"
        @click="goTo(index)"
      />
      <button
        v-if="!reducedMotion"
        type="button"
        class="ml-1 flex size-6 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        :aria-label="userPaused ? 'Play slideshow' : 'Pause slideshow'"
        @click="userPaused = !userPaused"
      >
        <Play v-if="userPaused" class="size-3" aria-hidden="true" />
        <Pause v-else class="size-3" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>
