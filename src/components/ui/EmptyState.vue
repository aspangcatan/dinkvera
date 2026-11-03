<script setup lang="ts">
import { Inbox } from '@lucide/vue'
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: Component
  }>(),
  {
    description: '',
    icon: () => Inbox,
  },
)
</script>

<template>
  <div class="flex flex-col items-center gap-2 px-6 py-12 text-center">
    <span
      class="bg-charcoal-50 text-charcoal-300 mb-1 flex size-12 items-center justify-center rounded-2xl"
    >
      <component :is="icon" class="size-6" aria-hidden="true" />
    </span>
    <h3 class="text-charcoal-600 font-sans text-sm font-semibold">{{ title }}</h3>
    <p v-if="description" class="text-charcoal-400 max-w-sm text-sm">{{ description }}</p>
    <div v-if="$slots.action" class="mt-2">
      <slot name="action" />
    </div>
  </div>
</template>
