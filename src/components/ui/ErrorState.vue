<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import AppButton from './AppButton.vue'

defineProps<{ message: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
    <TriangleAlert class="size-8 text-red-500" aria-hidden="true" />
    <p class="text-charcoal-600 text-sm">{{ message }}</p>
    <AppButton variant="outline" size="sm" @click="$emit('retry')">Try again</AppButton>
  </div>
</template>
