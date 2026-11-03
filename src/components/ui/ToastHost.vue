<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, X } from '@lucide/vue'
import { onMounted, useTemplateRef, watch } from 'vue'

import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const icons = { success: CircleCheck, error: CircleAlert, info: Info }
const iconClass = { success: 'text-emerald-400', error: 'text-red-400', info: 'text-sky-300' }

/**
 * Modals are native <dialog>s in the browser's top layer, above any z-index,
 * so the toasts are a popover in that layer too. Re-showing it moves it above
 * whichever dialog opened since; done whenever a new toast arrives.
 */
const host = useTemplateRef<HTMLDivElement>('host')
function bringToFront(): void {
  const el = host.value
  if (!el?.showPopover) return // very old browsers: plain fixed element
  if (el.matches(':popover-open')) el.hidePopover()
  el.showPopover()
}
onMounted(bringToFront)
watch(
  () => toast.toasts.length,
  (now, before) => {
    if (now > before) bringToFront()
  },
)
</script>

<template>
  <div
    ref="host"
    popover="manual"
    class="pointer-events-none fixed inset-x-0 top-auto bottom-4 z-[100] m-0 flex h-auto w-auto flex-col items-center gap-2 overflow-visible border-0 bg-transparent px-4 py-0 sm:right-4 sm:left-auto sm:items-end"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-for="t in toast.toasts"
        :key="t.id"
        class="bg-charcoal-700 text-warm-white pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-xl"
        :role="t.tone === 'error' ? 'alert' : 'status'"
      >
        <component
          :is="icons[t.tone]"
          class="mt-0.5 size-4 shrink-0"
          :class="iconClass[t.tone]"
          aria-hidden="true"
        />
        <p class="min-w-0 flex-1">{{ t.message }}</p>
        <button
          type="button"
          class="text-charcoal-200 -mr-1 rounded p-0.5 hover:text-white"
          aria-label="Dismiss"
          @click="toast.dismiss(t.id)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
