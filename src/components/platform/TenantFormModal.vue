<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { createTenant } from '@/services/tenantService'
import { useToastStore } from '@/stores/toast'
import type { Plan, PlanId } from '@/types/billing'
import type { Tenant } from '@/types/tenant'

const props = defineProps<{
  open: boolean
  plans: Plan[]
  /** Pre-fills the form, e.g. from a free-trial request. */
  initial?: Partial<Record<'name' | 'ownerName' | 'ownerEmail' | 'phone' | 'city', string>> & {
    /** Trial plan, e.g. the one asked for in a free-trial request. */
    planId?: PlanId
  }
}>()
const emit = defineEmits<{ close: []; created: [tenant: Tenant] }>()
const toast = useToastStore()

const SWATCHES = ['#0f766e', '#c2410c', '#4338ca', '#be123c', '#0369a1', '#7c3aed', '#15803d']

const form = reactive({
  name: '',
  ownerName: '',
  ownerEmail: '',
  phone: '',
  city: '',
  planId: 'starter' as PlanId,
  primary: SWATCHES[0]!,
})
const errors = reactive<Record<string, string>>({})
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.assign(form, {
      name: '',
      ownerName: '',
      ownerEmail: '',
      phone: '',
      city: '',
      planId: 'starter',
      primary: SWATCHES[0],
      ...props.initial,
    })
    Object.keys(errors).forEach((k) => delete errors[k])
  },
)

async function submit(): Promise<void> {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.name.trim()) errors.name = 'Enter the business name'
  if (!form.ownerName.trim()) errors.ownerName = "Enter the owner's name"
  if (!/^\S+@\S+\.\S+$/.test(form.ownerEmail)) errors.ownerEmail = 'Enter a valid email'
  if (Object.keys(errors).length) return
  saving.value = true
  try {
    const tenant = await createTenant({ ...form, name: form.name.trim() })
    toast.show(`${tenant.name} created — invite sent to ${tenant.ownerEmail}`)
    emit('created', tenant)
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    title="Add a business"
    description="Creates the account, starts the free trial (length set in Settings) and invites the owner."
    @close="emit('close')"
  >
    <form id="tenant-form" class="grid gap-4 sm:grid-cols-2" novalidate @submit.prevent="submit">
      <div class="sm:col-span-2">
        <AppInput v-model="form.name" label="Business name" required :error="errors.name" />
      </div>
      <AppInput v-model="form.ownerName" label="Owner name" required :error="errors.ownerName" />
      <AppInput
        v-model="form.ownerEmail"
        type="email"
        label="Owner email"
        required
        :error="errors.ownerEmail"
      />
      <AppInput v-model="form.phone" type="tel" label="Phone" />
      <AppInput v-model="form.city" label="City" />
      <div class="sm:col-span-2">
        <AppSelect
          v-model="form.planId"
          label="Trial plan"
          :options="plans.map((p) => ({ value: p.id, label: p.name }))"
        />
      </div>
      <fieldset class="sm:col-span-2">
        <legend class="text-charcoal-600 mb-2 text-sm font-medium">Brand color</legend>
        <div class="flex flex-wrap gap-2">
          <label v-for="c in SWATCHES" :key="c" class="cursor-pointer">
            <input
              v-model="form.primary"
              type="radio"
              name="swatch"
              :value="c"
              class="peer sr-only"
            />
            <span
              class="peer-checked:ring-charcoal-700 peer-focus-visible:outline-forest-600 block size-8 rounded-full ring-2 ring-transparent ring-offset-2 peer-focus-visible:outline-2"
              :style="{ background: c }"
            />
            <span class="sr-only">{{ c }}</span>
          </label>
        </div>
      </fieldset>
    </form>
    <template #actions>
      <AppButton variant="outline" @click="emit('close')">Cancel</AppButton>
      <AppButton type="submit" form="tenant-form" :loading="saving">Create business</AppButton>
    </template>
  </AppModal>
</template>
