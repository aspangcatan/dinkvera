<script setup lang="ts">
import { KeyRound, LogOut } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import ChangePasswordModal from '@/components/layout/ChangePasswordModal.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useSessionStore } from '@/stores/session'
import { roleLabels } from '@/utils/permissions'

/** Signed-in user, change password and sign out, at the bottom of a dashboard sidebar. */
const props = defineProps<{ tone: 'platform' | 'tenant' }>()

const session = useSessionStore()
const router = useRouter()
const changingPassword = ref(false)

const roleLabel = computed(() => {
  const p = session.persona
  if (!p) return ''
  return p.kind === 'platform_admin' ? 'Platform admin' : roleLabels[p.role]
})

async function signOut(): Promise<void> {
  await session.signOut()
  void router.push('/login')
}

const dark = computed(() => props.tone === 'platform')
</script>

<template>
  <div
    v-if="session.persona"
    class="flex items-center gap-3 rounded-xl p-2.5"
    :class="dark ? 'bg-white/5' : 'bg-charcoal-50'"
  >
    <UserAvatar :name="session.persona.name" size="sm" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium" :class="dark ? 'text-white' : 'text-charcoal-700'">
        {{ session.persona.name }}
      </p>
      <p class="truncate text-xs" :class="dark ? 'text-forest-300' : 'text-charcoal-400'">
        {{ roleLabel }}
      </p>
    </div>
    <button
      type="button"
      class="rounded-lg p-2"
      :class="
        dark
          ? 'text-forest-300 hover:bg-white/10 hover:text-white'
          : 'text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-600'
      "
      aria-label="Change password"
      title="Change password"
      @click="changingPassword = true"
    >
      <KeyRound class="size-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="-ml-2 rounded-lg p-2"
      :class="
        dark
          ? 'text-forest-300 hover:bg-white/10 hover:text-white'
          : 'text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-600'
      "
      aria-label="Sign out"
      title="Sign out"
      @click="signOut"
    >
      <LogOut class="size-4" aria-hidden="true" />
    </button>
    <ChangePasswordModal
      :open="changingPassword"
      :email="session.persona.email"
      @close="changingPassword = false"
    />
  </div>
</template>
