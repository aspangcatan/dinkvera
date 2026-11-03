<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { useId } from 'vue'

export interface SelectOption {
  value: string
  label: string
}

const props = withDefaults(
  defineProps<{
    label: string
    options: SelectOption[]
    /** First, empty option (e.g. "All locations"). Omit to force a choice. */
    placeholder?: string
    hint?: string
    error?: string
    required?: boolean
    disabled?: boolean
    hideLabel?: boolean
  }>(),
  {
    placeholder: '',
    hint: '',
    error: '',
    required: false,
    disabled: false,
    hideLabel: false,
  },
)

const model = defineModel<string>({ required: true })

const selectId = useId()
const hintId = useId()
const errorId = useId()

const describedBy = () => {
  if (props.error) return errorId
  if (props.hint) return hintId
  return undefined
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="selectId"
      class="text-charcoal-600 text-sm font-medium"
      :class="hideLabel ? 'sr-only' : ''"
    >
      {{ label }}
      <span v-if="required" class="text-red-600" aria-hidden="true">*</span>
    </label>
    <div class="relative">
      <select
        :id="selectId"
        v-model="model"
        :required="required"
        :disabled="disabled"
        :aria-invalid="!!error"
        :aria-describedby="describedBy()"
        class="border-charcoal-200 text-charcoal-700 focus-visible:border-brand-600 focus-visible:outline-brand-600 disabled:bg-charcoal-50 h-10 w-full appearance-none rounded-lg border bg-white pr-9 pl-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-0"
        :class="error ? 'border-red-400' : ''"
      >
        <option v-if="placeholder" value="">{{ placeholder }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <ChevronDown
        class="text-charcoal-400 pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
    </div>
    <p v-if="hint && !error" :id="hintId" class="text-charcoal-400 text-xs">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="text-xs text-red-600" role="alert">{{ error }}</p>
  </div>
</template>
