<script setup lang="ts">
import { CircleCheck, TriangleAlert } from '@lucide/vue'
import { onMounted, reactive, ref, watch } from 'vue'

import AuthShell from '@/components/layout/AuthShell.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import {
  hasRecoverySession,
  PASSWORD_MIN_LENGTH,
  passwordProblem,
  updatePassword,
} from '@/services/authService'
import { useSessionStore } from '@/stores/session'

/**
 * Opened from the reset email. supabase-js signs the user in from the link;
 * they choose a new password, then sign in again with it.
 */
const session = useSessionStore()
const state = ref<'checking' | 'ready' | 'invalid' | 'done'>('checking')
const form = reactive({ password: '', confirm: '' })
const errors = reactive({ password: '', confirm: '', form: '' })
const saving = ref(false)

// A field's error goes away as soon as it's edited.
watch(
  () => form.password,
  () => (errors.password = ''),
)
watch(
  () => form.confirm,
  () => (errors.confirm = ''),
)

onMounted(async () => {
  state.value = (await hasRecoverySession()) ? 'ready' : 'invalid'
})

async function submit(): Promise<void> {
  errors.password = passwordProblem(form.password)
  errors.confirm = form.confirm === form.password ? '' : 'The passwords don’t match'
  errors.form = ''
  if (errors.password || errors.confirm) return
  saving.value = true
  try {
    await updatePassword(form.password)
    // Start clean: they sign in with the new password.
    await session.signOut()
    state.value = 'done'
  } catch (e) {
    errors.form = e instanceof Error ? e.message : 'Could not update the password.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AuthShell
    :title="state === 'done' ? 'Password updated' : 'Set a new password'"
    :description="state === 'ready' ? `At least ${PASSWORD_MIN_LENGTH} characters.` : ''"
  >
    <LoadingState v-if="state === 'checking'" :rows="2" />

    <div v-else-if="state === 'invalid'" class="space-y-4">
      <div class="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900" role="alert">
        <TriangleAlert class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>This reset link is invalid or has expired. Links work once and only for an hour.</p>
      </div>
      <AppButton to="/forgot-password" variant="ball" size="lg" full-width
        >Send a new link</AppButton
      >
    </div>

    <div v-else-if="state === 'done'" class="space-y-4" role="status">
      <div class="bg-ball/25 text-court flex gap-3 rounded-2xl p-4 text-sm">
        <CircleCheck class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>Your password has been changed. Sign in with your new password.</p>
      </div>
      <AppButton to="/login" variant="ball" size="lg" full-width>Sign in</AppButton>
    </div>

    <form v-else class="space-y-4" novalidate @submit.prevent="submit">
      <AppInput
        v-model="form.password"
        type="password"
        label="New password"
        autocomplete="new-password"
        :error="errors.password"
      />
      <AppInput
        v-model="form.confirm"
        type="password"
        label="Confirm new password"
        autocomplete="new-password"
        :error="errors.confirm"
      />
      <p v-if="errors.form" class="text-sm text-red-600" role="alert">{{ errors.form }}</p>
      <AppButton type="submit" variant="ball" size="lg" full-width :loading="saving"
        >Save new password</AppButton
      >
    </form>
  </AuthShell>
</template>
