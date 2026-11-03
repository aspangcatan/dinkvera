<script setup lang="ts">
/** Heading block for dashboard pages: eyebrow, title, description and actions. */
defineProps<{
  title: string
  eyebrow?: string
  description?: string
}>()
</script>

<template>
  <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <p
        v-if="eyebrow"
        class="text-charcoal-400 mb-1 text-xs font-semibold tracking-[0.12em] uppercase"
      >
        {{ eyebrow }}
      </p>
      <h1 class="text-charcoal-700 font-sans text-2xl font-semibold tracking-tight">
        {{ title }}
      </h1>
      <p v-if="description || $slots.description" class="text-charcoal-400 mt-1 text-sm">
        <slot name="description">{{ description }}</slot>
      </p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
