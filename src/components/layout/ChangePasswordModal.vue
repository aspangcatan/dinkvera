<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import { changePassword, PASSWORD_MIN_LENGTH, passwordProblem } from '@/services/authService'
import { useToastStore } from '@/stores/toast'

/** Signed-in users change their own password (current one required). */
const props = defineProps<{ open: boolean; email: string }>()
const emit = defineEmits<{ close: [] }>()
const toast = useToastStore()

const form = reactive({ current: '', next: '', confirm: '' })
const errors = reactive({ current: '', next: '', confirm: '' })
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, { current: '', next: '', confirm: '' })
    Object.assign(errors, { current: '', next: '', confirm: '' })
  },
)

// A field's error goes away as soon as it's edited.
watch(
  () => form.current,
  () => (errors.current = ''),
)
watch(
  () => form.next,
  () => (errors.next = ''),
)
watch(
  () => form.confirm,
  () => (errors.confirm = ''),
)

async function submit(): Promise<void> {
  errors.current = form.current ? '' : 'Enter your current password'
  errors.next = passwordProblem(form.next)
  errors.confirm = form.confirm === form.next ? '' : 'The passwords don’t match'
  if (errors.current || errors.next || errors.confirm) return
  saving.value = true
  try {
    await changePassword(props.email, form.current, form.next)
    toast.show('Password changed')
    emit('close')
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not change the password.'
    if (/current password/i.test(message)) errors.current = message
    else errors.next = message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    title="Change password"
    :description="`For ${email}. At least ${PASSWORD_MIN_LENGTH} characters.`"
    size="sm"
    @close="emit('close')"
  >
    <form id="change-password" class="space-y-4" novalidate @submit.prevent="submit">
      <AppInput
        v-model="form.current"
        type="password"
        label="Current password"
        autocomplete="current-password"
        :error="errors.current"
      />
      <AppInput
        v-model="form.next"
        type="password"
        label="New password"
        autocomplete="new-password"
        :error="errors.next"
      />
      <AppInput
        v-model="form.confirm"
        type="password"
        label="Confirm new password"
        autocomplete="new-password"
        :error="errors.confirm"
      />
    </form>
    <template #actions>
      <AppButton variant="outline" @click="emit('close')">Cancel</AppButton>
      <AppButton type="submit" form="change-password" :loading="saving">Change password</AppButton>
    </template>
  </AppModal>
</template>
