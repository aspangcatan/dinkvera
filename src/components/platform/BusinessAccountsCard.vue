<script setup lang="ts">
import { Info, Trash2, UserCheck, UserPlus, UserX } from '@lucide/vue'
import { reactive, ref } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useQuery } from '@/composables/useQuery'
import { usingSupabase } from '@/config/env'
import {
  addAccount,
  listAccounts,
  removeAccount,
  setAccountStatus,
} from '@/services/accountService'
import { useToastStore } from '@/stores/toast'
import type { StaffMember } from '@/types/staff'
import { formatRelative } from '@/utils/dates'

/**
 * The logins that run one business site. Every account has full access
 * (bookings, payments, settings); only platform admins add or remove them.
 */
const props = defineProps<{ tenantId: string }>()

const toast = useToastStore()
const accounts = useQuery(() => listAccounts(props.tenantId), [() => props.tenantId])

const adding = ref(false)
const saving = ref(false)
const form = reactive({ name: '', email: '', phone: '' })
const errors = reactive({ name: '', email: '' })
const removing = ref<StaffMember | null>(null)
const busyId = ref<string | null>(null)

function openAdd(): void {
  Object.assign(form, { name: '', email: '', phone: '' })
  Object.assign(errors, { name: '', email: '' })
  adding.value = true
}

async function submit(): Promise<void> {
  errors.name = form.name.trim() ? '' : 'Enter their name'
  errors.email = /^\S+@\S+\.\S+$/.test(form.email.trim()) ? '' : 'Enter a valid email'
  if (errors.name || errors.email) return
  saving.value = true
  try {
    await addAccount(props.tenantId, { ...form })
    adding.value = false
    toast.show(
      usingSupabase
        ? 'Account added. Create a login with this email in Supabase → Authentication → Users.'
        : 'Account added',
    )
    await accounts.refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

async function toggle(account: StaffMember): Promise<void> {
  busyId.value = account.id
  try {
    const off = account.status !== 'disabled'
    await setAccountStatus(account.id, off ? 'disabled' : 'active')
    toast.show(off ? `${account.name} can no longer sign in` : `${account.name} can sign in again`)
    await accounts.refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    busyId.value = null
  }
}

async function confirmRemove(): Promise<void> {
  const account = removing.value
  if (!account) return
  busyId.value = account.id
  try {
    await removeAccount(account.id)
    toast.show(`${account.name} removed`)
    removing.value = null
    await accounts.refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <AppCard
    title="Business accounts"
    description="Logins that run this business site. Each has full access."
  >
    <template #actions>
      <AppButton size="sm" variant="outline" @click="openAdd">
        <UserPlus class="size-4" aria-hidden="true" /> Add
      </AppButton>
    </template>

    <ul class="divide-charcoal-100 -my-2 divide-y">
      <li v-for="a in accounts.data.value ?? []" :key="a.id" class="flex items-start gap-3 py-3">
        <UserAvatar :name="a.name" size="sm" />
        <div class="min-w-0 flex-1">
          <p class="text-charcoal-700 truncate text-sm font-medium" :title="a.name">
            {{ a.name }}
          </p>
          <p class="text-charcoal-400 truncate text-xs" :title="a.email">{{ a.email }}</p>
          <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge kind="staff" :value="a.status" />
            <span v-if="a.lastActiveAt" class="text-charcoal-400 text-xs">
              Active {{ formatRelative(a.lastActiveAt) }}
            </span>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            class="text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700 rounded-md p-1.5 disabled:opacity-40"
            :disabled="busyId === a.id"
            :aria-label="`${a.status === 'disabled' ? 'Turn on' : 'Turn off'} ${a.name}`"
            :title="a.status === 'disabled' ? 'Turn on (can sign in)' : 'Turn off (can’t sign in)'"
            @click="toggle(a)"
          >
            <UserCheck v-if="a.status === 'disabled'" class="size-4" aria-hidden="true" />
            <UserX v-else class="size-4" aria-hidden="true" />
          </button>
          <button
            :title="`Remove ${a.name}`"
            type="button"
            class="text-charcoal-400 rounded-md p-1.5 hover:bg-red-50 hover:text-red-600"
            :aria-label="`Remove ${a.name}`"
            @click="removing = a"
          >
            <Trash2 class="size-4" aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>
    <p
      v-if="accounts.data.value && !accounts.data.value.length"
      class="text-charcoal-400 py-4 text-center text-sm"
    >
      No accounts yet.
    </p>

    <AppModal
      :open="adding"
      title="Add business account"
      description="This person gets full access to the business: bookings, payments and settings."
      @close="adding = false"
    >
      <form id="add-account" class="space-y-4" @submit.prevent="submit">
        <AppInput v-model="form.name" label="Full name" required :error="errors.name" />
        <AppInput
          v-model="form.email"
          type="email"
          label="Email"
          required
          autocomplete="off"
          :error="errors.email"
          hint="They sign in with this email."
        />
        <AppInput v-model="form.phone" type="tel" label="Mobile number" />
        <p
          v-if="usingSupabase"
          class="bg-charcoal-50 text-charcoal-500 flex gap-2 rounded-lg p-3 text-xs"
        >
          <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          After adding, create a login with the same email in Supabase → Authentication → Users. The
          account switches to Active as soon as that login exists.
        </p>
      </form>
      <template #actions>
        <AppButton variant="outline" @click="adding = false">Cancel</AppButton>
        <AppButton type="submit" form="add-account" :loading="saving">Add account</AppButton>
      </template>
    </AppModal>

    <ConfirmDialog
      :open="!!removing"
      :title="`Remove ${removing?.name ?? ''}?`"
      message="They will no longer be able to sign in to this business. Their past bookings and payments stay."
      confirm-label="Remove"
      danger
      :loading="!!removing && busyId === removing.id"
      @confirm="confirmRemove"
      @cancel="removing = null"
    />
  </AppCard>
</template>
