<script setup lang="ts">
import { ArrowRight, ShieldCheck } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AuthShell from '@/components/layout/AuthShell.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useQuery } from '@/composables/useQuery'
import { usingSupabase } from '@/config/env'
import { listDemoPersonas, type DemoPersona } from '@/services/authService'
import { useSessionStore } from '@/stores/session'
import type { Persona } from '@/types/session'
import { roleLabels } from '@/utils/permissions'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const { data: personas, loading } = useQuery(listDemoPersonas)
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)
const denied = computed(() => route.query.denied === '1')

// Group staff personas by business for the picker.
const byTenant = computed(() => {
  const groups = new Map<string, DemoPersona[]>()
  for (const p of personas.value ?? []) {
    if (!p.tenantName) continue
    groups.set(p.tenantName, [...(groups.get(p.tenantName) ?? []), p])
  }
  return [...groups.entries()]
})
const admin = computed(() => personas.value?.find((p) => p.persona.kind === 'platform_admin'))

function destination(persona: Persona, tenantSlug: string | null): string {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  if (redirect && persona.kind === 'platform_admin') return redirect
  if (redirect && tenantSlug && redirect.startsWith(`/manage/${tenantSlug}`)) return redirect
  return persona.kind === 'platform_admin' ? '/admin' : `/manage/${tenantSlug}`
}

function choose(p: DemoPersona): void {
  session.signIn(p.persona)
  void router.push(destination(p.persona, p.tenantSlug))
}

async function submit(): Promise<void> {
  error.value = ''
  if (!email.value.trim()) {
    error.value = 'Enter your email'
    return
  }
  if (usingSupabase && !password.value) {
    error.value = 'Enter your password'
    return
  }
  submitting.value = true
  try {
    const { persona, tenantSlug } = await session.signInWithPassword(email.value, password.value)
    void router.push(destination(persona, tenantSlug))
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not sign in.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell
    title="Welcome back"
    description="Sign in to manage your courts, bookings and payments."
  >
    <p
      v-if="denied"
      class="mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"
      role="alert"
    >
      That account can't open the page you asked for. Choose another account.
    </p>
    <form class="space-y-5" novalidate @submit.prevent="submit">
      <AppInput
        v-model="email"
        type="email"
        label="Email"
        autocomplete="email"
        placeholder="you@business.ph"
        :error="error"
      />
      <div>
        <AppInput
          v-model="password"
          type="password"
          label="Password"
          autocomplete="current-password"
          :hint="usingSupabase ? '' : 'Any password works in this prototype.'"
        />
        <RouterLink
          :to="{ name: 'forgot-password', query: email.trim() ? { email: email.trim() } : {} }"
          class="text-court-2 hover:text-court mt-2 inline-block text-sm font-semibold hover:underline"
        >
          Forgot password?
        </RouterLink>
      </div>
      <AppButton type="submit" variant="ball" size="lg" full-width :loading="submitting">
        Sign in
        <template #icon-right><ArrowRight class="size-4" aria-hidden="true" /></template>
      </AppButton>
    </form>
    <p class="border-court/10 text-ink/55 mt-8 border-t pt-6 text-sm">
      <template v-if="usingSupabase">
        New to CourtDesk? Our team sets up the account for each business.
        <RouterLink to="/#pricing" class="text-court-2 hover:text-court font-semibold underline"
          >See plans</RouterLink
        >
      </template>
      <template v-else>Demo mode: sign-in is simulated with sample data.</template>
    </p>

    <!-- Demo accounts (mock mode). With real accounts the shell shows its brand panel. -->
    <template v-if="!usingSupabase" #aside>
      <div class="h-full overflow-y-auto px-6 py-10 sm:px-12 lg:py-14 xl:px-16">
        <p
          class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur"
        >
          <span class="bg-ball size-2 rounded-full shadow-[0_0_12px_#c7f36b]" />
          Demo accounts
        </p>
        <h2 class="mt-5 font-sans text-3xl font-extrabold tracking-tight text-white">
          Choose who to sign in as
        </h2>
        <p class="mt-2 text-white/65">
          Sign in as the CourtDesk admin or as one of the demo businesses.
        </p>

        <div v-if="loading" class="mt-8 text-sm text-white/60">Loading accounts…</div>
        <template v-else>
          <button
            v-if="admin"
            type="button"
            class="bg-ball group mt-8 flex w-full items-center gap-4 rounded-2xl p-4 text-left shadow-[0_12px_32px_-12px_rgba(199,243,107,0.6)] transition-transform hover:-translate-y-0.5"
            @click="choose(admin)"
          >
            <span class="bg-court text-ball flex size-11 items-center justify-center rounded-xl">
              <ShieldCheck class="size-5" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="text-court block font-bold">Super Admin</span>
              <span class="text-court/70 block truncate text-sm"
                >{{ admin.persona.name }} · {{ admin.persona.email }}</span
              >
            </span>
            <ArrowRight
              class="text-court size-5 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>

          <div v-for="[tenantName, people] in byTenant" :key="tenantName" class="mt-7">
            <p class="mb-2.5 text-xs font-semibold tracking-[0.12em] text-white/50 uppercase">
              {{ tenantName }}
            </p>
            <div class="grid gap-2.5 sm:grid-cols-2">
              <button
                v-for="p in people"
                :key="p.persona.email"
                type="button"
                class="group flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 text-left ring-1 ring-white/10 backdrop-blur-sm transition-all hover:bg-white/[0.11] hover:ring-white/20"
                @click="choose(p)"
              >
                <UserAvatar :name="p.persona.name" size="sm" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-white">{{
                    p.persona.name
                  }}</span>
                  <span class="block text-xs text-white/55">{{
                    p.persona.kind === 'staff' ? roleLabels[p.persona.role] : ''
                  }}</span>
                </span>
                <ArrowRight
                  class="group-hover:text-ball size-4 text-white/30 transition-colors"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </template>
      </div>
    </template>
  </AuthShell>
</template>
