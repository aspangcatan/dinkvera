<script setup lang="ts">
import { ArrowLeft, MailCheck } from '@lucide/vue'
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import AuthShell from '@/components/layout/AuthShell.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import { usingSupabase } from '@/config/env'
import { requestPasswordReset } from '@/services/authService'

const route = useRoute()
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const error = ref('')
const sending = ref(false)
const sent = ref(false)

async function submit(): Promise<void> {
  error.value = /^\S+@\S+\.\S+$/.test(email.value.trim()) ? '' : 'Enter the email you sign in with'
  if (error.value) return
  sending.value = true
  try {
    await requestPasswordReset(email.value)
    sent.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not send the email. Try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <AuthShell
    :title="sent ? 'Check your email' : 'Forgot your password?'"
    :description="sent ? '' : 'Enter your email and we’ll send you a link to set a new one.'"
  >
    <div v-if="sent" class="space-y-4" role="status">
      <div class="bg-ball/25 text-court flex gap-3 rounded-2xl p-4 text-sm">
        <MailCheck class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <p>
          If an account exists for <strong>{{ email.trim() }}</strong
          >, we’ve sent a link to reset the password. It works once and expires in an hour. Check
          your spam folder if it doesn’t arrive in a few minutes.
        </p>
      </div>
      <p v-if="!usingSupabase" class="text-ink/55 text-xs">
        Demo mode: no email is sent.
        <RouterLink to="/reset-password" class="text-court-2 font-semibold underline"
          >Open the reset page</RouterLink
        >
        to try it.
      </p>
      <button
        type="button"
        class="text-court-2 text-sm font-semibold underline"
        @click="sent = false"
      >
        Use a different email
      </button>
    </div>

    <form v-else class="space-y-4" novalidate @submit.prevent="submit">
      <AppInput
        v-model="email"
        type="email"
        label="Email"
        autocomplete="email"
        placeholder="you@business.ph"
        :error="error"
      />
      <AppButton type="submit" variant="ball" size="lg" full-width :loading="sending"
        >Send reset link</AppButton
      >
    </form>

    <RouterLink
      to="/login"
      class="text-ink/60 hover:text-court mt-6 inline-flex items-center gap-1 text-sm"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> Back to sign in
    </RouterLink>
  </AuthShell>
</template>
