<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label: string
    description?: string
    disabled?: boolean
  }>(),
  { description: '', disabled: false },
)

const model = defineModel<boolean>({ required: true })
const id = useId()
</script>

<template>
  <div class="flex items-start justify-between gap-4">
    <div class="min-w-0">
      <label :for="id" class="text-charcoal-700 text-sm font-medium">{{ label }}</label>
      <p v-if="description" class="text-charcoal-400 mt-0.5 text-xs">{{ description }}</p>
    </div>
    <button
      :id="id"
      type="button"
      role="switch"
      :aria-checked="model"
      :disabled="disabled"
      class="relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50"
      :class="model ? 'bg-brand-600' : 'bg-charcoal-200'"
      @click="model = !model"
    >
      <span
        class="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform"
        :class="model ? 'translate-x-5' : ''"
      />
    </button>
  </div>
</template>
