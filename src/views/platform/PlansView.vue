<script setup lang="ts">
import { Pencil } from '@lucide/vue'
import { computed, reactive, ref } from 'vue'

import PlanCard from '@/components/platform/PlanCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useQuery } from '@/composables/useQuery'
import { getPlatformOverview } from '@/services/analyticsService'
import { listPlans, updatePlan } from '@/services/subscriptionService'
import { useToastStore } from '@/stores/toast'
import type { BillingCycle, Plan } from '@/types/billing'

const toast = useToastStore()
const plans = useQuery(listPlans)
const { data: overview } = useQuery(getPlatformOverview)
const cycle = ref<BillingCycle>('monthly')

const tenantsOn = (id: string) => overview.value?.planMix.find((p) => p.planId === id)?.tenants ?? 0

// --- Edit ------------------------------------------------------------------
const editing = ref<Plan | null>(null)
const saving = ref(false)
/** Limits as text so an empty field means "unlimited". */
const form = reactive({
  name: '',
  description: '',
  monthly: 0,
  annual: 0,
  locations: '',
  courts: '',
  bookings: '',
  features: '',
  isPublic: true,
  highlighted: false,
  comingSoon: false,
})

function edit(plan: Plan): void {
  editing.value = plan
  const lim = (v: number | null) => (v === null ? '' : String(v))
  Object.assign(form, {
    name: plan.name,
    description: plan.description,
    monthly: plan.monthlyPrice / 100,
    annual: plan.annualPrice / 100,
    locations: lim(plan.limits.locations),
    courts: lim(plan.limits.courts),
    bookings: lim(plan.limits.bookingsPerMonth),
    features: plan.features.join('\n'),
    isPublic: plan.isPublic,
    highlighted: plan.highlighted,
    comingSoon: plan.comingSoon,
  })
}

const parseLimit = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))))
const invalid = computed(() => !form.name.trim() || form.monthly <= 0 || form.annual <= 0)

async function save(): Promise<void> {
  if (!editing.value || invalid.value) return
  saving.value = true
  try {
    await updatePlan(editing.value.id, {
      name: form.name.trim(),
      description: form.description.trim(),
      monthlyPrice: Math.round(form.monthly * 100),
      annualPrice: Math.round(form.annual * 100),
      limits: {
        locations: parseLimit(form.locations),
        courts: parseLimit(form.courts),
        bookingsPerMonth: parseLimit(form.bookings),
      },
      features: form.features
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean),
      isPublic: form.isPublic,
      highlighted: form.highlighted,
      comingSoon: form.comingSoon,
    })
    toast.show(`${form.name} plan saved`)
    editing.value = null
    await plans.refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Product"
      title="Plans & limits"
      description="Prices and usage limits. Limits are enforced in each business's dashboard."
    >
      <template #actions>
        <SegmentedControl
          v-model="cycle"
          label="Show prices"
          :options="[
            { value: 'monthly', label: 'Monthly' },
            { value: 'annual', label: 'Annual' },
          ]"
        />
      </template>
    </PageHeader>

    <LoadingState v-if="plans.loading.value && !plans.data.value" :rows="6" />
    <div v-else class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <PlanCard v-for="plan in plans.data.value ?? []" :key="plan.id" :plan="plan" :cycle="cycle">
        <template #action>
          <div class="border-charcoal-100 flex items-center justify-between gap-2 border-t pt-4">
            <span class="text-charcoal-400 text-xs">
              {{ tenantsOn(plan.id) }} {{ tenantsOn(plan.id) === 1 ? 'business' : 'businesses' }} ·
              {{ plan.isPublic ? 'Public' : 'Hidden' }}{{ plan.comingSoon ? ' · Coming soon' : '' }}
            </span>
            <AppButton size="sm" variant="outline" @click="edit(plan)">
              <template #icon-left><Pencil class="size-3.5" aria-hidden="true" /></template>
              Edit
            </AppButton>
          </div>
        </template>
      </PlanCard>
    </div>

    <AppModal
      :open="editing !== null"
      :title="`Edit ${editing?.name ?? ''} plan`"
      description="Changes apply to new sign-ups and renewals."
      size="lg"
      @close="editing = null"
    >
      <form id="plan-form" class="grid gap-4 sm:grid-cols-2" novalidate @submit.prevent="save">
        <AppInput v-model="form.name" label="Name" required />
        <div class="grid grid-cols-2 gap-3">
          <AppInput v-model="form.monthly" type="number" label="Monthly" prefix="₱" min="0" />
          <AppInput v-model="form.annual" type="number" label="Annual" prefix="₱" min="0" />
        </div>
        <div class="sm:col-span-2">
          <AppInput v-model="form.description" label="Description" />
        </div>
        <fieldset
          class="border-charcoal-100 grid grid-cols-2 gap-3 rounded-xl border p-4 sm:col-span-2 sm:grid-cols-3"
        >
          <legend class="text-charcoal-600 px-1 text-sm font-medium">
            Limits (blank = unlimited)
          </legend>
          <AppInput v-model="form.locations" type="text" label="Locations" placeholder="∞" />
          <AppInput v-model="form.courts" type="text" label="Courts" placeholder="∞" />
          <AppInput v-model="form.bookings" type="text" label="Bookings / mo" placeholder="∞" />
        </fieldset>
        <div class="sm:col-span-2">
          <AppTextarea v-model="form.features" label="Features" hint="One per line" :rows="5" />
        </div>
        <AppToggle v-model="form.isPublic" label="Show on pricing page" />
        <AppToggle v-model="form.highlighted" label="Mark as most popular" />
        <AppToggle
          v-model="form.comingSoon"
          label="Coming soon"
          description="Stays on the pricing page with a badge; businesses can't request it yet."
        />
      </form>
      <template #actions>
        <AppButton variant="outline" @click="editing = null">Cancel</AppButton>
        <AppButton type="submit" form="plan-form" :disabled="invalid" :loading="saving"
          >Save plan</AppButton
        >
      </template>
    </AppModal>
  </div>
</template>
