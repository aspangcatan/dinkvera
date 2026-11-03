<script setup lang="ts">
import { ArrowRight, Check, X } from '@lucide/vue'
import { computed, ref } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { usePendingPlanRequests } from '@/composables/usePendingPlanRequests'
import { useQuery } from '@/composables/useQuery'
import { decidePlanRequest, listPlanRequests, listPlans } from '@/services/subscriptionService'
import { useToastStore } from '@/stores/toast'
import type { BillingCycle, PlanId, PlanRequest } from '@/types/billing'
import { formatPHP } from '@/utils/currency'
import { formatRelative } from '@/utils/dates'

/**
 * Plan change requests waiting for Sideline. Approving switches the plan
 * today and issues its invoice; decline with a reason they'll see.
 * With `tenantId`, shows only that business and hides itself when empty.
 */
const props = defineProps<{ tenantId?: string }>()
const emit = defineEmits<{ decided: [] }>()

const toast = useToastStore()
const pendingCount = usePendingPlanRequests()
const requests = useQuery(
  () => listPlanRequests({ status: 'pending', tenantId: props.tenantId }),
  [() => props.tenantId],
)
const { data: plans } = useQuery(listPlans)

const list = computed(() => requests.data.value ?? [])
const approving = ref<PlanRequest | null>(null)
const declining = ref<PlanRequest | null>(null)
const reason = ref('')
const busy = ref(false)

function planName(id: PlanId): string {
  return plans.value?.find((p) => p.id === id)?.name ?? id
}

function price(id: PlanId, cycle: BillingCycle): string {
  const plan = plans.value?.find((p) => p.id === id)
  if (!plan) return ''
  return `${formatPHP(cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice)} / ${cycle === 'annual' ? 'year' : 'month'}`
}

function openDecline(r: PlanRequest): void {
  reason.value = ''
  declining.value = r
}

async function decide(r: PlanRequest, approve: boolean): Promise<void> {
  busy.value = true
  try {
    await decidePlanRequest(r.id, approve, approve ? '' : reason.value)
    toast.show(
      approve
        ? `${r.tenantName} is now on ${planName(r.planId)}`
        : `Request from ${r.tenantName} declined`,
    )
    approving.value = null
    declining.value = null
    await Promise.all([requests.refresh(), pendingCount.refresh()])
    emit('decided')
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppCard
    v-if="!tenantId || list.length"
    title="Plan change requests"
    :description="
      tenantId
        ? 'This business asked to switch plan. Approving switches it today and issues its invoice.'
        : 'Businesses asking to switch plan. Approving switches the plan today and issues its invoice (businesses in a free trial are billed when the trial ends).'
    "
    :padded="false"
  >
    <ul v-if="list.length" class="divide-charcoal-100 divide-y">
      <li
        v-for="r in list"
        :key="r.id"
        class="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4"
      >
        <div class="min-w-0 flex-1">
          <RouterLink
            v-if="!tenantId"
            :to="`/admin/tenants/${r.tenantId}`"
            class="text-charcoal-700 font-semibold hover:underline"
            >{{ r.tenantName }}</RouterLink
          >
          <p class="text-charcoal-600 flex flex-wrap items-center gap-1.5 text-sm">
            <span>{{ planName(r.fromPlanId) }} ({{ r.fromBillingCycle }})</span>
            <ArrowRight class="text-charcoal-300 size-3.5" aria-label="to" />
            <span class="text-charcoal-700 font-semibold"
              >{{ planName(r.planId) }} ({{ r.billingCycle }})</span
            >
            <span class="text-charcoal-400">· {{ price(r.planId, r.billingCycle) }}</span>
          </p>
          <p v-if="r.note" class="text-charcoal-500 mt-1 text-sm italic">“{{ r.note }}”</p>
          <p class="text-charcoal-400 mt-1 text-xs">Requested {{ formatRelative(r.createdAt) }}</p>
        </div>
        <div class="flex shrink-0 gap-2">
          <AppButton size="sm" variant="outline" @click="openDecline(r)">
            <X class="size-4" aria-hidden="true" /> Decline
          </AppButton>
          <AppButton size="sm" @click="approving = r">
            <Check class="size-4" aria-hidden="true" /> Approve
          </AppButton>
        </div>
      </li>
    </ul>
    <p v-else class="text-charcoal-400 px-5 py-8 text-center text-sm">No requests waiting.</p>

    <ConfirmDialog
      :open="!!approving"
      :title="`Switch ${approving?.tenantName ?? ''} to ${approving ? planName(approving.planId) : ''}?`"
      :message="`The new plan and billing period start today, and an invoice for ${approving ? price(approving.planId, approving.billingCycle) : ''} is issued (due in 7 days). In a free trial, billing starts when the trial ends instead.`"
      confirm-label="Approve"
      :loading="busy"
      @confirm="approving && decide(approving, true)"
      @cancel="approving = null"
    />

    <AppModal
      :open="!!declining"
      :title="`Decline ${declining?.tenantName ?? ''}'s request?`"
      description="Their plan stays as it is. They'll see your reason on their Subscription page."
      @close="declining = null"
    >
      <AppTextarea
        v-model="reason"
        label="Reason (optional)"
        :rows="3"
        placeholder="e.g. Payment not received yet. Please send it to our GCash."
      />
      <template #actions>
        <AppButton variant="outline" @click="declining = null">Cancel</AppButton>
        <AppButton variant="danger" :loading="busy" @click="declining && decide(declining, false)">
          Decline request
        </AppButton>
      </template>
    </AppModal>
  </AppCard>
</template>
