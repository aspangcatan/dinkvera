<script setup lang="ts">
import AppButton from './AppButton.vue'
import AppModal from './AppModal.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
    loading?: boolean
  }>(),
  { confirmLabel: 'Confirm', danger: false, loading: false },
)

defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <AppModal :open="open" :title="title" size="sm" @close="$emit('cancel')">
    <p class="text-charcoal-500 text-sm">{{ message }}</p>
    <slot />
    <template #actions>
      <AppButton variant="outline" @click="$emit('cancel')">Cancel</AppButton>
      <AppButton
        :variant="danger ? 'danger' : 'primary'"
        :loading="loading"
        @click="$emit('confirm')"
      >
        {{ confirmLabel }}
      </AppButton>
    </template>
  </AppModal>
</template>
