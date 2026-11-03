<script setup lang="ts" generic="T extends string | number">
import { useId } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    type?: string
    placeholder?: string
    hint?: string
    error?: string
    required?: boolean
    disabled?: boolean
    autocomplete?: string
    /** Text shown inside the field before the value, e.g. "₱". */
    prefix?: string
    min?: number | string
    max?: number | string
    step?: number | string
    hideLabel?: boolean
  }>(),
  {
    type: 'text',
    placeholder: '',
    hint: '',
    error: '',
    required: false,
    disabled: false,
    autocomplete: undefined,
    prefix: '',
    min: undefined,
    max: undefined,
    step: undefined,
    hideLabel: false,
  },
)

const model = defineModel<T>({ required: true })

const inputId = useId()
const hintId = useId()
const errorId = useId()

const describedBy = () => {
  if (props.error) return errorId
  if (props.hint) return hintId
  return undefined
}

function onInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  model.value = (props.type === 'number' ? (value === '' ? 0 : Number(value)) : value) as T
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="inputId"
      class="text-charcoal-600 text-sm font-medium"
      :class="hideLabel ? 'sr-only' : ''"
    >
      {{ label }}
      <span v-if="required" class="text-red-600" aria-hidden="true">*</span>
    </label>
    <div class="relative">
      <span
        v-if="prefix"
        class="text-charcoal-400 pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm"
        >{{ prefix }}</span
      >
      <input
        :id="inputId"
        :value="model"
        :type="type"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :autocomplete="autocomplete"
        :min="min"
        :max="max"
        :step="step"
        :aria-invalid="!!error"
        :aria-describedby="describedBy()"
        class="border-charcoal-200 text-charcoal-700 placeholder-charcoal-300 focus-visible:border-brand-600 focus-visible:outline-brand-600 disabled:bg-charcoal-50 h-10 w-full rounded-lg border bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed"
        :class="[error ? 'border-red-400' : '', prefix ? 'pl-7' : '']"
        @input="onInput"
      />
    </div>
    <p v-if="hint && !error" :id="hintId" class="text-charcoal-400 text-xs">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="text-xs text-red-600" role="alert">{{ error }}</p>
  </div>
</template>
