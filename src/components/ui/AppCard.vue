<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
    /** Body padding. Off for edge-to-edge content like tables. */
    padded?: boolean
  }>(),
  { title: '', description: '', padded: true },
)
</script>

<template>
  <section
    class="border-charcoal-100 min-w-0 rounded-2xl border bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
  >
    <header
      v-if="title || $slots.header || $slots.actions"
      class="flex flex-wrap items-start justify-between gap-3 px-5 pt-4"
      :class="padded ? '' : 'pb-4'"
    >
      <slot name="header">
        <div class="min-w-0">
          <h2 class="text-charcoal-700 font-sans text-sm font-semibold">{{ title }}</h2>
          <p v-if="description" class="text-charcoal-400 mt-0.5 text-xs">{{ description }}</p>
        </div>
      </slot>
      <div v-if="$slots.actions" class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div :class="padded ? 'p-5' : ''">
      <slot />
    </div>
  </section>
</template>
