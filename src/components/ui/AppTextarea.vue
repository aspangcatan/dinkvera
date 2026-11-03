<script setup lang="ts">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label: string
    placeholder?: string
    hint?: string
    rows?: number
  }>(),
  { placeholder: '', hint: '', rows: 3 },
)

const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-charcoal-600 text-sm font-medium">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      :rows="rows"
      :placeholder="placeholder"
      class="border-charcoal-200 text-charcoal-700 placeholder-charcoal-300 focus-visible:border-brand-600 focus-visible:outline-brand-600 rounded-lg border bg-white px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-0"
    />
    <p v-if="hint" class="text-charcoal-400 text-xs">{{ hint }}</p>
  </div>
</template>
