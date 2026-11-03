<script setup lang="ts">
import { Search, X } from '@lucide/vue'

withDefaults(defineProps<{ placeholder?: string; label?: string }>(), {
  placeholder: 'Search',
  label: 'Search',
})

const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="relative">
    <Search
      class="text-charcoal-300 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      aria-hidden="true"
    />
    <input
      v-model="model"
      type="search"
      :placeholder="placeholder"
      :aria-label="label"
      class="search-input border-charcoal-200 placeholder-charcoal-300 focus-visible:border-brand-600 focus-visible:outline-brand-600 h-10 w-full rounded-lg border bg-white pr-8 pl-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-0"
    />
    <button
      v-if="model"
      type="button"
      class="text-charcoal-300 hover:text-charcoal-500 absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
      aria-label="Clear search"
      @click="model = ''"
    >
      <X class="size-3.5" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.search-input::-webkit-search-cancel-button {
  display: none;
}
</style>
