<script setup lang="ts">
withDefaults(defineProps<{ label?: string; rows?: number }>(), { label: 'Loading', rows: 4 })

const widths = ['92%', '74%', '86%', '60%', '80%', '68%']
</script>

<template>
  <div class="space-y-3 p-5" role="status" :aria-label="label">
    <div
      v-for="n in rows"
      :key="n"
      class="bg-charcoal-100/70 h-4 animate-pulse rounded"
      :style="{ width: widths[n % widths.length] }"
    />
    <span class="sr-only">{{ label }}…</span>
  </div>
</template>
