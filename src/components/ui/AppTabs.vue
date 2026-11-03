<script setup lang="ts" generic="T extends string">
defineProps<{
  tabs: { value: T; label: string; count?: number }[]
  label: string
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="border-charcoal-100 flex gap-1 overflow-x-auto border-b"
    role="tablist"
    :aria-label="label"
  >
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="model === tab.value"
      class="-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors"
      :class="
        model === tab.value
          ? 'border-brand-600 text-brand-700'
          : 'text-charcoal-400 hover:text-charcoal-600 border-transparent'
      "
      @click="model = tab.value"
    >
      {{ tab.label }}
      <span
        v-if="tab.count !== undefined"
        class="tabular rounded-full px-1.5 text-[11px]"
        :class="
          model === tab.value ? 'bg-brand-100 text-brand-700' : 'bg-charcoal-100 text-charcoal-400'
        "
        >{{ tab.count }}</span
      >
    </button>
  </div>
</template>
