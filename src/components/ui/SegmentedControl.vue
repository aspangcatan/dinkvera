<script setup lang="ts" generic="T extends string">
defineProps<{
  options: { value: T; label: string }[]
  label: string
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="bg-charcoal-100/70 inline-flex rounded-lg p-0.5"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="model === option.value"
      class="h-8 rounded-md px-3 text-xs font-semibold whitespace-nowrap transition-colors"
      :class="
        model === option.value
          ? 'text-charcoal-700 bg-white shadow-sm'
          : 'text-charcoal-400 hover:text-charcoal-600'
      "
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
