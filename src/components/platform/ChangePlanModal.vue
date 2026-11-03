<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { changePlan, requestPlanChange } from '@/services/subscriptionService'
import { useToastStore } from '@/stores/toast'
import type { BillingCycle, Plan, PlanId } from '@/types/billing'
import { formatPHP } from '@/utils/currency'
import type { UsageItem } from '@/utils/usage'

/**
 * Pick a plan + billing cycle. A plan whose limits are below current usage
 * can't be chosen (you can't downgrade to 1 location while running 3).
 * `request` mode (businesses): sends a request that Sideline approves;
 * otherwise (platform admins) the plan changes right away.
 */
const props = defineProps<{
  open: boolean
  tenantId: string
  currentPlanId: PlanId
  currentCycle: BillingCycle
  plans: Plan[]
  usage: UsageItem[]
  /** Platform admins may assign hidden (non-public) plans. */
  includePrivate?: boolean
  mode?: 'change' | 'request'
  /** Allow picking the current plan (a trial choosing to stay on it). */
  allowCurrent?: boolean
}>()
const emit = defineEmits<{ close: []; changed: [] }>()
const toast = useToastStore()

const selected = ref<PlanId>(props.currentPlanId)
const cycle = ref<BillingCycle>(props.currentCycle)
const saving = ref(false)
const note = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    selected.value = props.currentPlanId
    cycle.value = props.currentCycle
    note.value = ''
  },
)

const options = computed(() => props.plans.filter((p) => p.isPublic || props.includePrivate))

/** Owners can't pick a coming-soon plan they aren't already on. */
const soon = (plan: Plan) =>
  plan.comingSoon && props.mode === 'request' && plan.id !== props.currentPlanId

function blockers(plan: Plan): string[] {
  return props.usage
    .filter((u) => u.key !== 'bookingsPerMonth')
    .filter((u) => {
      const limit = plan.limits[u.key]
      return limit !== null && u.used > limit
    })
    .map((u) => `${u.used} ${u.label.toLowerCase()} (plan allows ${plan.limits[u.key]})`)
}

const unchanged = computed(
  () =>
    !props.allowCurrent &&
    selected.value === props.currentPlanId &&
    cycle.value === props.currentCycle,
)

async function save(): Promise<void> {
  saving.value = true
  try {
    if (props.mode === 'request') {
      await requestPlanChange(props.tenantId, selected.value, cycle.value, note.value)
      toast.show('Request sent to Sideline')
    } else {
      await changePlan(props.tenantId, selected.value, cycle.value)
      toast.show('Plan updated')
    }
    emit('changed')
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
    :title="mode === 'request' ? 'Request a plan change' : 'Change plan'"
    :description="
      mode === 'request'
        ? 'Once Sideline approves it, your new plan starts and its invoice appears on your Subscription page (during a free trial, billing starts when the trial ends).'
        : ''
    "
    size="lg"
    @close="emit('close')"
  >
    <SegmentedControl
      v-model="cycle"
      label="Billing period"
      :options="[
        { value: 'monthly', label: 'Monthly' },
        { value: 'annual', label: 'Annual (2 months free)' },
      ]"
    />
    <div class="mt-4 space-y-2" role="radiogroup" aria-label="Plan">
      <label
        v-for="plan in options"
        :key="plan.id"
        class="flex items-start gap-3 rounded-xl border p-4 transition-colors"
        :class="[
          selected === plan.id ? 'border-brand-600 bg-brand-50/60' : 'border-charcoal-100',
          blockers(plan).length || soon(plan) ? 'opacity-60' : 'hover:border-charcoal-200',
        ]"
      >
        <input
          v-model="selected"
          type="radio"
          name="plan"
          :value="plan.id"
          :disabled="blockers(plan).length > 0 || soon(plan)"
          class="accent-brand-600 mt-1"
        />
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-charcoal-700 font-semibold">
              {{ plan.name }}
              <span v-if="plan.id === currentPlanId" class="text-brand-700 ml-1 text-xs font-medium"
                >Current</span
              >
              <span v-else-if="plan.comingSoon" class="ml-1 text-xs font-medium text-amber-700"
                >Coming soon</span
              >
            </span>
            <span class="tabular text-charcoal-700 text-sm font-semibold">
              {{ formatPHP(cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice) }}
              <span class="text-charcoal-400 font-normal"
                >/ {{ cycle === 'annual' ? 'year' : 'month' }}</span
              >
            </span>
          </span>
          <span class="text-charcoal-400 block text-sm">{{ plan.description }}</span>
          <span v-if="blockers(plan).length" class="mt-1 block text-xs text-red-700">
            Can't switch: currently using {{ blockers(plan).join(', ') }}.
          </span>
        </span>
      </label>
    </div>
    <AppTextarea
      v-if="mode === 'request'"
      v-model="note"
      class="mt-4"
      label="Message to Sideline (optional)"
      :rows="2"
      placeholder="e.g. We're adding courts next month. We'll pay via GCash."
    />
    <template #actions>
      <AppButton variant="outline" @click="emit('close')">Cancel</AppButton>
      <AppButton :disabled="unchanged" :loading="saving" @click="save">
        {{ mode === 'request' ? 'Send request' : 'Confirm change' }}
      </AppButton>
    </template>
  </AppModal>
</template>
